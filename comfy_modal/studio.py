"""The studio endpoint: a small CPU container that serves the phone app (studio/dist) and its API
(studio_api.py). It calls Worker directly, so the ComfyUI GUI container stays asleep while the
studio is in use. URL: https://<workspace>--comfypoke-studio.modal.run"""
from pathlib import Path

import modal

from . import config
from .app import app
from .ui import read_access_key

DIST = Path(__file__).resolve().parents[1] / "studio" / "dist"
if modal.is_local() and not (DIST / "index.html").exists():
    raise SystemExit("studio/dist is missing: run `npm --prefix studio ci && npm --prefix studio run build` before deploying")

image = (
    modal.Image.debian_slim(python_version="3.12")
    .uv_pip_install("fastapi[standard]")
    .add_local_dir(DIST, "/root/studio", copy=False)
    .add_local_python_source("comfy_modal", copy=False)
)


@app.function(
    image=image,
    cpu=0.25,
    memory=512,
    max_containers=1,  # jobs live in this container's memory, so there must be exactly one
    scaledown_window=config.STUDIO_IDLE_SECONDS,
    timeout=config.WORKER_CALL_TIMEOUT,
    secrets=[modal.Secret.from_dict(config.container_env(COMFY_ACCESS_KEY=read_access_key()))],
)
@modal.concurrent(max_inputs=50)
@modal.asgi_app()
def studio():
    from .studio_api import api  # FastAPI is installed in this image only

    return api
