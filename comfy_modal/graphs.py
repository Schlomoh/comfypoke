"""The studio's text-to-image graphs, one per model family, as API prompts. A family fixes the text
encoder, the VAE and the sampling; the diffusion model file inside it is the user's choice, so any
file on the volume can be tried with any family, and a mismatch fails in ComfyUI's loader.

Krea 2 is workflows 04 and 05 in tools/build_workflows.py, Z-Image is workflow 01. LoRAs chain
between the model loader and the rest. Every graph ends in SaveImageWebsocket: the PNG goes back
over the worker's socket instead of onto the io volume, so a studio render leaves no file behind.
The negative prompt is used only when CFG is above 1; at 1 a distilled model ignores it anyway."""
import re

from .catalog import MODELS as CATALOG

FAMILIES = {
    "krea2": {"label": "Krea 2", "clip": ("qwen3vl_4b_bf16.safetensors", "krea2"), "vae": "qwen_image_vae.safetensors",
              "latent": "EmptyLatentImage", "sampler": "euler", "steps": 8, "cfg": 1.0},
    "zimage": {"label": "Z-Image", "clip": ("qwen_3_4b.safetensors", "lumina2"), "vae": "ae.safetensors",
               "latent": "EmptySD3LatentImage", "sampler": "res_multistep", "steps": 8, "cfg": 1.0, "shift": 3},
}

# Files the studio has been run with, and the settings they were made for. Anything else on the
# volume is listed as unverified, with its family guessed from the name.
VERIFIED = {
    "krea2_turbo_bf16.safetensors": {"family": "krea2", "steps": 8, "cfg": 1.0},
    "krea2_raw_bf16.safetensors": {"family": "krea2", "steps": 52, "cfg": 3.5},
    "z_image_turbo_bf16.safetensors": {"family": "zimage", "steps": 8, "cfg": 1.0},
}
# Catalog files in diffusion_models no family can run: a detector, an upscaler, and FLUX.2 klein,
# whose sampling (Flux2Scheduler, CFGGuider) is a graph of its own.
NO_FAMILY = ("rt_detr", "seedvr2", "flux-2")

SAMPLER = "7"  # the node whose progress messages are the step counter: the render, or the retouch before an upscale
UPSCALER = "46"
STAGES = {"1": "loading", "2": "loading", "3": "loading", "30": "loading", "4": "encoding", "11": "encoding", SAMPLER: "sampling",
          "8": "decoding", "40": "upscaling", "44": "upscaling", UPSCALER: "upscaling", "47": "decoding", "9": "decoding"}
UPSCALE_MEGAPIXELS = (2, 4, 8)  # 4 MP is 2048 square; 8 is about 2.8K; SeedVR2 7B fits all three on an L40S with tiled VAE

def guess(file: str) -> str:
    name = file.lower()
    return "zimage" if re.search(r"z[_-]?image|(^|[_\-. ])zit([_\-. ]|$)", name) else "krea2"


def describe(file: str) -> dict:
    v = VERIFIED.get(file)
    family = v["family"] if v else guess(file)
    f = FAMILIES[family]
    return {"file": file, "family": family, "verified": bool(v), "steps": (v or f)["steps"], "cfg": (v or f)["cfg"]}


def catalog_files() -> list[str]:
    return [m.name or m.file.rsplit("/", 1)[-1] for m in CATALOG
            if m.folder == "diffusion_models" and not any(k in m.file for k in NO_FAMILY)]


def _base(family: str, unet: str, text: str, negative: str, cfg: float, loras: list[tuple[str, float]]) -> tuple[dict, list]:
    """Loaders, prompt and LoRA chain shared by a render and a retouch; returns the nodes and the model to sample with."""
    f = FAMILIES[family]
    g = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": unet, "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": f["clip"][0], "type": f["clip"][1], "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": f["vae"]}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"text": text, "clip": ["2", 0]}},
        "5": ({"class_type": "CLIPTextEncode", "inputs": {"text": negative, "clip": ["2", 0]}} if cfg > 1
              else {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["4", 0]}}),
    }
    model = ["1", 0]
    for i, (name, strength) in enumerate(loras):
        node = str(20 + i)
        g[node] = {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": name, "strength_model": strength, "model": model}}
        model = [node, 0]
    if "shift" in f:
        g["10"] = {"class_type": "ModelSamplingAuraFlow", "inputs": {"shift": f["shift"], "model": model}}
        model = ["10", 0]
    return g, model


def _sampler(family: str, model: list, latent: list, seed: int, steps: int, cfg: float, denoise: float) -> dict:
    return {"class_type": "KSampler", "inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": FAMILIES[family]["sampler"],
                                                 "scheduler": "simple", "denoise": denoise, "model": model, "positive": ["4", 0],
                                                 "negative": ["5", 0], "latent_image": latent}}


def graph(family: str, unet: str, text: str, negative: str, width: int, height: int, seed: int, steps: int, cfg: float,
          loras: list[tuple[str, float]]) -> dict:
    g, model = _base(family, unet, text, negative, cfg, loras)
    g["6"] = {"class_type": FAMILIES[family]["latent"], "inputs": {"width": width, "height": height, "batch_size": 1}}
    g[SAMPLER] = _sampler(family, model, ["6", 0], seed, steps, cfg, 1.0)
    g["8"] = {"class_type": "VAEDecode", "inputs": {"samples": [SAMPLER, 0], "vae": ["3", 0]}}
    g["9"] = {"class_type": "SaveImageWebsocket", "inputs": {"images": ["8", 0]}}
    return g


def upscale(image_b64: str, megapixels: float, seed: int, retouch: dict | None = None) -> dict:
    """SeedVR2 to `megapixels`, workflow 03's chain. With `retouch` (family, unet, text, negative, steps,
    cfg, loras, denoise) a light img2img pass with the image's own model runs first, at its own size:
    the prompt steers the touch-up cheaply, and SeedVR2 then restores detail on the result."""
    g = {"30": {"class_type": "StudioImageBase64", "inputs": {"data": image_b64}}}
    source = ["30", 0]
    if retouch:
        r = retouch
        base, model = _base(r["family"], r["unet"], r["text"], r["negative"], r["cfg"], r["loras"])
        g |= base
        g["11"] = {"class_type": "VAEEncode", "inputs": {"pixels": source, "vae": ["3", 0]}}
        g[SAMPLER] = _sampler(r["family"], model, ["11", 0], seed, r["steps"], r["cfg"], r["denoise"])
        g["8"] = {"class_type": "VAEDecode", "inputs": {"samples": [SAMPLER, 0], "vae": ["3", 0]}}
        source = ["8", 0]
    tiled = {"tile_size": 512, "overlap": 128, "temporal_size": 4096, "temporal_overlap": 8}
    g |= {
        "40": {"class_type": "UNETLoader", "inputs": {"unet_name": "seedvr2_7b_fp16.safetensors", "weight_dtype": "default"}},
        "41": {"class_type": "VAELoader", "inputs": {"vae_name": "seedvr2_ema_vae_fp16.safetensors"}},
        "42": {"class_type": "ImageScaleToTotalPixels", "inputs": {"upscale_method": "lanczos", "megapixels": megapixels, "resolution_steps": 1, "image": source}},
        "43": {"class_type": "SeedVR2Preprocess", "inputs": {"resized_images": ["42", 0]}},
        "44": {"class_type": "VAEEncodeTiled", "inputs": {**tiled, "pixels": ["43", 0], "vae": ["41", 0]}},
        "45": {"class_type": "SeedVR2Conditioning", "inputs": {"model": ["40", 0], "vae_conditioning": ["44", 0]}},
        UPSCALER: {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 1, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
                                                        "denoise": 1.0, "model": ["40", 0], "positive": ["45", 0], "negative": ["45", 1],
                                                        "latent_image": ["44", 0]}},
        "47": {"class_type": "VAEDecodeTiled", "inputs": {**tiled, "samples": [UPSCALER, 0], "vae": ["41", 0]}},
        "48": {"class_type": "SeedVR2PostProcessing", "inputs": {"color_correction_method": "lab", "images": ["47", 0], "original_resized_images": ["42", 0]}},
        "9": {"class_type": "SaveImageWebsocket", "inputs": {"images": ["48", 0]}},
    }
    return g
