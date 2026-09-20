"""Container image: ComfyUI via comfy-cli, node packs, model symlinks, our custom nodes.
Build pattern after caru-ini/modal-comfyui."""
import os
from pathlib import Path

import modal

from . import config, volumes
from .catalog import MODELS, NODE_PACKS


def download_models(models: list, comfy_dir: str, cache_dir: str):
    """Runs inside the image build. Self-contained on purpose: Modal ships this
    function's source plus these arguments, nothing else from the package."""
    import os
    from pathlib import Path

    from huggingface_hub import hf_hub_download

    for repo, file, folder, name in models:
        src = hf_hub_download(repo, file, cache_dir=cache_dir, token=os.environ.get("HF_TOKEN"))
        dst = Path(comfy_dir, "models", folder, name or Path(file).name)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.is_symlink() or dst.exists():
            dst.unlink()
        dst.symlink_to(src)
        print(f"{repo}/{file} -> {dst}")


def local_hf_token() -> str:
    """HF_TOKEN as the rest of the tools see it: the environment first, then .env, which is
    where the console's Tokens menu puts it. Only read on this Mac, at deploy time."""
    if not modal.is_local():
        return ""
    if os.environ.get("HF_TOKEN"):
        return os.environ["HF_TOKEN"].strip()
    env_file = Path(__file__).resolve().parents[1] / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip() == "HF_TOKEN":
                return value.strip()
    return ""


def hf_secrets() -> list:
    """Only gated repos need a token, and the models in catalog.py download inside the image
    build, in a container that cannot see this Mac's environment. So whatever token you already
    have has to be shipped to that container.

    HF_TOKEN in your shell or in .env is enough, the same one `tools/sync.sh hf` uses; it is
    read here at deploy time and sent as a Secret, the way .access_key already is. A Modal
    secret named huggingface-secret still works and wins, for a token you would rather not keep
    in a shell."""
    try:
        s = modal.Secret.from_name(config.HF_SECRET_NAME)
        s.hydrate()
        return [s]
    except modal.exception.NotFoundError:
        pass
    token = local_hf_token()
    return [modal.Secret.from_dict({"HF_TOKEN": token})] if token else []


image = (
    modal.Image.debian_slim(python_version="3.12")
    .apt_install("git", "libgl1", "libglib2.0-0")
    .uv_pip_install("comfy-cli", "huggingface_hub[hf_transfer]")
    .run_commands("comfy --skip-prompt install --nvidia")
    .env({"HF_XET_HIGH_PERFORMANCE": "1"})
    .run_function(
        download_models,
        kwargs={"models": [tuple(m) for m in MODELS], "comfy_dir": config.COMFY_DIR, "cache_dir": config.CACHE_DIR},
        volumes={config.CACHE_DIR: volumes.models},
        secrets=hf_secrets(),
    )
    .run_commands(*([f"comfy node install {' '.join(NODE_PACKS)}"] if NODE_PACKS else []))  # after the model layer: a pack change must not redo the download
    # Mounted at container start (copy=False): editing these needs no image rebuild.
    .add_local_dir("comfy_nodes", f"{config.COMFY_DIR}/custom_nodes", copy=False)
    .add_local_python_source("comfy_modal", copy=False)
)
