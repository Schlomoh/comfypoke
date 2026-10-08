"""Every tunable in one place. Pin one GPU type with MODAL_GPU=H100 at deploy time."""
import os
import time

import modal

APP_NAME = "comfypoke"  # deployed URL: https://<workspace>--comfypoke-ui-ui.modal.run

# Tried in order each time a worker starts. When Modal has no L40S free, a prompt used to wait in
# its queue until one turned up; now the next type boots instead. A running worker keeps the GPU it
# got, so a fallback one idles out sooner (FALLBACK_IDLE_SECONDS) and the next boot tries L40S again.
GPUS = [os.environ["MODAL_GPU"]] if os.getenv("MODAL_GPU") else ["L40S", "A100-40GB"]  # 48 GB, 40 GB

# List prices per hour from modal.com/pricing, for the badge's cost estimate (edit if they change).
GPU_RATES_PER_HOUR = {"L40S": 1.95, "A100-40GB": 2.10, "A100-80GB": 2.50, "H100": 3.95, "H200": 4.54, "B200": 6.25}

# The plan's monthly credit allowance (Starter $30, Team $100). Modal's billing API reports the
# credits used this month but not what is left, so the badge subtracts from this.
MONTHLY_CREDITS = 30

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
FALLBACK_IDLE_SECONDS = 120  # a worker on anything but GPUS[0]; keep-warm still holds it

# A render sends progress every step, but a one-step model (SeedVR2 7B, 16 GB)
# sends nothing between "executing" and its result: loading it from the volume
# cold plus a 4 MP pass took over 300 s. This long without any message means
# the worker is wedged: the relay interrupts the prompt and reports an error.
WORKER_TIMEOUT_SECONDS = 900

# Modal's own ceiling on one Worker call, which is a different thing from the watchdog above: the
# watchdog fires on silence, and a render that streams progress every step is never silent, so
# this is what actually ends a long job. It defaults to 300 s, which a 52-step render at any real
# resolution walks straight past, and the failure reads as FunctionTimeoutError rather than as
# anything to do with the picture. An hour is past the point where you would want it to stop.
WORKER_CALL_TIMEOUT = 3600

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
    "COMFY_EXTRA_MODELS": "extra",  # extra_models: their path on it, linked into models/<folder>/ before every request that lists models
    "COMFY_MODELS_MOUNT": CACHE_DIR,  # extra_models: where the models volume is mounted, so the links can point into it
    "COMFY_GPU": GPUS[0],  # gpu_relay: shown in the GUI's GPU badge while no worker is up; a running one reports its own
    "COMFY_STATE_DICT": f"{APP_NAME}-worker-state",  # gpu_relay + Worker: Modal Dict with the worker's heartbeat (state, since, last job)
    "COMFY_WORKER_IDLE": str(WORKER_IDLE_SECONDS),  # gpu_relay: idle window shown as a countdown in the GUI
    "COMFY_GPU_RATE": str(GPU_RATES_PER_HOUR.get(GPUS[0], 0)),  # gpu_relay: cost estimate in the GUI, same caveat
    "COMFY_MONTHLY_CREDITS": str(MONTHLY_CREDITS),  # gpu_relay: credits left this month, in the GUI
}


def container_env(**role: str) -> dict:
    return {**CONTAINER_ENV, **role}
