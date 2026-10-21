"""The studio's HTTP API. Imported inside the studio container only, where FastAPI is installed.

A render is a job: POST /api/generate starts it as a task in this container and returns its id,
and GET /api/jobs/<id>/events streams what happens as server-sent events. The task does not
depend on the stream, so a phone that locks its screen mid-render reconnects (EventSource sends
Last-Event-ID) and gets the rest, image included. The last event is done or failed (not "error",
which EventSource reserves for its own connection errors). The phone deletes the job once it has
stored the image; otherwise it is dropped STUDIO_JOB_TTL seconds after it ended. Nothing is
written to disk.
"""
import asyncio
import base64
import hmac
import json
import logging
import os
import random
import struct
import time
import uuid

import modal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import config, graphs

KEY = os.environ.get("COMFY_ACCESS_KEY", "")
COOKIE = "studio_key"
TERMINAL = ("execution_success", "execution_error", "execution_interrupted")
STREAM_SECONDS = 100  # Modal ends any HTTP response at 150 s; ending it first lets EventSource resume cleanly
PREVIEW, PNG = 1, 2  # ComfyUI's binary frame: event type PREVIEW_IMAGE, then 1 for a JPEG preview or 2 for the PNG

api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
jobs: dict[str, "Job"] = {}
_waking = {"until": 0.0}
_dispatch = asyncio.Lock()  # Worker.run calls start in submission order, as in gpu_relay
_billing = {"at": 0.0, "data": None}


def _worker():
    return modal.Cls.from_name(config.APP_NAME, "Worker")()


class Job:
    def __init__(self, params: dict):
        self.id = str(uuid.uuid4())
        self.params = params
        self.events: list[tuple[str, object]] = []  # an event's index is its SSE id
        self.changed = asyncio.Event()  # replaced on every emit, so each waiter wakes once
        self.started = time.time()
        self.ended = 0.0
        self.cancelled = False  # asked before the worker had the prompt: interrupted once it does
        self.task: asyncio.Task | None = None

    def emit(self, name: str, data):
        self.events.append((name, data))
        changed, self.changed = self.changed, asyncio.Event()
        changed.set()

    def end(self, name: str, data):
        self.ended = time.time()
        self.emit(name, data)


def _unavailable(e) -> bool:
    """A worker from an older deploy, or a lost Modal connection: worth one retry on a fresh container."""
    return "WorkerUnavailable" in (type(e).__name__ + str(e)) or isinstance(e, modal.exception.ConnectionError)


async def _next(job: Job, gen):
    try:
        return await asyncio.wait_for(anext(gen, None), config.WORKER_TIMEOUT_SECONDS)
    except asyncio.TimeoutError:
        try:
            await _worker().interrupt.remote.aio(job.id)  # best effort: the worker may be wedged
        except Exception:
            logging.exception("studio: could not interrupt job %s after the timeout", job.id)
        raise TimeoutError(f"the GPU worker sent nothing for {config.WORKER_TIMEOUT_SECONDS} s")


async def _stream(job: Job, payload: dict):
    gen = _worker().run.remote_gen.aio(payload)
    try:
        async with _dispatch:  # the worker yields nothing before its own POST /prompt returned
            msg = await _next(job, gen)
        if job.cancelled:  # a cancel during the cold boot found nothing to interrupt
            await _worker().interrupt.remote.aio(job.id)
        while True:
            if not _handle(job, msg):
                return
            msg = await _next(job, gen)
    finally:
        await gen.aclose()


def _handle(job: Job, msg) -> bool:
    """Turn one worker message into job events; False once the job has ended."""
    if msg is None:
        job.end("failed", {"message": "the GPU worker stopped before the image was done"})
        return False
    kind, data = msg
    if kind == "bytes":
        event, fmt = struct.unpack(">II", data[:8])
        if event == PREVIEW:
            job.emit("image" if fmt == PNG else "preview", base64.b64encode(data[8:]).decode())
    elif kind == "json":
        d = data.get("data") or {}
        if data["type"] == "executing" and d.get("node") in graphs.STAGES:
            job.emit("stage", graphs.STAGES[d["node"]])
        elif data["type"] == "progress" and d.get("node") == graphs.SAMPLER:
            job.emit("progress", {"value": d["value"], "max": d["max"]})
        elif data["type"] == "execution_success":
            job.end("done", {"seconds": round(time.time() - job.started, 1)})
        elif data["type"] == "execution_interrupted":
            job.end("failed", {"message": "cancelled"})
        elif data["type"] == "execution_error":
            job.end("failed", {"message": d.get("exception_message") or "the render failed"})
    return not job.ended


async def _run(job: Job, prompt: dict):
    payload = {"prompt": prompt, "prompt_id": job.id, "deploy_id": config.DEPLOY_ID, "io": False}  # see Worker.run
    try:
        for attempt in (1, 2):
            try:
                return await _stream(job, payload)
            except Exception as e:
                if attempt == 2 or not _unavailable(e) or len(job.events) > 1:
                    raise
                logging.warning("studio: worker unavailable (%r), retrying once", e)
                await asyncio.sleep(3)
    except Exception as e:
        logging.exception("studio: job %s failed", job.id)
        job.end("failed", {"message": f"GPU worker: {e}"})


def _purge():
    now = time.time()
    for jid in [j.id for j in jobs.values() if j.ended and now - j.ended > config.STUDIO_JOB_TTL]:
        del jobs[jid]


def _job(job_id: str) -> Job:
    if job_id not in jobs:
        raise HTTPException(404, "no such job (it finished more than a few minutes ago, or the endpoint restarted)")
    return jobs[job_id]


# ---- auth: the GUI's key, kept in an httpOnly cookie -------------------------------------------------------

@api.middleware("http")
async def gate(request: Request, call_next):
    if KEY and request.url.path.startswith("/api/") and request.url.path != "/api/login":
        if not hmac.compare_digest(request.cookies.get(COOKIE, ""), KEY):
            return JSONResponse({"error": "locked"}, status_code=401)
    return await call_next(request)


@api.post("/api/login")
async def login(request: Request):
    body = await request.json()
    if KEY and not hmac.compare_digest(str(body.get("key", "")), KEY):
        return JSONResponse({"error": "That key is not right."}, status_code=401)
    resp = JSONResponse({"ok": True})
    resp.set_cookie(COOKIE, KEY, max_age=365 * 86400, httponly=True, secure=True, samesite="strict")
    return resp


# ---- renders -----------------------------------------------------------------------------------------------

async def _uploads(folder: str) -> list[str]:
    """Files put on the models volume with tools/sync.sh (extra/<folder>), listed without waking the GPU."""
    try:
        entries = await modal.Volume.from_name(config.VOLUME_MODELS).listdir.aio(f"{config.CONTAINER_ENV['COMFY_EXTRA_MODELS']}/{folder}")
    except modal.exception.NotFoundError:  # nothing uploaded to that folder yet
        return []
    return sorted(e.path.rsplit("/", 1)[-1] for e in entries if e.path.endswith(".safetensors"))


@api.get("/api/models")
async def models():
    files = dict.fromkeys([*graphs.VERIFIED, *graphs.catalog_files(), *await _uploads("diffusion_models")])
    listed = sorted((graphs.describe(f) for f in files), key=lambda m: (not m["verified"], m["file"].lower()))
    return {"models": listed, "families": [{"id": k, **{x: f[x] for x in ("label", "steps", "cfg")}} for k, f in graphs.FAMILIES.items()],
            "loras": await _uploads("loras")}


def _params(body: dict) -> dict:
    unet = str(body.get("unet") or "")
    family = str(body.get("family") or "") or graphs.describe(unet)["family"]
    if not unet.endswith(".safetensors") or "/" in unet:
        raise HTTPException(400, f"not a model file: {unet!r}")
    if family not in graphs.FAMILIES:
        raise HTTPException(400, f"unknown model family {family!r}")
    d = graphs.VERIFIED.get(unet) if graphs.VERIFIED.get(unet, {}).get("family") == family else graphs.FAMILIES[family]
    text = str(body.get("prompt", "")).strip()
    try:  # None means the default; 0 is a value, and gets the range error below
        width, height = int(body.get("width", 1024)), int(body.get("height", 1024))
        steps = d["steps"] if body.get("steps") is None else float(body["steps"])
        cfg = d["cfg"] if body.get("cfg") is None else float(body["cfg"])
        loras = [(str(x["name"]), float(x["strength"])) for x in body.get("loras") or []]
    except (TypeError, ValueError, KeyError) as e:
        raise HTTPException(400, f"malformed number or LoRA: {e}")
    if steps != int(steps):
        raise HTTPException(400, "steps must be a whole number")
    steps = int(steps)
    if not text:
        raise HTTPException(400, "the prompt is empty")
    if not all(256 <= v <= 2048 and v % 16 == 0 for v in (width, height)):
        raise HTTPException(400, "width and height must be multiples of 16 between 256 and 2048")
    if not (1 <= steps <= 100 and 0 < cfg <= 20):
        raise HTTPException(400, "steps must be 1 to 100 and cfg above 0 and at most 20")
    if len(loras) > 8 or any(not -8 <= w <= 8 for _, w in loras):
        raise HTTPException(400, "at most 8 LoRAs, strengths between -8 and 8")
    seed = body.get("seed")
    return {"unet": unet, "family": family, "prompt": text, "negative": str(body.get("negative", "")).strip() if cfg > 1 else "",
            "width": width, "height": height, "steps": steps, "cfg": cfg,
            "seed": random.randrange(2**50) if seed is None else int(seed),  # 2**50 stays exact in JavaScript
            "loras": [{"name": n, "strength": w} for n, w in loras]}


@api.post("/api/generate")
async def generate(request: Request):
    p = _params(await request.json())
    _purge()
    job = Job(p)
    jobs[job.id] = job
    job.emit("queued", {**job.params, "started": job.started})  # replayed on every reconnect
    prompt = graphs.graph(p["family"], p["unet"], p["prompt"], p["negative"], p["width"], p["height"], p["seed"], p["steps"], p["cfg"],
                          [(x["name"], x["strength"]) for x in p["loras"]])
    job.task = asyncio.create_task(_run(job, prompt))
    return {"id": job.id, **job.params}


@api.get("/api/jobs/{job_id}/events")
async def events(job_id: str, request: Request):
    job = _job(job_id)
    try:
        start = int(request.headers.get("last-event-id", -1)) + 1
    except ValueError:
        start = 0

    async def stream():
        yield "retry: 1000\n\n"
        i, deadline = start, time.time() + STREAM_SECONDS
        while time.time() < deadline:
            changed = job.changed
            while i < len(job.events):
                name, data = job.events[i]
                yield f"id: {i}\nevent: {name}\ndata: {json.dumps(data)}\n\n"
                i += 1
            if job.ended:
                return
            try:
                await asyncio.wait_for(changed.wait(), 15)
            except asyncio.TimeoutError:
                yield ": keepalive\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no"})


@api.post("/api/jobs/{job_id}/cancel")
async def cancel(job_id: str):
    job = _job(job_id)
    if not job.ended:
        job.cancelled = True
        await _worker().interrupt.remote.aio(job.id)
    return {"ok": True}


@api.delete("/api/jobs/{job_id}")
async def forget(job_id: str):
    job = jobs.pop(job_id, None)
    if job and not job.ended and job.task:
        job.task.cancel()
        job.end("failed", {"message": "cancelled"})  # ends any other open stream on this job
        await _worker().interrupt.remote.aio(job.id)
    return {"ok": True}


# ---- GPU: the worker's heartbeat (a Modal Dict it writes every 20 s) and the controls -----------------------

async def _credits():
    """This month's spend from Modal's billing API, cached: it moves hourly at best."""
    if time.time() - _billing["at"] > 600:
        _billing["at"] = time.time()
        try:
            s = await asyncio.wait_for(modal.Workspace.from_context().billing.summary.aio(), 10)
            used = -float(s.adjustments.get("Credits", 0))
            _billing["data"] = {"used": round(used, 2), "left": round(max(0.0, config.MONTHLY_CREDITS - used), 2),
                                "monthly": config.MONTHLY_CREDITS}
        except Exception:
            _billing["at"] -= 540  # try again in a minute rather than ten
            logging.exception("studio: could not read the billing summary")
    return _billing["data"]


async def _gpu():
    d = modal.Dict.from_name(config.CONTAINER_ENV["COMFY_STATE_DICT"], create_if_missing=True)
    try:
        w = await d.get.aio(config.DEPLOY_ID) or {}
    except Exception:
        logging.exception("studio: could not read the worker state")
        w = {}
    now = time.time()
    fresh = bool(w) and now - w.get("beat", 0) < 60 and w.get("state") in ("starting", "warm")
    running = sum(1 for j in jobs.values() if not j.ended)
    if running or (fresh and w.get("busy")):
        state = "busy"
    elif fresh:
        state = w["state"]
    elif now < _waking["until"]:
        state = "starting"
    else:
        state = "cold"
    rate = w.get("rate", float(config.CONTAINER_ENV["COMFY_GPU_RATE"])) if fresh else float(config.CONTAINER_ENV["COMFY_GPU_RATE"])
    idle_limit = w.get("idle_limit", config.WORKER_IDLE_SECONDS)
    return {
        "state": state, "booted": fresh and w["state"] == "warm", "running": running, "gpu": w.get("gpu") if fresh else config.GPUS[0], "rate_per_hour": rate,
        "idles_in": max(0, int(idle_limit - (now - w.get("last_input", now)))) if state == "warm" else None,
        "session_cost": round((now - w["since"]) / 3600 * rate, 3) if fresh else 0,
        "credits": await _credits(),
    }


@api.get("/api/gpu")
async def gpu():
    return await _gpu()


async def _ping():
    _waking["until"] = time.time() + 180  # until the worker's own heartbeat says starting
    try:
        await _worker().ping.remote.aio(None)  # None leaves a keep-warm deadline the GUI set alone
    except Exception:
        logging.exception("studio: ping failed")
    finally:
        _waking["until"] = 0


@api.post("/api/gpu/wake")
async def wake():
    asyncio.get_running_loop().create_task(_ping())
    await asyncio.sleep(0)  # let the task mark the worker as starting before the status is read
    return await _gpu()


@api.post("/api/gpu/stop")
async def stop():
    st = await _gpu()
    if st["state"] in ("busy", "starting"):
        raise HTTPException(409, "a render is running or the GPU is booting; wait or cancel first")
    if st["state"] == "warm":
        await _worker().stop.remote.aio()  # the container exits; nothing is billed after that
    _waking["until"] = 0
    return {**st, "state": "cold", "idles_in": None}


# ---- the app itself: the built studio/dist, index.html revalidated, hashed assets cached ----------------------

class _Static(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
        return resp


api.mount("/", _Static(directory="/root/studio", html=True, check_dir=False), name="app")  # checked lazily, so tests can import this
