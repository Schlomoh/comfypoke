"""GPU side: a headless ComfyUI. Prompts arrive from the UI's gpu_relay node;
ComfyUI's websocket messages, its log lines and the final history entry are
streamed back as (kind, payload) tuples."""
import asyncio
import json
import threading
import time
from pathlib import Path

import modal

from . import comfy, config, volumes
from .app import app

TERMINAL = ("execution_success", "execution_error", "execution_interrupted")
BASE = f"http://127.0.0.1:{config.WORKER_PORT}"


class WorkerUnavailable(RuntimeError):
    """ComfyUI in this container does not answer (a stale container after a deploy)."""


def _error(pid, text, kind):
    return ("json", {"type": "execution_error", "data": {
        "prompt_id": pid, "node_id": None, "node_type": None, "executed": [],
        "exception_message": text, "exception_type": kind, "traceback": [],
        "current_inputs": {}, "current_outputs": {}}})


@app.cls(
    gpu=config.GPU,
    max_containers=1,
    volumes={config.CACHE_DIR: volumes.models, config.IO_DIR: volumes.io},
    secrets=[modal.Secret.from_dict(config.container_env())],
    scaledown_window=config.WORKER_IDLE_SECONDS,
    # No memory/GPU snapshot: the detached ComfyUI process did not survive
    # checkpoint/restore reliably. A plain boot costs ~30 s once per session.
)
@modal.concurrent(max_inputs=8)
class Worker:
    @modal.enter()
    def start(self):
        self.state = modal.Dict.from_name(config.CONTAINER_ENV["COMFY_STATE_DICT"], create_if_missing=True)
        self.since = time.time()
        self.busy = 0
        self.last_input = self.since
        self._beat("starting")
        threading.Thread(target=self._heartbeat, daemon=True).start()
        comfy.launch(config.WORKER_PORT)
        self.log = open(comfy.log_file(config.WORKER_PORT))
        self.log.seek(0, 2)
        self.log_owner = None  # prompt_id of the one run that tails the log (overlapping runs would duplicate lines)
        self.dequeued = set()  # prompt_ids that interrupt() removed from ComfyUI's pending queue
        self._beat("warm")

    # --- heartbeat for the GUI's GPU badge (gpu_relay reads the Dict) ---------------------------------------
    def _beat(self, state=None):
        if state:
            self.state_name = state
        try:
            self.state[config.DEPLOY_ID] = {"state": self.state_name, "since": self.since, "beat": time.time(),
                                    "busy": self.busy, "last_input": self.last_input, "deploy_id": config.DEPLOY_ID}
        except Exception:
            pass  # the badge is informational; never let it break a render

    def _heartbeat(self):
        while True:
            time.sleep(20)
            self._beat()

    @modal.exit()
    def stopped(self):
        self._beat("stopped")

    @modal.method()
    def ping(self):
        """A trivial input: wakes a cold worker or resets the idle window of a warm one."""
        self.last_input = time.time()
        self._beat()
        return config.DEPLOY_ID

    @modal.method()
    def stop(self):
        """Stop taking inputs; the container exits once running jobs finish (the next call boots a fresh one)."""
        import modal.experimental

        modal.experimental.stop_fetching_inputs()
        self._beat("stopping")

    def log_lines(self, pid):
        if self.log_owner is None:
            self.log_owner = pid
        if self.log_owner != pid:
            return []
        return [line.rstrip("\n") for line in self.log.readlines()]

    @modal.method()
    async def run(self, payload: dict):
        import aiohttp

        if payload.get("deploy_id") != config.DEPLOY_ID:
            raise WorkerUnavailable("stale deploy")  # this container predates the UI's deploy; the relay retries once
        pid = payload["prompt_id"]
        cid = f"relay-{pid}"
        payload = {**payload, "client_id": cid}
        self.busy += 1
        self._beat()
        terminal_seen = False
        try:
            await volumes.io.reload.aio()  # pick up images the UI uploaded for this prompt
            for d in ("output", "input", "temp"):
                Path(config.IO_DIR, d).mkdir(exist_ok=True)  # tools/sync.sh clear empties them; an older clear removed them
            inputs = [n["inputs"]["image"] for n in payload["prompt"].values() if n.get("class_type") == "LoadImage"]
            if any(not Path(config.IO_DIR, "input", f).exists() for f in inputs):
                await asyncio.sleep(2)  # the UI's commit can lag a moment behind the upload
                await volumes.io.reload.aio()
            try:
                await asyncio.to_thread(comfy.wait_for_port, config.WORKER_PORT, 120)
            except TimeoutError as e:
                raise WorkerUnavailable(str(e)) from e
            async with aiohttp.ClientSession() as s:
                async with s.ws_connect(f"{BASE}/ws?clientId={cid}") as ws:
                    async with s.get(f"{BASE}/object_info/LoraLoaderModelOnly"):
                        pass  # the extra_models node copies new hand-uploaded files on this request
                    async with s.post(f"{BASE}/prompt", json=payload) as r:
                        res = await r.json()
                        if r.status != 200:
                            yield _error(pid, json.dumps(res.get("error", res)) + "\n" + json.dumps(res.get("node_errors", {})), "ValidationError")
                            return
                    async for m in ws:
                        if m.type == aiohttp.WSMsgType.BINARY:
                            yield ("bytes", m.data)
                            continue
                        if m.type != aiohttp.WSMsgType.TEXT:
                            break
                        msg = json.loads(m.data)
                        d = msg.get("data") or {}
                        lines = self.log_lines(pid)
                        if lines:
                            yield ("log", lines)
                        if pid in self.dequeued:  # the dequeue's status message wakes us; ComfyUI sends nothing else for it
                            self.dequeued.discard(pid)
                            yield ("json", {"type": "execution_interrupted", "data": {"prompt_id": pid, "node_id": None, "node_type": None, "executed": []}})
                            terminal_seen = True
                            break
                        if d.get("prompt_id") not in (None, pid):
                            continue
                        if msg["type"] == "status":
                            d.pop("sid", None)  # the browser would adopt the worker's socket id as its own
                        if msg["type"] == "executed":
                            await volumes.io.commit.aio()  # make the new files visible to the UI container
                        yield ("json", msg)
                        if msg["type"] in TERMINAL and d.get("prompt_id") == pid:
                            terminal_seen = True
                            break
                await volumes.io.commit.aio()
                hist = {}
                if terminal_seen:
                    async with s.get(f"{BASE}/history/{pid}") as r:
                        hist = await r.json()
            lines = self.log_lines(pid)
            if lines:
                yield ("log", lines)
            if not terminal_seen:
                yield _error(pid, "worker websocket closed before the prompt finished", "GPUWorkerError")
            elif pid in hist:
                yield ("history", hist[pid])
        finally:
            if self.log_owner == pid:
                self.log_owner = None
            self.busy -= 1
            self.last_input = time.time()
            self._beat()

    @modal.method()
    async def interrupt(self, prompt_id: str | None = None):
        """One prompt: dequeued if pending, interrupted if running. No id: interrupt whatever runs."""
        import aiohttp

        async with aiohttp.ClientSession() as s:
            if prompt_id:
                async with s.get(f"{BASE}/queue") as r:
                    pending = [item[1] for item in (await r.json())["queue_pending"]]
                if prompt_id in pending:
                    self.dequeued.add(prompt_id)
                    async with s.post(f"{BASE}/queue", json={"delete": [prompt_id]}):
                        pass
                    return
            async with s.post(f"{BASE}/interrupt", json={"prompt_id": prompt_id} if prompt_id else {}):
                pass
