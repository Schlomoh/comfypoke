"""What gets installed. Edit this file to add models or node packs, then deploy.

A Model is downloaded from Hugging Face into the models volume once and
symlinked into ComfyUI's models/<folder>/. Files you upload by hand go to
extra/<folder>/ on the same volume (tools/sync.sh lora <file>) and need no
rebuild: the extra_models node links them in on the next page load.
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
    # Turbo is the distilled checkpoint, 8 steps at CFG 1; RAW is the same model undistilled, 52
    # steps at CFG 3.5, which is roughly a hundred times the sampling work per image. Krea's own
    # advice is to train LoRAs on RAW and run them on Turbo, so Turbo is workflow 04. RAW is here
    # as workflow 05 because distillation bakes in a look and takes the negative prompt away with
    # it: at CFG 1 there is nothing for a negative prompt to push against. Reach for RAW when
    # Turbo keeps giving you the same answer. bf16 here for the same reason as klein 9B: storage is free
    # up to 1 TiB and the model plus its encoder is 35 GB, inside an L40S's 48 GB. For half that,
    # swap in krea2_turbo_fp8_scaled.safetensors (13.1 GB) and qwen3vl_4b_fp8_scaled.safetensors (5.2 GB).
    Model("Comfy-Org/Krea-2", "diffusion_models/krea2_turbo_bf16.safetensors", "diffusion_models"),
    Model("Comfy-Org/Krea-2", "diffusion_models/krea2_raw_bf16.safetensors", "diffusion_models"),  # workflow 05
    Model("Comfy-Org/Krea-2", "text_encoders/qwen3vl_4b_bf16.safetensors", "text_encoders"),
    Model("Comfy-Org/Krea-2", "vae/qwen_image_vae.safetensors", "vae"),
    # The ten style LoRAs (krea2_darkbrush, krea2_retroanime, ...) are 470 MB each and are not
    # pulled by default: tools/sync.sh hf Comfy-Org/Krea-2 loras/krea2_darkbrush.safetensors
    # puts one in the dropdown without rebuilding the image. Each has a trigger word, listed at
    # docs.comfy.org/tutorials/image/krea/krea-2.
    # --- Masking and structure, used by workflows 07, 08, 09 and 10 ---
    # These were installed by hand through the Manager once and did not survive the next cold
    # start, because the container is rebuilt from this image every time. Listed here they stay.
    # SAM 3.1 segments by text ("clothing"). Comfy-Org's repackaging is not gated; facebook/sam3
    # needs manual approval. It is a full checkpoint, so CheckpointLoaderSimple loads it and its
    # CLIP encodes the thing to find.
    Model("Comfy-Org/sam3.1", "checkpoints/sam3.1_multiplex_fp16.safetensors", "checkpoints"),
    # RT-DETR finds the person, and its box is what makes SAM 3D Body pick the right one.
    Model("Comfy-Org/RT-DETR", "diffusion_models/rt_detr_v4-x-hgnet_fp16.safetensors", "diffusion_models"),
    # SAM 3D Body fits a body mesh, which renders to a depth map the controlnet can hold a pose to.
    Model("Comfy-Org/sam-3d-body", "detection/sam_3d_body_dinov3_bf16.safetensors", "detection"),
    # Z-Image's Fun Controlnet, union 2.1: inpaint plus canny, depth and pose in one patch. The
    # inpaint mode is what lets workflow 08 denoise fully instead of creeping up from 0.6, because
    # the model is handed the pixels around the mask instead of guessing at them. Krea 2 has no
    # equivalent, which is why workflow 09 uses the LanPaint sampler for the same job.
    # There is a 2.02 GB "lite" build in the same repo if 6.7 GB is not worth it to you.
    Model("alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1",
          "Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors", "model_patches"),
    # --- Krea 2 pose control (Apache 2.0), workflow 10 ---
    # An OpenPose control LoRA: hand it a skeleton map and the body follows it while the prompt
    # decides the clothes. It loads with the stock LoraLoaderModelOnly, but the conditioning has
    # to go through ostris' encoder (NODE_PACKS below), which is what feeds the map to Qwen3-VL.
    # Trained on Krea 2 Turbo. Workflow 10 runs it on RAW anyway, which is the thing to suspect
    # first if the pose does not take; krea2_turbo_bf16 at 8 steps and CFG 1 is the trained case.
    Model("thedeoxen/Krea-2-pose-controlnet", "krea2_turbo_openpose_controlnet.safetensors", "loras"),
    # --- BFS head swap for Krea 2: the studio's face photos ---
    # Puts the head from a reference photo onto a rendered person: the render and the photo go in as
    # two references through comfyui-krea2edit (NODE_PACKS), prompt "head_swap: replace the head with
    # the reference head.", Turbo at 10 steps and CFG 1. graphs.HEADSWAP_LORA. Its maker's workflow:
    # huggingface.co/Alissonerdx/BFS-Best-Face-Swap, workflows/Head Swap Krea 2 - V1 Simple Workflow.json.
    # krea2-reid stood here before; one photo gave it a lookalike, not the person.
    Model("Alissonerdx/BFS-Best-Face-Swap", "bfs_head_swap_v1.1_krea2.safetensors", "loras"),
    # --- InsightFace buffalo_l: the studio's face match (comfy_nodes/studio_face) ---
    # The SCRFD detector and the ArcFace recognizer only; the pack's landmark and age models are not used. The weights
    # are for non-commercial use, which is what this deploy is. public-data/insightface mirrors the official release.
    Model("public-data/insightface", "models/buffalo_l/det_10g.onnx", "insightface/models/buffalo_l"),
    Model("public-data/insightface", "models/buffalo_l/w600k_r50.onnx", "insightface/models/buffalo_l"),
    # --- SeedVR2 7B: one-step restoration upscaler (Apache 2.0), workflow 03 ---
    Model("Comfy-Org/SeedVR2", "diffusion_models/seedvr2_7b_fp16.safetensors", "diffusion_models"),
    Model("Comfy-Org/SeedVR2", "vae/seedvr2_ema_vae_fp16.safetensors", "vae"),
]

# Custom node packs by registry id (https://registry.comfy.org), installed straight from the
# registry: see the note in comfy_modal/image.py for why not `comfy node install`. The default
# workflows use only nodes that ship with the pinned ComfyUI (COMFY_VERSION there) plus these.
# LanPaint: a drop-in replacement for KSampler that inpaints well without an inpainting
# checkpoint. A plain noise mask re-noises the unmasked pixels to the current sigma every step,
# so during the early steps, the ones that decide the composition, the "context" is nearly pure
# noise. LanPaint runs a few Langevin iterations inside each step so the masked and unmasked
# regions settle against each other instead. Training-free, no model files, and its README lists
# Krea 2 among the architectures it handles. registry.comfy.org/publishers/scraed/nodes/LanPaint
# Crop and stitch: cut a context-padded box around the mask, edit that at the model's own
# resolution, blend it back. Without it a 200 px jacket in a 2K photo only ever gets 200 px of the
# model's attention. Installing it from the GUI does not stick, because the container is rebuilt
# from this image every cold start; listed here it is part of the image.
# Krea 2 Identity Edit (comfyui-krea2edit): the source-patch and grounded-encode nodes the BFS head
# swap was trained with; two references at once, and a dial for how hard the second one is copied.
# comfyui-gguf-reboot (molbal's fork of city96's ComfyUI-GGUF): UnetLoaderGGUF, the loader graphs.LOADERS uses for
# quantized .gguf diffusion models put in extra/diffusion_models. The fork, because city96's refuses Krea 2 files
# ("Unexpected architecture type in GGUF file: 'krea2'"). Never both: they register the same node names.
# Each pinned to a version: a rebuild must not take whatever the registry serves that day, since a pack's code runs in
# the Worker (opened images) and the UI (the access key). Bump one on purpose, and read its changes first.
# comfyui-gguf-reboot: every release since 26.8.13 is "Flagged" on registry.comfy.org, without a stated reason; 26.11.16
# is what the image ran when it was pinned (2026-11-27). Worth a look before the next bump.
NODE_PACKS = {
    "LanPaint": "2.1.0",
    "comfyui-inpaint-cropandstitch": "3.0.20",
    "comfyui-krea2-ostris-edit": "1.0.1",
    "comfyui-krea2edit": "1.2.3",
    "comfyui-gguf-reboot": "26.11.16",
}

# The commit each Hugging Face repo is downloaded at, so a rebuild cannot take a file swapped in on the repo since.
# These were each repo's main on 2026-11-27, when the models layer was last built. A new repo needs its entry (the
# image build stops without one); its commit is "sha" at https://huggingface.co/api/models/<repo>/revision/main.
# Some repos have been renamed since (z_image_turbo, flux2-klein, ...): the old names redirect, and renaming them here
# would download every file again into a new cache folder.
REVISIONS = {
    "Alissonerdx/BFS-Best-Face-Swap": "2209ae537ac5e883d6ec7db5b7bd6dccf1a0eba7",
    "Comfy-Org/Krea-2": "588feaf955b08b9ac4723eeb751752ab045dba71",
    "Comfy-Org/RT-DETR": "8d913979f84c84f155b70ee77d96571a4728430b",
    "Comfy-Org/SeedVR2": "df48879708206a403d2a61acd55578c2e80fd233",
    "Comfy-Org/flux2-klein": "5b3abca5c0dc1ecd4eaf3340868d09063fc1c965",
    "Comfy-Org/sam-3d-body": "7c974aea58e062252a6cb5b6f9b7f639d545b729",
    "Comfy-Org/sam3.1": "7bb8374780a725b4353ed31f3a9395c9742b5621",
    "Comfy-Org/vae-text-encorder-for-flux-klein-9b": "1138ce884c8e977cdacacbe779784fec4426bb3f",
    "Comfy-Org/z_image_turbo": "6fc90a3b1b653e935a0d175e260736de25b84df5",
    "alibaba-pai/Z-Image-Turbo-Fun-Controlnet-Union-2.1": "5155fc56d17821007d6f62ac192c09e0f0e72016",
    "black-forest-labs/FLUX.2-klein-9B": "1498bcb8aaebb230bae82c34b02ecc4087beebac",
    "public-data/insightface": "33c1063c49c785b7652d3fd529f86fa4f149392b",  # a third party's mirror of the official release
    "thedeoxen/Krea-2-pose-controlnet": "1da9762ca46e6c9e4014b309bf0147889f10982a",
}
