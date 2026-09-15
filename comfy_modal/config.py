"""Every tunable in one place. Override the GPU with MODAL_GPU=H100 at deploy time."""
import os
import time

import modal

APP_NAME = "comfypoke"  # deployed URL: https://<workspace>--comfypoke-ui-ui.modal.run

GPU = os.getenv("MODAL_GPU", "L40S")  # 48 GB; H100 for the 32B-class models

# Inside the containers
COMFY_DIR = "/root/comfy/ComfyUI"
CACHE_DIR = "/cache"  # models volume: HF download cache + extra/<subdir>/ for hand-uploaded files
DATA_DIR = "/data"  # UI only: user/ (saved workflows, settings, its sqlite db)
IO_DIR = "/io"  # shared: output/ and input/

WORKER_PORT = 8188
UI_PORT = 8000

# Seconds of idleness before a container shuts down. The worker keeps its
# models loaded while alive, so a longer window means faster iteration at the
# price of idle GPU time (about 16 cents per 5 minutes on an L40S). The GUI's
# GPU badge has a keep-warm control for longer sessions.
WORKER_IDLE_SECONDS = 300
UI_IDLE_SECONDS = 600

# A render sends progress every step, but a one-step model (SeedVR2 7B, 16 GB)
# sends nothing between "executing" and its result: loading it from the volume
# cold plus a 4 MP pass took over 300 s. This long without any message means
# the worker is wedged: the relay interrupts the prompt and reports an error.
WORKER_TIMEOUT_SECONDS = 900

# Shown in the GUI's GPU badge as a session cost estimate: L40S list price on modal.com/pricing (edit if it changes).
GPU_RATE_PER_HOUR = 1.95

VOLUME_MODELS = f"{APP_NAME}-models"
VOLUME_DATA = f"{APP_NAME}-data"
VOLUME_IO = f"{APP_NAME}-io"

HF_SECRET_NAME = "huggingface-secret"  # optional, only for gated repos
ACCESS_KEY_FILE = ".access_key"  # repo root, git-ignored, read at deploy time only

# Minted once per `modal deploy` on the laptop and shipped to both classes, so a
# worker container left over from the previous deploy rejects the new UI's
# prompts instead of rendering them with old code. Inside a container it is the
# value the Secret carried in.
DEPLOY_ID = time.strftime("%Y%m%d-%H%M%S") if modal.is_local() else os.environ.get("COMFY_DEPLOY_ID", "")

# Env-var contract with comfy_nodes/, which run inside ComfyUI and cannot import
# this package. Both classes ship container_env() as a Modal Secret; the nodes
# read exactly these names and fail at start when one is missing. The UI adds
# COMFY_RELAY=1 and COMFY_ACCESS_KEY, which turn on the relay and the key gate.
CONTAINER_ENV = {
    "COMFY_MODAL_APP": APP_NAME,  # gpu_relay: app that hosts Worker
    "COMFY_IO_VOLUME": VOLUME_IO,  # gpu_relay: committed before each prompt so uploads reach the worker
    "COMFY_DEPLOY_ID": DEPLOY_ID,  # gpu_relay: sent with each prompt; Worker.run rejects any other value
    "COMFY_WORKER_TIMEOUT": str(WORKER_TIMEOUT_SECONDS),  # gpu_relay: seconds without a worker message before the job is failed
    "COMFY_MODELS_VOLUME": VOLUME_MODELS,  # extra_models: volume holding hand-uploaded files
    "COMFY_EXTRA_MODELS": "extra",  # extra_models: their path on it, copied into models/<folder>/ on every /object_info request
    "COMFY_GPU": GPU,  # gpu_relay: shown in the GUI's GPU badge
    "COMFY_STATE_DICT": f"{APP_NAME}-worker-state",  # gpu_relay + Worker: Modal Dict with the worker's heartbeat (state, since, last job)
    "COMFY_WORKER_IDLE": str(WORKER_IDLE_SECONDS),  # gpu_relay: idle window shown as a countdown in the GUI
    "COMFY_GPU_RATE": str(GPU_RATE_PER_HOUR),  # gpu_relay: cost estimate in the GUI
}


def container_env(**role: str) -> dict:
    return {**CONTAINER_ENV, **role}
