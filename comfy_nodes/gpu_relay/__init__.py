"""Run prompts on a separate Modal GPU worker while this (CPU) container only
serves the GUI.

Active only when COMFY_RELAY=1. Intercepts POST /prompt, validates the graph
locally (so node errors still show in the GUI), registers the prompt in this
server's own queue so the queue panel and history behave normally, then
streams the worker's websocket messages (progress, previews, executed,
errors) to every connected browser. Outputs land on the shared /io volume; it
is reloaded before each 'executed' message so /view can serve the new files.
Interrupt, job-cancel and legacy queue-delete requests are forwarded to the
worker as well. A worker that sends nothing for COMFY_WORKER_TIMEOUT seconds is interrupted and
the job is failed. /gpu/status, /gpu/wake, /gpu/keep_warm and /gpu/stop back the GPU badge in the
GUI (js/gpu_status.js): the worker's heartbeat lives in a Modal Dict.
"""
import asyncio
import json
import logging
import os
import time
import uuid

from aiohttp import web

import execution
from comfy_execution.jobs import validate_job_id
from server import PromptServer

server = PromptServer.instance
TERMINAL = ("execution_success", "execution_error", "execution_interrupted")
_dispatch = asyncio.Lock()  # Worker.run calls start in submission order; the streams overlap once started
_cancelled = set()  # prompt_ids cancelled while their Worker.run call was still in flight: the cancel is re-sent once the worker has the prompt


def _basic_password(request) -> str:
    import base64

    auth = request.headers.get("Authorization", "")
    try:
        return base64.b64decode(auth[6:]).decode().split(":", 1)[1] if auth.startswith("Basic ") else ""
    except Exception:
        return ""


def _worker():
    import modal

    return modal.Cls.from_name(APP, "Worker")()


def _error(prompt_id, text):
    return {
        "prompt_id": prompt_id, "node_id": None, "node_type": None, "executed": [],
        "exception_message": text, "exception_type": "GPUWorkerError",
        "traceback": [], "current_inputs": {}, "current_outputs": {},
    }


def _running():
    """prompt_ids of relayed jobs; all sit in currently_running, the worker queues internally."""
    q = server.prompt_queue
    with q.mutex:
        return [item[1] for item in q.currently_running.values()]


def _finish(item_id, hist, messages):
    """Move the job to history. Idempotent and never raises: the except path calls it too."""
    q = server.prompt_queue
    try:
        with q.mutex:
            if item_id not in q.currently_running:
                return
            assert len(q.currently_running[item_id]) == 6, "ComfyUI changed its queue item layout"
            st = (hist or {}).get("status") or {"status_str": "error", "completed": False, "messages": messages}
            status = execution.PromptQueue.ExecutionStatus(st["status_str"], st["completed"], st["messages"])
            result = {"outputs": (hist or {}).get("outputs", {}), "meta": (hist or {}).get("meta", {})}
            q.task_done(item_id, result, status, process_item=lambda item: item[:5])  # history keeps 5 fields
    except Exception:
        logging.exception("gpu_relay: could not finish job %s", item_id)


def _unavailable(e):
    """A stale worker container (WorkerUnavailable, possibly undeserializable here) or a lost Modal connection."""
    import modal

    return "WorkerUnavailable" in (type(e).__name__ + str(e)) or isinstance(e, modal.exception.ConnectionError)


async def _messages(payload):
    gen = _worker().run.remote_gen.aio(payload)
    try:
        async with _dispatch:  # the worker yields nothing before its own POST /prompt returned, so the next call finds this one queued there
            first = await asyncio.wait_for(anext(gen, None), TIMEOUT)
        if payload["prompt_id"] in _cancelled:
            await _worker().interrupt.remote.aio(payload["prompt_id"])
        while first is not None:
            yield first
            first = await asyncio.wait_for(anext(gen, None), TIMEOUT)
    except asyncio.TimeoutError:
        try:
            await _worker().interrupt.remote.aio(payload["prompt_id"])  # best effort: the worker may be wedged
        except Exception:
            logging.exception("gpu_relay: could not interrupt prompt %s after the timeout", payload["prompt_id"])
        raise TimeoutError(f"worker did not respond for {TIMEOUT} s")


async def _stream(payload, io_vol):
    hist = None
    async for kind, msg in _messages(payload):
        if kind == "bytes":
            for ws in list(server.sockets.values()):
                await ws.send_bytes(msg)
        elif kind == "json":
            if msg["type"] == "status":
                continue  # our own queue_updated() reports queue state
            if msg["type"] == "executed" or msg["type"] in TERMINAL:
                await asyncio.to_thread(io_vol.reload)
            await server.send_json(msg["type"], msg.get("data"))  # broadcast
        elif kind == "log":
            for line in msg:
                logging.info("[gpu] %s", line)  # lands in the GUI's logs panel
        elif kind == "history":
            hist = msg
    return hist


async def _relay(item_id, prompt_id, payload):
    try:
        import modal

        io_vol = modal.Volume.from_name(IO_VOLUME)
        await asyncio.to_thread(io_vol.commit)  # uploaded input images must reach the worker
        for attempt in (1, 2):
            try:
                hist = await _stream(payload, io_vol)
                break
            except Exception as e:
                if attempt == 2 or not _unavailable(e):
                    raise
                logging.warning("gpu_relay: worker unavailable (%r), retrying once", e)
                await asyncio.sleep(3)  # give Modal a moment to route the retry to a fresh container
        _finish(item_id, hist, [])
    except Exception as e:  # worker crash, spin-up failure, lost connection
        logging.exception("gpu_relay: prompt %s failed", prompt_id)
        try:
            await server.send_json("execution_error", _error(prompt_id, f"GPU worker: {e!r}"))
        finally:
            _finish(item_id, None, [f"GPU worker: {e!r}"])  # never leave the job stuck as running
    _cancelled.discard(prompt_id)


async def _cancel(prompt_ids):
    ids = [p for p in prompt_ids if p in _running()]
    _cancelled.update(ids)
    for p in ids:
        await _worker().interrupt.remote.aio(p)
    return web.json_response({"cancelled": bool(ids)})  # the stock route's shape


@web.middleware
async def _relay_middleware(request, handler):
    path = request.path.removeprefix("/api")
    cancel = path.startswith("/jobs/") and path.endswith("/cancel")
    if request.method != "POST" or not (path in ("/prompt", "/interrupt", "/queue") or cancel):
        return await handler(request)
    if KEY and request.cookies.get("comfy_key") != KEY and _basic_password(request) != KEY:
        raise web.HTTPUnauthorized(text="missing or wrong key")  # custom nodes load in listdir order; access_key may run after us
    try:
        body = await request.json()
    except json.JSONDecodeError:
        body = {}
    if path == "/prompt":
        if "prompt" not in body:
            return await handler(request)
        prompt = body["prompt"]
        if body.get("prompt_id") is None:
            prompt_id = str(uuid.uuid4())
        else:
            try:
                prompt_id = validate_job_id(body["prompt_id"])
            except ValueError:
                error = {"type": "invalid_prompt_id", "message": "prompt_id must be a valid UUID",
                         "details": "prompt_id must be a UUID string in canonical lowercase hyphenated form; omit it to let the server generate one",
                         "extra_info": {}}
                return web.json_response({"error": error, "node_errors": {}}, status=400)
        server.node_replace_manager.apply_replacements(prompt)
        valid = await execution.validate_prompt(prompt_id, prompt, body.get("partial_execution_targets"))
        if not valid[0]:
            return web.json_response({"error": valid[1], "node_errors": valid[3]}, status=400)
        extra_data = dict(body.get("extra_data") or {})
        if "client_id" in body:
            extra_data["client_id"] = body["client_id"]
        sensitive = {k: extra_data.pop(k) for k in execution.SENSITIVE_EXTRA_DATA_KEYS if k in extra_data}  # like stock post_prompt: kept out of history and /jobs
        extra_data["create_time"] = int(time.time() * 1000)  # the jobs panel's schema requires it
        q = server.prompt_queue
        with q.mutex:
            number = server.number
            server.number += 1
            item_id = q.task_counter
            q.task_counter += 1
            q.currently_running[item_id] = (number, prompt_id, prompt, extra_data, valid[2], sensitive)
        server.queue_updated()
        payload = {**body, "prompt_id": prompt_id, "number": number, "deploy_id": DEPLOY_ID}
        asyncio.get_running_loop().create_task(_relay(item_id, prompt_id, payload))
        return web.json_response({"prompt_id": prompt_id, "number": number, "node_errors": valid[3]})
    if path == "/interrupt":
        await _worker().interrupt.remote.aio(body.get("prompt_id"))  # no id: whatever runs, like stock ComfyUI
        return web.Response(status=200)
    if path == "/queue":  # the stock handler only searches its pending list; relayed jobs sit in currently_running
        await _cancel(_running() if body.get("clear") else body.get("delete") or [])
        return await handler(request)
    if path == "/jobs/cancel":
        if not isinstance(body.get("job_ids"), list):
            return web.json_response({"error": "job_ids must be a list"}, status=400)
        return await _cancel(body["job_ids"])
    return await _cancel([path.split("/")[2]])


# ---- GPU badge: status and timed controls (the worker publishes a heartbeat into a Modal Dict) ----------

_keep = {"until": 0.0, "task": None}
_waking = {"until": 0.0}  # a ping is in flight: show "starting" until the heartbeat says warm


async def _worker_state():
    import modal

    try:
        d = modal.Dict.from_name(STATE_DICT, create_if_missing=True)
        return await d.get.aio(DEPLOY_ID) or {}  # keyed by deploy: the previous deploy's container keeps beating until it idles out
    except Exception:
        logging.exception("gpu_relay: could not read the worker state")
        return {}


async def _status():
    w = await _worker_state()
    now = time.time()
    fresh = w and now - w.get("beat", 0) < 60 and w.get("state") in ("starting", "warm") and w.get("deploy_id") == DEPLOY_ID
    running = len(_running())
    if running or (fresh and w.get("busy")):
        state = "busy"
    elif fresh:
        state = w["state"]
    elif now < _waking["until"] or running:
        state = "starting"
    else:
        state = "cold"
    idle = now - w.get("last_input", now) if state == "warm" else 0
    return {
        "state": state, "running": running,
        "idle_seconds": int(idle), "idle_limit": IDLE, "idles_in": max(0, int(IDLE - idle)) if state == "warm" else None,
        "keep_warm_until": _keep["until"] if _keep["until"] > now else None,
        "session_seconds": int(now - w["since"]) if fresh else 0,
        "session_cost": round((now - w["since"]) / 3600 * RATE, 3) if fresh else 0, "rate_per_hour": RATE, "gpu": GPU,
    }


async def _ping():
    _waking["until"] = time.time() + 180
    try:
        await _worker().ping.remote.aio()
    except Exception:
        logging.exception("gpu_relay: ping failed")
    finally:
        _waking["until"] = 0


async def _keep_warm_loop():
    while time.time() < _keep["until"]:
        await _ping()
        await asyncio.sleep(max(60, IDLE - 90))  # inside the idle window, so the worker never scales down meanwhile
    _keep["until"] = 0


@server.routes.get("/gpu/status")
async def gpu_status(request):
    return web.json_response(await _status())


@server.routes.post("/gpu/wake")
async def gpu_wake(request):
    asyncio.get_running_loop().create_task(_ping())
    return web.json_response({"ok": True})


@server.routes.post("/gpu/keep_warm")
async def gpu_keep_warm(request):
    body = await request.json()
    minutes = float(body.get("minutes", 0))
    _keep["until"] = time.time() + minutes * 60 if minutes > 0 else 0
    if _keep["task"] and not _keep["task"].done():
        _keep["task"].cancel()
    if minutes > 0:
        _keep["task"] = asyncio.get_running_loop().create_task(_keep_warm_loop())
    return web.json_response({"keep_warm_until": _keep["until"] or None})


@server.routes.post("/gpu/stop")
async def gpu_stop(request):
    st = await _status()
    if st["state"] in ("busy", "starting"):
        return web.json_response({"error": "a job is running or the worker is booting; wait or cancel first"}, status=409)
    _keep["until"] = 0
    if _keep["task"] and not _keep["task"].done():
        _keep["task"].cancel()  # a ping landing after the stop would boot a new container
    if st["state"] == "cold":
        return web.json_response({"ok": True, "note": "already cold"})
    await _worker().stop.remote.aio()  # the container exits; nothing is billed after that
    return web.json_response({"ok": True})


if os.environ.get("COMFY_RELAY") == "1":
    APP = os.environ["COMFY_MODAL_APP"]  # names come from comfy_modal.config.CONTAINER_ENV; missing means a broken deploy
    IO_VOLUME = os.environ["COMFY_IO_VOLUME"]
    DEPLOY_ID = os.environ["COMFY_DEPLOY_ID"]
    TIMEOUT = float(os.environ["COMFY_WORKER_TIMEOUT"])
    STATE_DICT = os.environ["COMFY_STATE_DICT"]
    IDLE = float(os.environ["COMFY_WORKER_IDLE"])
    RATE = float(os.environ["COMFY_GPU_RATE"])
    GPU = os.environ.get("COMFY_GPU", "GPU")
    KEY = os.environ.get("COMFY_ACCESS_KEY", "")
    server.app.middlewares.append(_relay_middleware)

WEB_DIRECTORY = "./js"

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
