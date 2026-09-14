"""Acceptance test against the deployed UI: auth, websocket, uploaded-model
listing, one small render, a second render that loads the uploaded model on the
now-warm worker, two renders queued back to back from two tabs, and three that
are cancelled (running, pending, pending via the legacy queue route). Exit code
0 when every check passes. The renders cost
cents; their seeds are random so ComfyUI's cache cannot skip them on a rerun.

    uv run tools/check.py                run all checks
    uv run tools/check.py --stop-stale   first stop containers whose ComfyUI does not answer (needs modal CLI)
    options: --url https://...  (default: the deployed UI)
"""
import argparse
import asyncio
import json
import random
import subprocess
import sys
import tempfile
import time
import uuid

import aiohttp

from render import MODAL, REPO, config, default_url, turbo_prompt

# `modal container exec` does not propagate exit codes, so the probe prints its verdict.
PROBE = "import socket; print('alive' if any(socket.socket().connect_ex(('127.0.0.1', p)) == 0 for p in (%d, %d)) else 'dead')" % (
    config.WORKER_PORT, config.UI_PORT)
RESULTS = []
TERMINAL = ("execution_success", "execution_error", "execution_interrupted")
DUMMY_LORA = f"check_dummy_{uuid.uuid4().hex[:8]}.safetensors"  # a new name each run, so a stale volume view cannot pass


def check(name, ok, info=""):
    RESULTS.append((name, bool(ok), info))
    return ok


def stop_stale():
    """A worker from the previous deploy can linger and catch the first call."""
    containers = json.loads(subprocess.run([MODAL, "container", "list", "--json"], capture_output=True, text=True, check=True).stdout)
    for c in containers:
        if c["app_name"] != config.APP_NAME:
            continue
        out = subprocess.run([MODAL, "container", "exec", "--no-pty", c["container_id"], "--", "python", "-c", PROBE],
                             capture_output=True, text=True).stdout
        alive = "alive" in out
        print(f"container {c['container_id']}: {'alive' if alive else 'dead, stopping'}")
        if not alive:
            subprocess.run([MODAL, "container", "stop", "--yes", c["container_id"]])  # exits 1 when it stopped by itself meanwhile


async def wait_until_serving(url, timeout=180):
    """A cold UI container answers 5xx through Modal's proxy until ComfyUI is up."""
    deadline = time.time() + timeout
    async with aiohttp.ClientSession() as s:
        while time.time() < deadline:
            try:
                async with s.get(f"{url}/") as r:
                    if r.status < 500:
                        return
            except aiohttp.ClientError:
                pass
            await asyncio.sleep(3)
    raise TimeoutError(f"{url} still not serving after {timeout}s")


async def check_unauthenticated(url):
    await wait_until_serving(url)
    async with aiohttp.ClientSession() as s:
        async with s.get(f"{url}/") as r:
            check("unauthenticated GET / is 401", r.status == 401, str(r.status))
        async with s.get(f"{url}/ws") as r:
            check("unauthenticated GET /ws is 401", r.status == 401, str(r.status))
        async with s.post(f"{url}/api/prompt", json={"prompt": {}}) as r:
            check("unauthenticated POST /api/prompt is 401", r.status == 401, str(r.status))


async def check_websocket(s, url):
    # Browsers always request permessage-deflate; Modal's proxy drops compressed frames.
    async with s.ws_connect(f"{url}/ws?clientId={uuid.uuid4()}", compress=15) as ws:
        got_status = False
        deadline = time.time() + 3
        while time.time() < deadline:
            try:
                m = await ws.receive(timeout=deadline - time.time())
            except asyncio.TimeoutError:
                break
            if m.type == aiohttp.WSMsgType.TEXT and json.loads(m.data).get("type") == "status":
                got_status = True
            elif m.type in (aiohttp.WSMsgType.CLOSE, aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                break
        check("websocket (deflate requested) open after 3 s", not ws.closed, f"closed={ws.closed} code={ws.close_code}")
        check("websocket received a status message", got_status)


def dummy_safetensors() -> bytes:
    """One float32 tensor that matches no model key: loads as a LoRA, patches nothing."""
    header = json.dumps({"check": {"dtype": "F32", "shape": [1], "data_offsets": [0, 4]}}).encode()
    return len(header).to_bytes(8, "little") + header + bytes(4)


async def check_extra_models(s, url):
    """A file put on the models volume is in the LoRA dropdown at once, no container restart."""
    async with s.get(f"{url}/api/object_info/LoraLoaderModelOnly") as r:
        names = (await r.json()).get("LoraLoaderModelOnly", {}).get("input", {}).get("required", {}).get("lora_name", [[]])[0]
    check("/object_info lists a LoRA uploaded to the volume right away", DUMMY_LORA in names, f"{r.status} {names}")


async def check_render(s, url, timeout, lora=None):
    cid = str(uuid.uuid4())
    seed = random.randrange(1 << 32)
    prompt = turbo_prompt("a red apple on a wooden table, studio photo", seed, f"check/turbo_{seed}")
    tag = ""
    if lora:  # between the sampling patch and the sampler, like the GUI would wire it
        prompt["11"] = {"class_type": "LoraLoaderModelOnly", "inputs": {"model": ["4", 0], "lora_name": lora, "strength_model": 1.0}}
        prompt["8"]["inputs"]["model"] = ["11", 0]
        tag = " (uploaded LoRA, warm worker)"
    seen, image = set(), None
    async with s.ws_connect(f"{url}/ws?clientId={cid}") as ws:
        async with s.post(f"{url}/api/prompt", json={"prompt": prompt, "client_id": cid}) as r:
            res = await r.json()
            pid = res.get("prompt_id")
            if not check("POST /api/prompt accepted" + tag, r.status == 200 and pid, f"{r.status} {res}"):
                return
        async with s.get(f"{url}/api/jobs?status=in_progress") as r:
            jobs = [j for j in (await r.json()).get("jobs", []) if j.get("id") == pid]
        check("/api/jobs shows the job in_progress with create_time" + tag, jobs and jobs[0].get("create_time"), json.dumps(jobs))
        deadline = time.time() + timeout
        while time.time() < deadline:
            try:
                m = await ws.receive(timeout=deadline - time.time())
            except asyncio.TimeoutError:
                break
            if m.type != aiohttp.WSMsgType.TEXT:
                continue
            msg = json.loads(m.data)
            d = msg.get("data") or {}
            if d.get("prompt_id") not in (None, pid):
                continue
            seen.add(msg["type"])
            if msg["type"] == "executed":
                image = (d.get("output") or {}).get("images", [None])[0]
            if msg["type"] == "execution_error":
                print("execution_error:", d.get("exception_message"))
            if msg["type"] in TERMINAL:
                break
    check("progress message arrived" + tag, "progress" in seen, str(sorted(seen)))
    check("executed message arrived with an image" + tag, image is not None)
    check("execution_success arrived" + tag, "execution_success" in seen, str(sorted(seen)))
    for _ in range(20):  # execution_success is broadcast before the relay files the job in history (commit + history fetch first)
        async with s.get(f"{url}/api/history/{pid}") as r:
            hist = (await r.json()).get(pid) or {}
        if (hist.get("status") or {}).get("status_str") == "success":
            break
        await asyncio.sleep(0.5)
    check("/history has the job with status success" + tag, (hist.get("status") or {}).get("status_str") == "success", json.dumps(hist.get("status")))
    async with s.get(f"{url}/api/jobs?status=completed") as r:
        jobs = [j for j in (await r.json()).get("jobs", []) if j.get("id") == pid]
    check("/api/jobs lists it completed with outputs_count 1" + tag, jobs and jobs[0].get("outputs_count") == 1, json.dumps(jobs))
    if image:
        async with s.get(f"{url}/api/view", params={"filename": image["filename"], "subfolder": image["subfolder"], "type": "output"}) as r:
            body = await r.read()
        check("GET /api/view returns a PNG" + tag, r.status == 200 and body[:8] == b"\x89PNG\r\n\x1a\n", f"{r.status} {len(body)} bytes")


def small_prompt(steps=4, size=512) -> dict:
    seed = random.randrange(1 << 32)
    prompt = turbo_prompt("a red apple on a wooden table, studio photo", seed, f"check/turbo_{seed}")
    prompt["7"]["inputs"].update(width=size, height=size)
    prompt["8"]["inputs"]["steps"] = steps
    return prompt


async def submit(s, url, prompt, cid=None):
    async with s.post(f"{url}/api/prompt", json={"prompt": prompt, "client_id": cid or str(uuid.uuid4())}) as r:
        return (await r.json()).get("prompt_id")


async def collect(ws, pids, timeout, hook=None):
    """Read one websocket until every prompt in pids reached a terminal message.
    Returns (type, prompt_id) in arrival order; hook(type, prompt_id) is awaited for each."""
    events, left = [], set(pids)
    deadline = time.time() + timeout
    while left and time.time() < deadline:
        try:
            m = await ws.receive(timeout=deadline - time.time())
        except asyncio.TimeoutError:
            break
        if m.type != aiohttp.WSMsgType.TEXT:
            continue
        msg = json.loads(m.data)
        pid = (msg.get("data") or {}).get("prompt_id")
        if pid not in pids:
            continue
        events.append((msg["type"], pid))
        if hook:
            await hook(msg["type"], pid)
        if msg["type"] in TERMINAL:
            left.discard(pid)
    return events


async def history(s, url, pids):
    async with s.get(f"{url}/api/history") as r:
        hist = await r.json()
    return {p: ((hist.get(p) or {}).get("status") or {}).get("status_str") for p in pids}


async def check_concurrent(s, url, timeout):
    """Two tabs queue back to back: the worker runs them in submission order and both tabs see both."""
    cids = [str(uuid.uuid4()) for _ in range(2)]
    async with s.ws_connect(f"{url}/ws?clientId={cids[0]}") as ws1, s.ws_connect(f"{url}/ws?clientId={cids[1]}") as ws2:
        pids = [await submit(s, url, small_prompt(), cid) for cid in cids]
        if not check("two prompts from two tabs queued back to back", all(pids), str(pids)):
            return
        ev1, ev2 = await asyncio.gather(collect(ws1, pids, timeout), collect(ws2, pids, timeout))
    for tab, ev in (("tab 1", ev1), ("tab 2", ev2)):
        check(f"{tab}: execution_start order matches submission order", [p for t, p in ev if t == "execution_start"] == pids, str(ev))
        check(f"{tab}: executed and execution_success arrived for both prompts",
              all((t, p) in ev for t in ("executed", "execution_success") for p in pids), str(ev))
    hist = await history(s, url, pids)
    check("/history has both with status success", all(v == "success" for v in hist.values()), json.dumps(hist))


async def check_cancel(s, url, timeout):
    """One render is interrupted once it runs; two queued behind it are cancelled while pending on
    the worker, one through /api/jobs/{id}/cancel and one through the legacy POST /queue delete."""
    async with s.ws_connect(f"{url}/ws?clientId={uuid.uuid4()}") as ws:
        pids = [await submit(s, url, small_prompt(steps, 1024)) for steps in (20, 4, 4)]  # the first runs long enough to be interrupted
        if not check("three prompts queued for the cancel checks", all(pids), str(pids)):
            return
        running, pending, legacy = pids
        async with s.post(f"{url}/api/jobs/{pending}/cancel") as r:
            res = await r.json()
            check("POST /api/jobs/{id}/cancel on a pending job answers cancelled", r.status == 200 and res.get("cancelled") is True, f"{r.status} {res}")
        async with s.post(f"{url}/api/queue", json={"delete": [legacy]}) as r:
            check("legacy POST /queue delete on a pending job is 200", r.status == 200, str(r.status))

        async def interrupt(kind, pid):
            if kind == "execution_start" and pid == running:
                async with s.post(f"{url}/api/interrupt", json={"prompt_id": pid}) as r:
                    check("POST /interrupt with the running prompt_id is 200", r.status == 200, str(r.status))

        ev = await collect(ws, pids, timeout, interrupt)
    for name, pid in (("interrupted while running", running), ("cancelled via /api/jobs/{id}/cancel while pending", pending),
                      ("cancelled via legacy /queue delete while pending", legacy)):
        check(f"{name}: execution_interrupted arrived and no execution_success",
              ("execution_interrupted", pid) in ev and ("execution_success", pid) not in ev, str([e for e in ev if e[1] == pid]))
    hist = await history(s, url, pids)
    check("/history shows all three as error", all(v == "error" for v in hist.values()), json.dumps(hist))
    for _ in range(20):  # the job leaves currently_running a moment after its terminal message
        async with s.get(f"{url}/api/jobs?status=in_progress") as r:
            stuck = [j["id"] for j in (await r.json()).get("jobs", []) if j.get("id") in pids]
        if not stuck:
            break
        await asyncio.sleep(0.5)
    check("/api/jobs shows none of them in_progress afterwards", not stuck, str(stuck))


async def check_logs(s, url):
    async with s.get(f"{url}/internal/logs/raw") as r:
        entries = (await r.json()).get("entries", [])
    check("a [gpu] line is in /internal/logs/raw", any("[gpu]" in e.get("m", "") for e in entries), f"{len(entries)} entries")


async def main(url, timeout):
    key = (REPO / config.ACCESS_KEY_FILE).read_text().strip()
    await check_unauthenticated(url)
    with tempfile.NamedTemporaryFile(suffix=".safetensors") as f:
        f.write(dummy_safetensors())
        f.flush()
        subprocess.run([MODAL, "volume", "put", "--force", config.VOLUME_MODELS, f.name, f"extra/loras/{DUMMY_LORA}"], check=True, capture_output=True)
    try:
        async with aiohttp.ClientSession(cookies={"comfy_key": key}) as s:
            await check_websocket(s, url)
            await check_extra_models(s, url)
            await check_render(s, url, timeout)
            await check_render(s, url, timeout, lora=DUMMY_LORA)
            await check_concurrent(s, url, timeout)
            await check_cancel(s, url, timeout)
            await check_logs(s, url)
    finally:
        subprocess.run([MODAL, "volume", "rm", config.VOLUME_MODELS, f"extra/loras/{DUMMY_LORA}"], check=True, capture_output=True)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--url", default=None)
    ap.add_argument("--stop-stale", action="store_true")
    ap.add_argument("--timeout", type=float, default=900, help="seconds to wait for the render (cold worker: a few minutes)")
    a = ap.parse_args()
    if a.stop_stale:
        stop_stale()
    asyncio.run(main((a.url or default_url()).rstrip("/"), a.timeout))
    for name, ok, info in RESULTS:
        print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  ({info})" if info and not ok else ""))
    failed = [r for r in RESULTS if not r[1]]
    print(f"{len(RESULTS) - len(failed)}/{len(RESULTS)} passed")
    sys.exit(1 if failed else 0)
