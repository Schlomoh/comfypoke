"""Hand-uploaded model files (tools/sync.sh lora <file>).

They live under extra/<folder>/ on the models volume and are copied into
ComfyUI's models/<folder>/ through the volume API on every /object_info
request, which the browser sends on each page load and the worker before each
prompt. The API returns the latest committed state; the mounted volume would
need a reload, and that fails as long as ComfyUI keeps a model file on the
volume open (comfy-aimdo maps loaded models from their files for the life of
the process). A file dropped from the volume is removed here too, so the name
disappears again.
"""
import asyncio
import logging
import os
from pathlib import Path

from aiohttp import web
from server import PromptServer

import folder_paths

EXTRA = os.environ["COMFY_EXTRA_MODELS"]  # path inside the volume
VOLUME = os.environ["COMFY_MODELS_VOLUME"]
_lock = asyncio.Lock()
_synced = {}  # <folder>/<file> -> (size, mtime) on the volume when it was copied


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
    for rel, stamp in current.items():
        if _synced.get(rel) == stamp:
            continue
        dst = Path(folder_paths.models_dir, rel)
        dst.parent.mkdir(parents=True, exist_ok=True)
        part = dst.with_name(dst.name + ".part")  # not a model extension, so never listed half-written
        with open(part, "wb") as f:
            for chunk in vol.read_file(f"{EXTRA}/{rel}"):
                f.write(chunk)
        part.replace(dst)  # a file ComfyUI has mapped keeps its old inode
        _synced[rel] = stamp


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


@web.middleware
async def _sync(request, handler):
    path = request.path.removeprefix("/api")
    if request.method == "GET" and path.startswith("/object_info"):
        async with _lock:
            await asyncio.to_thread(sync)
            if IO_VOLUME:
                await asyncio.to_thread(reload_volume, IO_VOLUME)
    elif request.method == "GET" and path == "/userdata" and DATA_VOLUME:  # the workflow sidebar listing
        async with _lock:
            await asyncio.to_thread(reload_volume, DATA_VOLUME)
    return await handler(request)


PromptServer.instance.app.middlewares.append(_sync)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
