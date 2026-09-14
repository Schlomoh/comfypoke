"""CPU side: the full ComfyUI GUI. Runs are relayed to Worker by the gpu_relay
custom node, which activates on COMFY_RELAY=1. The access_key node gates
every request behind the key from .access_key (read on the laptop at deploy
time, never shipped as a file)."""
import shutil
from pathlib import Path

import modal

from . import comfy, config, volumes
from .app import app


def read_access_key() -> str:
    if not modal.is_local():
        return ""
    return (Path(__file__).resolve().parents[1] / config.ACCESS_KEY_FILE).read_text().strip()


@app.cls(
    cpu=2.0,
    memory=4096,
    max_containers=1,
    volumes={config.CACHE_DIR: volumes.models, config.DATA_DIR: volumes.data, config.IO_DIR: volumes.io},
    secrets=[modal.Secret.from_dict(config.container_env(COMFY_RELAY="1", COMFY_ACCESS_KEY=read_access_key(), COMFY_DATA_VOLUME=config.VOLUME_DATA))],
    scaledown_window=config.UI_IDLE_SECONDS,
    enable_memory_snapshot=True,
)
@modal.concurrent(max_inputs=50)
class UI:
    @modal.enter(snap=True)
    def start(self):
        # Only user/default (workflows, settings) lives on the volume. The user dir itself
        # stays local because comfy-cli keeps its log there open for the life of the process,
        # and an open file on the volume blocks the reload that shows files put from outside.
        shared = Path(config.DATA_DIR, "user", "default")
        shared.mkdir(parents=True, exist_ok=True)
        local = Path(config.COMFY_DIR, "user", "default")
        if local.is_symlink():
            local.unlink()
        elif local.exists():
            shutil.rmtree(local)
        local.parent.mkdir(parents=True, exist_ok=True)
        local.symlink_to(shared)
        comfy.launch(config.UI_PORT, extra_args=("--cpu",))

    @modal.enter(snap=False)
    def restored(self):
        comfy.wait_for_port(config.UI_PORT, timeout=120)  # a restored snapshot must not serve before ComfyUI answers

    @modal.web_server(config.UI_PORT, startup_timeout=300)
    def ui(self):  # method name is part of the URL: <workspace>--comfy-ui-ui.modal.run
        pass
