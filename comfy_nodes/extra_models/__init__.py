"""Hand-uploaded model files (tools/sync.sh lora <file>).

They live under extra/<folder>/ on the models volume and are symlinked into
ComfyUI's models/<folder>/ before every request that lists or validates models:
/object_info (the browser on each page load, the worker before each prompt), the
model sidebar's listings, and POST /prompt. The volume API lists
them, since it returns the latest committed state; the links point into the
mounted volume, which already shows every file committed before the container
started. A file uploaded later needs a reload of the mount first, and that
fails as long as ComfyUI keeps a model file on the volume open (ComfyUI's
comfy-aimdo memory manager maps loaded models from their files for the life of
the process). Only then is the file copied through the API, as a last resort:
there are well over a hundred gigabytes here, and copying them all on every
container start kept /object_info, and with it the canvas, from ever answering.
A file dropped from the volume is removed here too, so the name disappears again.
"""
import asyncio
import logging
import os
import time
from pathlib import Path

from aiohttp import web
from server import PromptServer

import folder_paths

EXTRA = os.environ["COMFY_EXTRA_MODELS"]  # path inside the volume
VOLUME = os.environ["COMFY_MODELS_VOLUME"]
MOUNT = os.environ["COMFY_MODELS_MOUNT"]
_lock = asyncio.Lock()
_last = float("-inf")  # time.monotonic() when the last sync started listing
FRESH_SECONDS = 5  # the model sidebar asks for some 25 folders at once; one listing serves them all
_synced = {}  # <folder>/<file> -> (size, mtime) on the volume when it was linked or copied


def sync():
    import modal
    from modal.volume import FileEntryType

    vol = modal.Volume.from_name(VOLUME)
    try:
        entries = vol.listdir(EXTRA, recursive=True)
    except modal.exception.NotFoundError:
        entries = []
    current = {Path(e.path).relative_to(EXTRA): (e.size, e.mtime) for e in entries if e.type == FileEntryType.FILE}
    for rel in set(_synced) - set(current):
        Path(folder_paths.models_dir, rel).unlink(missing_ok=True)
        del _synced[rel]
    reloaded = None  # tried at most once per sync; True when the mount is now current
    for rel, stamp in current.items():
        if _synced.get(rel) == stamp:
            continue
        dst = Path(folder_paths.models_dir, rel)
        dst.parent.mkdir(parents=True, exist_ok=True)
        src = Path(MOUNT, EXTRA, rel)
        # A file that changed since we linked it may still show its old version on the mount, at
        # the same size if it is a retrained LoRA, so only a reload makes the mount trustworthy.
        trusted = rel not in _synced and _mounted(src, stamp)
        if not trusted and reloaded is None:
            try:
                vol.reload()
                reloaded = True
            except Exception as e:  # noqa: BLE001
                reloaded = False
                logging.info("extra_models: models volume reload failed (%s), copying new files instead", e)
        part = dst.with_name(dst.name + ".part")  # not a model extension, so never listed half-written
        if trusted or (reloaded and _mounted(src, stamp)):
            part.unlink(missing_ok=True)
            part.symlink_to(src)
        else:
            with open(part, "wb") as f:
                for chunk in vol.read_file(f"{EXTRA}/{rel}"):
                    f.write(chunk)
        part.replace(dst)  # a file ComfyUI has mapped keeps its old inode
        _synced[rel] = stamp


def _mounted(src: Path, stamp) -> bool:
    """The mount shows this file at its committed size."""
    try:
        return src.stat().st_size == stamp[0]
    except OSError:
        return False


IO_VOLUME = os.environ.get("COMFY_IO_VOLUME")
DATA_VOLUME = os.environ.get("COMFY_DATA_VOLUME")  # UI only: user/default (workflows) lives on it


def reload_volume(name: str):
    """Files put on a volume from outside (tools/sync.sh push|workflows) are not
    in this container's view until the volume is reloaded. Nothing keeps a file
    under /io or /data open for long, so the reload is safe; it only fails
    mid-render or mid-save and the next request retries."""
    import modal

    try:
        modal.Volume.from_name(name).reload()
    except Exception as e:  # noqa: BLE001
        logging.info("extra_models: %s reload skipped: %s", name, e)


async def _refresh(reload_io: bool, force: bool):
    global _last
    async with _lock:
        if force or time.monotonic() - _last >= FRESH_SECONDS:
            start = time.monotonic()
            try:
                await asyncio.to_thread(sync)
            except Exception:  # a Volume API hiccup must not fail the request and blank the canvas
                logging.exception("extra_models: sync failed, serving the files linked so far")
            _last = start
        # /object_info only: before POST /prompt a reload could race the relay's commit of an upload.
        if reload_io and IO_VOLUME:
            await asyncio.to_thread(reload_volume, IO_VOLUME)


def _reads_models(request, path) -> bool:
    """Every request that lists or validates model files. /object_info alone is not enough: a tab
    left open across a container restart never asks for it again, but its model sidebar does, and
    so does POST /prompt, which the relay validates against these lists before anything runs."""
    if request.method == "POST":
        return path == "/prompt"
    return request.method == "GET" and (
        path.startswith("/object_info")
        or path.startswith("/models")
        or (path.startswith("/experiment/models") and not path.startswith("/experiment/models/preview/")))


@web.middleware
async def _sync(request, handler):
    path = request.path.removeprefix("/api")
    if _reads_models(request, path):
        # Shielded: a cancelled request (Modal ends one after 300 s) must not release the lock while
        # the thread is still copying, or the browser's retry starts a second copy of the same file.
        # A prompt always lists again: a LoRA uploaded seconds ago must pass validation.
        refresh = _refresh(reload_io=path.startswith("/object_info"), force=request.method == "POST")
        await asyncio.shield(asyncio.ensure_future(refresh))
    elif request.method == "GET" and path == "/userdata" and DATA_VOLUME:  # the workflow sidebar listing
        async with _lock:
            await asyncio.to_thread(reload_volume, DATA_VOLUME)
    return await handler(request)


# Ahead of gpu_relay, which validates POST /prompt against the model lists, and behind the access
# gate. Custom nodes load in listdir order, so the gate may or may not be registered yet; when it
# is not, it inserts itself at 0 later and still ends up outermost.
_middlewares = PromptServer.instance.app.middlewares
_middlewares.insert(next((i + 1 for i, m in enumerate(_middlewares) if getattr(m, "__name__", "") == "_gate"), 0), _sync)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
