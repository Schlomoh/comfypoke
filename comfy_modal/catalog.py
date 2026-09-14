"""What gets installed. Edit this file to add models or node packs, then deploy.

A Model is downloaded from Hugging Face into the models volume once and
symlinked into ComfyUI's models/<folder>/. Files you upload by hand go to
extra/<folder>/ on the same volume (tools/sync.sh lora <file>) and need no
rebuild: the extra_models node copies them in on the next page load.
"""
from typing import NamedTuple


class Model(NamedTuple):
    repo: str
    file: str
    folder: str  # ComfyUI models subfolder
    name: str = ""  # store under this name instead of the file's basename


MODELS = [
    # --- Z-Image-Turbo: 8-step text to image (Apache 2.0), workflow 01 ---
    Model("Comfy-Org/z_image_turbo", "split_files/diffusion_models/z_image_turbo_bf16.safetensors", "diffusion_models"),
    Model("Comfy-Org/z_image_turbo", "split_files/text_encoders/qwen_3_4b.safetensors", "text_encoders"),  # also FLUX.2 klein's text encoder
    Model("Comfy-Org/z_image_turbo", "split_files/vae/ae.safetensors", "vae"),
    # --- FLUX.2 klein 4B: 4-step text to image and editing (Apache 2.0), workflow 02 ---
    Model("Comfy-Org/flux2-klein", "split_files/diffusion_models/flux-2-klein-4b.safetensors", "diffusion_models"),
    Model("Comfy-Org/flux2-klein", "split_files/vae/flux2-vae.safetensors", "vae"),
    # --- SeedVR2 7B: one-step restoration upscaler (Apache 2.0), workflow 03 ---
    Model("Comfy-Org/SeedVR2", "diffusion_models/seedvr2_7b_fp16.safetensors", "diffusion_models"),
    Model("Comfy-Org/SeedVR2", "vae/seedvr2_ema_vae_fp16.safetensors", "vae"),
]

# Custom node packs by registry id (https://registry.comfy.org). The default workflows use only nodes that
# ship with current ComfyUI (comfy-cli installs the latest release at build time).
NODE_PACKS = []
