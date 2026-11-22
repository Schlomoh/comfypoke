"""Model downloads that stay in the data center: a small CPU function with the models volume mounted pulls a file
from Civitai or Hugging Face straight into extra/<folder>/, so a 12 GB checkpoint never crosses the laptop's
connection twice. tools/fetch.py calls it (tools/sync.sh civitai|hf and the console do); a token travels as a
header with that one call and is stored nowhere on Modal. New files appear in the GUI's and the studio's model
lists like hand-uploaded ones (comfy_nodes/extra_models)."""
import re
from pathlib import Path
from urllib.parse import unquote, urlparse

import modal

from . import config, volumes
from .app import app

image = modal.Image.debian_slim(python_version="3.12").uv_pip_install("requests").add_local_python_source("comfy_modal", copy=False)

FOLDER = re.compile(r"^[a-z0-9_]+$")  # a models/ subfolder: loras, diffusion_models, checkpoints...
CHUNK = 16 * 2**20


def _name(response, url: str) -> str:
    """The file's name: the server's Content-Disposition, else the URL's last part."""
    cd = response.headers.get("content-disposition", "")
    m = re.search(r"filename\*=UTF-8''([^;]+)", cd) or re.search(r'filename="?([^";]+)"?', cd)
    name = unquote(m.group(1)) if m else Path(urlparse(response.url or url).path).name
    name = Path(name.strip()).name  # never a path
    if not name or name.startswith("."):
        raise ValueError(f"no usable file name from {url}")
    return name


@app.function(image=image, volumes={config.CACHE_DIR: volumes.models}, cpu=1, memory=1024, timeout=3 * 3600)
def fetch(url: str, folder: str, headers: dict | None = None, name: str | None = None):
    """Streams `url` to extra/<folder>/<name> on the models volume and yields progress lines; the last one is
    "done <name> <bytes>". Writes to <name>.part first, so a failed download never leaves a half file under the
    real name. Authorization is dropped by requests on a redirect to another host (Civitai's and HF's CDNs)."""
    import time

    import requests

    if not FOLDER.match(folder):
        raise ValueError(f"not a models folder: {folder!r}")
    with requests.get(url, headers=headers or {}, stream=True, timeout=60) as r:
        r.raise_for_status()
        name = Path(name).name if name else _name(r, url)
        dest = Path(config.CACHE_DIR, config.CONTAINER_ENV["COMFY_EXTRA_MODELS"], folder)
        dest.mkdir(parents=True, exist_ok=True)
        part = dest / f"{name}.part"
        total, done = int(r.headers.get("content-length") or 0), 0
        start = shown = time.time()
        yield f"downloading {name}" + (f" ({total / 2**30:.2f} GB)" if total else "")
        with open(part, "wb") as f:
            for chunk in r.iter_content(CHUNK):
                f.write(chunk)
                done += len(chunk)
                if time.time() - shown > 5:
                    shown = time.time()
                    rate = done / (shown - start) / 2**20
                    yield f"  {done / 2**30:.2f}" + (f" of {total / 2**30:.2f}" if total else "") + f" GB, {rate:.0f} MB/s"
    part.replace(dest / name)
    volumes.models.commit()
    yield f"done {name} {done}"
