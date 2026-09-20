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
    # --- Krea 2 Turbo: 12B aesthetic-first text to image, 8 steps (Krea 2 Community License), workflow 04 ---
    # Not gated, so it needs no token. The licence is Krea's own, not Apache: read
    # huggingface.co/Comfy-Org/Krea-2/blob/main/LICENSE.pdf before you sell anything made with it.
    # Turbo is the distilled checkpoint you generate with; RAW is the undistilled one for training
    # LoRAs (krea2_raw_bf16.safetensors, 52 steps, CFG 3.5), and Krea's advice is to train on RAW
    # and run the LoRA on Turbo. bf16 here for the same reason as klein 9B: volume storage is free
    # up to 1 TiB and the model plus its encoder is 35 GB, inside an L40S's 48 GB. For half that,
    # swap in krea2_turbo_fp8_scaled.safetensors (13.1 GB) and qwen3vl_4b_fp8_scaled.safetensors (5.2 GB).
    Model("Comfy-Org/Krea-2", "diffusion_models/krea2_turbo_bf16.safetensors", "diffusion_models"),
    Model("Comfy-Org/Krea-2", "text_encoders/qwen3vl_4b_bf16.safetensors", "text_encoders"),
    Model("Comfy-Org/Krea-2", "vae/qwen_image_vae.safetensors", "vae"),
    # The ten style LoRAs (krea2_darkbrush, krea2_retroanime, ...) are 470 MB each and are not
    # pulled by default: tools/sync.sh hf Comfy-Org/Krea-2 loras/krea2_darkbrush.safetensors
    # puts one in the dropdown without rebuilding the image. Each has a trigger word, listed at
    # docs.comfy.org/tutorials/image/krea/krea-2.
    # --- SeedVR2 7B: one-step restoration upscaler (Apache 2.0), workflow 03 ---
    Model("Comfy-Org/SeedVR2", "diffusion_models/seedvr2_7b_fp16.safetensors", "diffusion_models"),
    Model("Comfy-Org/SeedVR2", "vae/seedvr2_ema_vae_fp16.safetensors", "vae"),
]

# Custom node packs by registry id (https://registry.comfy.org). The default workflows use only nodes that
# ship with the pinned ComfyUI (COMFY_VERSION in comfy_modal/image.py).
NODE_PACKS = []
