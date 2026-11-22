"""The studio's HTTP API. Imported inside the studio container only, where FastAPI is installed.

A render is a job: POST /api/generate starts it as a task in this container and returns its id,
and GET /api/jobs/<id>/events streams what happens as server-sent events. The task does not
depend on the stream, so a phone that locks its screen mid-render reconnects (EventSource sends
Last-Event-ID) and gets the rest, image included. The last event is done or failed (not "error",
which EventSource reserves for its own connection errors). The phone deletes the job once it has
stored the image; otherwise it is dropped STUDIO_JOB_TTL seconds after it ended. Nothing is
written to disk.

Every image this container sees is sealed (seal.py): the phone uploads ciphertext, the worker opens it, and the
image and previews come back sealed. This container holds no key that opens them.
"""
import asyncio
import base64
import functools
import hashlib
import hmac
import json
import logging
import os
import random
import re
import struct
import time
import uuid
from collections import OrderedDict
from pathlib import Path

import modal
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import config, graph, graphs, seal

KEY = os.environ.get("COMFY_ACCESS_KEY", "")
TRANSPORT = os.environ.get(config.TRANSPORT_PUBLIC_ENV, "")  # the worker's public key, which the phone wraps its image key with
TRANSPORT_KID = seal.kid(TRANSPORT) if TRANSPORT else ""
COOKIE = "studio_key"
TERMINAL = ("execution_success", "execution_error", "execution_interrupted")
STREAM_SECONDS = 100  # Modal ends any HTTP response at 150 s; ending it first lets EventSource resume cleanly
PREVIEW, PNG = 1, 2  # ComfyUI's binary frame: event type PREVIEW_IMAGE, then 1 for a JPEG preview or 2 for the PNG

api = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
jobs: dict[str, "Job"] = {}
_waking = {"until": 0.0}
_dispatch = asyncio.Lock()  # Worker.run calls start in submission order, as in gpu_relay
_billing = {"at": 0.0, "data": None}
_background: set[asyncio.Task] = set()  # asyncio keeps only weak references to tasks
_stop_after = {"on": False, "turn": 0}  # stop the worker once no job is left; on is set by the latest request that says
# turn counts job starts and ends: a stop scheduled at one quiet moment gives way to any later work


def _background_task(coro, what: str):
    task = asyncio.get_running_loop().create_task(coro)
    _background.add(task)
    task.add_done_callback(lambda t: (_background.discard(t), t.cancelled() or t.exception() and logging.error("studio: %s failed: %r", what, t.exception())))


def _note_stop_after(body: dict):
    _stop_after["turn"] += 1
    if "stop_after" in body:
        _stop_after["on"] = bool(body["stop_after"])


def _running() -> bool:
    return any(not j.ended for j in jobs.values())


async def _stop_when_idle(turn: int):
    await asyncio.sleep(config.STUDIO_STOP_GRACE_SECONDS)
    if turn != _stop_after["turn"] or not _stop_after["on"] or _running():
        return  # later work came (its own end schedules the stop), or it was switched off
    state = (await _gpu())["state"]
    if turn != _stop_after["turn"] or _running():
        return  # a render arrived while the state was read
    if state == "warm":
        _stop_after["on"] = False
        await _worker().stop.remote.aio()
    elif state == "cold":
        _stop_after["on"] = False  # nothing to stop; a stop call would boot a worker
    else:  # busy with the GUI's work, or booting: look again after another grace period
        _background_task(_stop_when_idle(turn), "stopping the GPU after the queue")


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
        self.stages: dict[str, str] = {}  # node id to the stage the phone shows, from the prompt (graph.stages)
        self.counted: set[str] = set()  # the samplers whose steps are the step counter (graph.COUNTED)

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
        if data["type"] == "executing" and d.get("node") in job.stages:
            job.emit("stage", job.stages[d["node"]])
        elif data["type"] == "progress" and d.get("node") in job.counted:
            job.emit("progress", {"value": d["value"], "max": d["max"]})
        elif data["type"] == "execution_success":
            job.end("done", {"seconds": round(time.time() - job.started, 1)})
        elif data["type"] == "execution_interrupted":
            job.end("failed", {"message": "cancelled"})
        elif data["type"] == "execution_error":
            job.end("failed", {"message": d.get("exception_message") or "the render failed"})
    return not job.ended


async def _run(job: Job, prompt: dict, key: str, queued: bool = True):
    job.stages = graph.stages(prompt)
    job.counted = graph.counted(prompt)
    payload = {"prompt": prompt, "prompt_id": job.id, "deploy_id": config.DEPLOY_ID, "io": False, "key": key}  # see Worker.run
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
    finally:
        if queued:  # a preview is a look ahead of the work: it does not count as the queue's last job...
            _stop_after["turn"] += 1
        if _stop_after["on"] and not _running():  # ...but one that outlives the queue still lets the stop happen
            _background_task(_stop_when_idle(_stop_after["turn"]), "stopping the GPU after the queue")


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

async def _uploads(folder: str, extensions: tuple[str, ...] = (".safetensors",)) -> list[str]:
    """Files put on the models volume with tools/sync.sh (extra/<folder>), listed without waking the GPU."""
    try:
        entries = await modal.Volume.from_name(config.VOLUME_MODELS).listdir.aio(f"{config.CONTAINER_ENV['COMFY_EXTRA_MODELS']}/{folder}")
    except modal.exception.NotFoundError:  # nothing uploaded to that folder yet
        return []
    return sorted(e.path.rsplit("/", 1)[-1] for e in entries if e.path.endswith(extensions))


@api.get("/api/models")
async def models():
    files = dict.fromkeys([*graphs.VERIFIED, *graphs.catalog_files(), *await _uploads("diffusion_models", graphs.MODEL_EXTENSIONS)])
    listed = sorted((graphs.describe(f) for f in files), key=lambda m: (not m["verified"], m["file"].lower()))
    return {"models": listed, "families": [{"id": k, **{x: f[x] for x in ("label", "steps", "cfg")}} for k, f in graphs.FAMILIES.items()],
            "loras": await _uploads("loras")}


@api.get("/api/transport")
async def transport():
    """The public key the phone wraps its image key with, and its id, which the phone sends back with the key."""
    return {"kid": TRANSPORT_KID, "spki": TRANSPORT}


def _params(body: dict) -> dict:
    unet = str(body.get("unet") or "")
    family = str(body.get("family") or "") or graphs.describe(unet)["family"]
    if not unet.endswith(graphs.MODEL_EXTENSIONS) or "/" in unet:
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


MAX_REFERENCE = 4 * 2**20  # base64 characters; the phone sends the photo at most 768 px a side


def _reference(body: dict, family: str) -> str | None:
    """The face photo a render or inpaint puts on its person (graphs._headswap), base64, or None."""
    ref = body.get("reference")
    if not ref:
        return None
    if not isinstance(ref, str) or len(ref) > MAX_REFERENCE:
        raise HTTPException(400, "the face photo must be an image under 3 MB")
    if family not in graphs.HEADSWAP_FAMILIES:
        raise HTTPException(400, f"face photos work with {', '.join(graphs.FAMILIES[f]['label'] for f in graphs.HEADSWAP_FAMILIES)} only")
    return ref


# ---- images: each sent once and referred to by its hash after that ----------------------------------------
# A find, a body preview and a few dressings of one picture would otherwise upload it each time, over a phone's
# connection. Kept in this container's memory, oldest out first; a reference to one that is gone (the container
# scaled down in between) is a 410, and the phone uploads it again. They are sealed, so this container cannot read
# a PNG's size from its header: the phone states it with the upload (?w=&h=, none for a JPEG face photo). Only the
# phone that holds the key could state it wrong, and it could as well send any other picture.

IMAGE_CACHE = 600 * 2**20  # base64 characters
_images: OrderedDict[str, tuple[str, tuple[int, int] | None]] = OrderedDict()  # sha: (sealed image, base64; its size)


@api.post("/api/images")
async def put_image(request: Request, w: int | None = None, h: int | None = None):
    data = await request.body()
    if not data or len(data) * 4 // 3 > MAX_IMAGE:
        raise HTTPException(400, "missing image, or larger than 40 MB")
    if len(data) <= seal.IV + 16:  # iv and tag
        raise HTTPException(400, "not a sealed image")
    sha = hashlib.sha256(data).hexdigest()
    if sha not in _images:
        _images[sha] = (base64.b64encode(data).decode(), _size(w, h) if w is not None and h is not None else None)
        while sum(len(b64) for b64, _ in _images.values()) > IMAGE_CACHE and len(_images) > 1:
            _images.popitem(last=False)
    _images.move_to_end(sha)
    return {"ref": sha}


async def _json(request: Request) -> dict:
    """The request's JSON with every image given as {"ref": sha} replaced by the sealed image itself, and its stated
    size as "<name>_size". `key` must be the phone's image key wrapped for this deploy's worker."""
    body = await request.json()
    for name in ("image", "mask", "reference"):
        body.pop(f"{name}_size", None)  # stated with the upload only
        v = body.get(name)
        if v and not isinstance(v, dict):
            raise HTTPException(400, f"send the {name} as a reference from /api/images, sealed")
        if isinstance(v, dict):
            sha = str(v.get("ref", ""))
            if sha not in _images:
                raise HTTPException(410, "the studio no longer has that image: send it again")
            _images.move_to_end(sha)
            body[name], body[f"{name}_size"] = _images[sha]
    key = body.get("key")
    if not isinstance(key, dict) or not isinstance(key.get("key"), str):
        raise HTTPException(400, "the request has no image key")
    if key.get("kid") != TRANSPORT_KID:
        raise HTTPException(409, "the image key was wrapped for an older deploy: fetch /api/transport again")
    return body


@api.post("/api/generate")
async def generate(request: Request):
    body = await _json(request)
    p = _params(body)
    finish = _finish(body.get("finish"), p["prompt"], p["seed"], "the finish")
    reference = _reference(body, (finish or p)["family"])  # the head swap runs on the last pass's model
    p["reference"] = bool(reference)
    # what edits and retouches of this render run with by default: its last pass (setup.passOf)
    p["finish"] = finish and {k: finish[k] for k in ("unet", "family", "steps", "cfg", "denoise")} | {
        "loras": [{"name": n, "strength": w} for n, w in finish["loras"]]}
    prompt = graphs.graph(p["family"], p["unet"], p["prompt"], p["negative"], p["width"], p["height"], p["seed"], p["steps"], p["cfg"],
                          [(x["name"], x["strength"]) for x in p["loras"]], reference, finish)
    return _start(body, p, prompt)


STATIC = Path("/root/studio")  # the built studio/dist (studio.py)
MAX_IMAGE = 40 * 2**20  # base64 characters: a 2048-square PNG is well under half of it


def _size(w: int, h: int) -> tuple[int, int]:
    if not (16 <= w <= 8192 and 16 <= h <= 8192):
        raise HTTPException(400, f"the image is {w}×{h}; 16 to 8192 pixels a side")
    return w, h


def _png_size(body: dict, name: str = "image") -> tuple[int, int]:
    """The size the phone stated when it uploaded the PNG sent as `name` (put_image)."""
    if not body.get(f"{name}_size"):
        raise HTTPException(400, f"the {name} is not a PNG of known size")
    return tuple(body[f"{name}_size"])


@api.post("/api/upscale")
async def upscale(request: Request):
    """SeedVR2 to a megapixel size, with an optional prompt retouch first (graphs.upscale). The phone
    sends the image itself; with `retouch`, the settings it was made with plus a prompt and strength."""
    body = await _json(request)
    b64 = str(body.get("image", ""))
    if not b64 or len(b64) > MAX_IMAGE:
        raise HTTPException(400, "missing image, or larger than 40 MB")
    try:
        w, h = _png_size(body)
        mp = float(body.get("megapixels", 4))
        seed = random.randrange(2**50) if body.get("seed") is None else int(body["seed"])
    except (ValueError, TypeError) as e:
        raise HTTPException(400, f"malformed image or number: {e}")
    if mp not in graphs.UPSCALE_MEGAPIXELS:
        raise HTTPException(400, f"megapixels must be one of {graphs.UPSCALE_MEGAPIXELS}")
    if w * h >= mp * 1024 * 1024:
        raise HTTPException(400, f"the image is {w}×{h}, already {mp} MP or more; pick a larger size")
    retouch = None
    if body.get("retouch"):
        r = body["retouch"]
        if not isinstance(r, dict):
            raise HTTPException(400, "retouch must be an object")
        if w * h > 2048 * 2048:  # the retouch samples at the image's own size, where these models stop working well
            raise HTTPException(400, f"a touch-up works on images up to 4 MP; this one is {w}×{h}. Upscale it without one.")
        p = _params({**r, "width": 1024, "height": 1024, "seed": seed})  # same checks as a render; the size is the image's
        try:
            denoise = float(r.get("denoise", 0.3))
        except (TypeError, ValueError) as e:
            raise HTTPException(400, f"malformed strength: {e}")
        if not 0.05 <= denoise <= 0.8:
            raise HTTPException(400, "retouch strength must be between 0.05 and 0.8")
        retouch = {"family": p["family"], "unet": p["unet"], "text": p["prompt"], "negative": p["negative"], "steps": p["steps"],
                   "cfg": p["cfg"], "loras": [(x["name"], x["strength"]) for x in p["loras"]], "denoise": denoise}
    s = (mp * 1024 * 1024 / (w * h)) ** 0.5  # ImageScaleToTotalPixels at resolution_steps 1
    params = {"kind": "upscale", "unet": "seedvr2_7b_fp16.safetensors", "family": "seedvr2", "prompt": retouch["text"] if retouch else "",
              "negative": "", "width": round(w * s), "height": round(h * s), "steps": 1, "cfg": 1.0, "seed": seed, "loras": [],
              "megapixels": mp, "denoise": retouch["denoise"] if retouch else 0}
    return _start(body, params, graphs.upscale(b64, mp, seed, retouch))


@api.post("/api/inpaint")
async def inpaint(request: Request):
    """Repaint part of an image (graphs.inpaint). The phone sends the image, its mask at the image's size (found
    with /api/mask and painted), the prompt for what goes inside, the setup to repaint with, optionally `target`
    (what the mask was found as, recorded only) and a face photo for the head swap."""
    body = await _json(request)
    b64, mask = str(body.get("image", "")), str(body.get("mask", ""))
    if not b64 or not mask or len(b64) > MAX_IMAGE or len(mask) > MAX_IMAGE:
        raise HTTPException(400, "missing image or mask, or larger than 40 MB")
    try:
        w, h = _png_size(body)
        mw, mh = _png_size(body, "mask")
        seed = random.randrange(2**50) if body.get("seed") is None else int(body["seed"])
    except (ValueError, TypeError) as e:
        raise HTTPException(400, f"malformed image, mask or number: {e}")
    if (mw, mh) != (w, h):
        raise HTTPException(400, f"the mask is {mw}×{mh} and the image {w}×{h}; they must match")
    target = str(body.get("target", "")).strip()[:200]
    if body.get("dress") is not None:
        return _dress(body, b64, mask, seed, (w, h), target)
    p = _params({**body, "width": 1024, "height": 1024, "seed": seed})  # same checks as a render; the size is the image's
    reference = _reference(body, p["family"])
    params = {**p, "kind": "inpaint", "width": w, "height": h, "target": target, "reference": bool(reference)}
    return _start(body, params, graphs.inpaint(b64, mask, _retouch(p), seed, reference))


def _retouch(p: dict) -> dict:
    """A render's settings as graphs takes them for a second pass with its model."""
    return {"family": p["family"], "unet": p["unet"], "text": p["prompt"], "negative": p["negative"], "steps": p["steps"],
            "cfg": p["cfg"], "loras": [(x["name"], x["strength"]) for x in p["loras"]]}


def _start(body: dict, params: dict, prompt: dict, queued: bool = True) -> dict:
    _purge()
    job = Job(params)
    jobs[job.id] = job
    job.emit("queued", {**params, "started": job.started})  # replayed on every reconnect
    if queued:
        _note_stop_after(body)
    job.task = asyncio.create_task(_run(job, prompt, body["key"]["key"], queued))
    return {"id": job.id, **params}


def _pass(spec, prompt: str, seed: int, what: str) -> dict:
    """One pass's model setup (unet, family, steps, cfg, loras) checked like a render's, as graphs takes it."""
    if not isinstance(spec, dict):
        raise HTTPException(400, f"{what} needs a model setup")
    return _retouch(_params({**spec, "prompt": prompt, "seed": seed, "width": 1024, "height": 1024}))


def _finish(spec, prompt: str, seed: int, what: str) -> dict | None:
    """A light second pass with another setup at `denoise` (graphs.FINISH), after a render or a dressing; None for none."""
    if spec is None:
        return None
    finish = _pass(spec, prompt, seed, what)
    try:
        finish["denoise"] = float(spec.get("denoise", 0.35))
    except (TypeError, ValueError) as e:
        raise HTTPException(400, f"malformed finish strength: {e}")
    lo, hi = graphs.FINISH
    if not lo <= finish["denoise"] <= hi:
        raise HTTPException(400, f"finish strength must be between {lo} and {hi}")
    return finish


def _dress(body: dict, b64: str, mask: str, seed: int, size: tuple[int, int], target: str) -> dict:
    """Dressing (graphs.dress): the prompt is the outfit. `dress` holds the hold, the Z-Image setup that dresses the
    body, and optionally the setup that finishes it with its strength; a face photo needs a Krea 2 finish."""
    d = body["dress"]
    if not isinstance(d, dict) or not isinstance(d.get("hold"), str) or d["hold"] not in graphs.DRESS_HOLD:
        raise HTTPException(400, f"dress needs hold, one of {list(graphs.DRESS_HOLD)}")
    outfit = str(body.get("prompt", "")).strip()
    dresser = _pass(d.get("dresser"), outfit, seed, "the dress pass")
    if dresser["family"] != "zimage":
        raise HTTPException(400, "the dress pass runs on a Z-Image model: its controlnet holds the body")
    finish = _finish(d.get("finish"), outfit, seed, "the finish")
    swap = bool(finish) and finish["family"] in graphs.HEADSWAP_FAMILIES
    if body.get("reference") and not swap:
        raise HTTPException(400, "a face photo needs a Krea 2 finish: the head swap runs on its loaders")
    reference = _reference(body, "krea2")
    # the job's model is what drew the last pixels: the finish when there is one, else the dresser
    p = _params({**(d["finish"] if finish else d["dresser"]), "prompt": outfit, "seed": seed, "width": 1024, "height": 1024})
    params = {**p, "kind": "dress", "dresser": dresser["unet"], "width": size[0], "height": size[1], "target": target, "reference": bool(reference),
              "hold": d["hold"], "finish": finish["unet"] if finish else None}
    return _start(body, params, graphs.dress(b64, mask, outfit, seed, d["hold"], dresser, finish, reference))


@api.post("/api/mask")
async def mask_preview(request: Request):
    """What SAM 3.1 finds in a picture by `text`, by tapped `points` or by both, as a white-on-black mask
    (graphs.mask), for the phone to add to the mask it paints. Runs outside stop-after, like the body preview."""
    body = await _json(request)
    b64, text = str(body.get("image", "")), str(body.get("text", "")).strip()
    if not b64 or len(b64) > MAX_IMAGE:
        raise HTTPException(400, "missing image, or larger than 40 MB")
    try:
        w, h = _png_size(body)
        points = _points(body.get("points") or {}, w, h)
    except (ValueError, TypeError, KeyError) as e:
        raise HTTPException(400, f"malformed image or points: {e}")
    if len(text) > 200 or not (text or points.get("positive")):
        raise HTTPException(400, "say what to find in up to 200 characters, or tap on it")
    params = {"kind": "mask", "unet": "sam3.1_multiplex_fp16.safetensors", "family": "sam", "prompt": text, "negative": "",
              "width": w, "height": h, "steps": 1, "cfg": 1.0, "seed": 0, "loras": []}
    return _start(body, params, graphs.mask(b64, text, points), queued=False)


def _points(raw: dict, w: int, h: int) -> dict:
    """Tapped points as SAM takes them: up to 16 of each kind, whole pixels inside the image."""
    out = {}
    for kind in ("positive", "negative"):
        pts = [{"x": int(p["x"]), "y": int(p["y"])} for p in (raw.get(kind) or [])[:16]]
        if any(not (0 <= p["x"] < w and 0 <= p["y"] < h) for p in pts):
            raise ValueError("a point lies outside the image")
        out[kind] = pts
    return out


@api.post("/api/body")
async def body_preview(request: Request):
    """The body SAM 3D Body fits to a picture, drawn over it (graphs.body): what dressing will hold in place."""
    body = await _json(request)
    b64 = str(body.get("image", ""))
    if not b64 or len(b64) > MAX_IMAGE:
        raise HTTPException(400, "missing image, or larger than 40 MB")
    w, h = _png_size(body)
    params = {"kind": "body", "unet": "sam_3d_body_dinov3_bf16.safetensors", "family": "body", "prompt": "", "negative": "",
              "width": w, "height": h, "steps": 1, "cfg": 1.0, "seed": 0, "loras": []}
    return _start(body, params, graphs.body(b64), queued=False)


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
        "stop_after": _stop_after["on"],
    }


@functools.cache
def _build() -> str:
    """The served app's entry script, which changes with every build: a phone running another one is told to reload."""
    try:
        m = re.search(r'src="/?(assets/[^"]+\.js)"', (STATIC / "index.html").read_text())
    except OSError:
        return ""
    return m.group(1) if m else ""


@api.get("/api/gpu")
async def gpu():
    return {**await _gpu(), "build": _build()}


async def _ping():
    _waking["until"] = time.time() + 180  # until the worker's own heartbeat says starting
    try:
        await _worker().ping.remote.aio(None)  # None leaves a keep-warm deadline the GUI set alone
    except Exception:
        logging.exception("studio: ping failed")
    finally:
        _waking["until"] = 0


@api.post("/api/gpu/stop-after")
async def stop_after(on: bool = False):
    """The toggle in the render list. Off cancels a pending stop; on applies to the queue in progress, if any."""
    _stop_after["on"] = on and _running()
    return await _gpu()


@api.post("/api/gpu/wake")
async def wake():
    asyncio.get_running_loop().create_task(_ping())
    await asyncio.sleep(0)  # let the task mark the worker as starting before the status is read
    return await _gpu()


@api.post("/api/gpu/stop")
async def stop(force: bool = False):
    """force ends whatever runs: the studio's jobs fail as stopped, and the worker exits mid-render."""
    st = await _gpu()
    if st["state"] in ("busy", "starting") and not force:
        raise HTTPException(409, "a render is running or the GPU is booting; wait or cancel first")
    if force and st["state"] != "cold":  # a forced call on a cold worker would boot one just to exit it
        for job in [j for j in jobs.values() if not j.ended]:
            job.cancelled = True
            if job.task:
                job.task.cancel()
            job.end("failed", {"message": "the GPU was force-stopped"})
        # A booting worker takes the call once it is up, so it is not waited for here.
        _background_task(_worker().stop.remote.aio(force=True), "force stop")
    elif st["state"] == "warm":
        await _worker().stop.remote.aio()  # the container exits; nothing is billed after that
    _waking["until"] = 0
    _stop_after["on"] = False
    return {**st, "state": "cold", "idles_in": None, "running": 0, "stop_after": False}


# ---- the app itself: the built studio/dist, index.html revalidated, hashed assets cached ----------------------

class _Static(StaticFiles):
    async def get_response(self, path, scope):
        resp = await super().get_response(path, scope)
        resp.headers["Cache-Control"] = "public, max-age=31536000, immutable" if path.startswith("assets/") else "no-cache"
        return resp


api.mount("/", _Static(directory=STATIC, html=True, check_dir=False), name="app")  # checked lazily, so tests can import this
