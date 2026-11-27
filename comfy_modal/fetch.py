"""Model downloads that stay in the data center: a small CPU function with the models volume mounted pulls a file
from Civitai or Hugging Face straight into extra/<folder>/, so a 12 GB checkpoint never crosses the laptop's
connection twice. tools/fetch.py calls it (tools/sync.sh civitai|hf and the console do). It takes no token: the
laptop turns a download that needs one into the signed CDN link the host redirects to, and only that link, which
opens that one file for a while, is a call input here. New files appear in the GUI's and the studio's model lists
like hand-uploaded ones (comfy_nodes/extra_models)."""
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
def fetch(url: str, folder: str, name: str | None = None, allow_pickle: bool = False):
    """Streams `url` to extra/<folder>/<name> on the models volume and yields progress lines; the last one is
    "done <name> <bytes>". Writes to <name>.part first, so a failed download never leaves a half file under the
    real name. Only config.SAFE_MODEL_TYPES, unless allow_pickle."""
    import time

    import requests

    if not FOLDER.match(folder):
        raise ValueError(f"not a models folder: {folder!r}")
    with requests.get(url, stream=True, timeout=60) as r:
        r.raise_for_status()
        name = Path(name).name if name else _name(r, url)
        if not allow_pickle and not name.lower().endswith(config.SAFE_MODEL_TYPES):
            raise ValueError(f"{name} is not {' or '.join(config.SAFE_MODEL_TYPES)}: a pickle can run code when it is "
                             "loaded. Pass --allow-pickle if you trust it.")
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
