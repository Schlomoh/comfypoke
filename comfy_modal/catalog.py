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
    # --- FLUX.2 klein 9B: the bigger klein, bf16 (18.2 GB model, 16.4 GB text encoder) ---
    # The diffusion model is GATED on Hugging Face: accept the licence at
    # huggingface.co/black-forest-labs/FLUX.2-klein-9B, then deploy with HF_TOKEN in your
    # environment or in .env (the console's Tokens menu writes it there). Without a token the
    # image build fails with a 401 on this file.
    # Comfy-Org ships only the encoder and VAE for 9B, so the weights come from BFL directly.
    # It needs qwen_3_8b, not the 4B's qwen_3_4b. The VAE is the same flux2-vae.safetensors the
    # 4B already pulls, so it is not repeated.
    # Both files together are about 35 GB and fit an L40S's 48 GB alongside the VAE. For fp8
    # instead, roughly half the size and half the cold-boot load: repo
    # "black-forest-labs/FLUX.2-klein-9b-fp8", file "flux-2-klein-9b-fp8.safetensors" (9.4 GB)
    # with qwen_3_8b_fp8mixed.safetensors (8.7 GB). That repo is gated separately.
    Model("black-forest-labs/FLUX.2-klein-9B", "flux-2-klein-9b.safetensors", "diffusion_models"),
    Model("Comfy-Org/vae-text-encorder-for-flux-klein-9b", "split_files/text_encoders/qwen_3_8b.safetensors", "text_encoders"),
    # --- SeedVR2 7B: one-step restoration upscaler (Apache 2.0), workflow 03 ---
    Model("Comfy-Org/SeedVR2", "diffusion_models/seedvr2_7b_fp16.safetensors", "diffusion_models"),
    Model("Comfy-Org/SeedVR2", "vae/seedvr2_ema_vae_fp16.safetensors", "vae"),
]

# Custom node packs by registry id (https://registry.comfy.org). The default workflows use only nodes that
# ship with current ComfyUI (comfy-cli installs the latest release at build time).
NODE_PACKS = []
