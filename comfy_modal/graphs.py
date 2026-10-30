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

SAMPLER = "7"  # the node whose progress messages are the step counter: the render, the retouch before an upscale, or an inpaint
UPSCALER = "46"
STAGES = {"1": "loading", "2": "loading", "3": "loading", "30": "loading", "4": "encoding", "11": "encoding", SAMPLER: "sampling",
          "8": "decoding", "40": "upscaling", "44": "upscaling", UPSCALER: "upscaling", "47": "decoding", "9": "decoding",
          "37": "masking", "39": "masking", "52": "masking", "54": "decoding", "74": "masking", "76": "masking", "78": "masking", "68": "swapping", "72": "swapping", "73": "decoding",
          "79": "decoding"}
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
    """Loaders, prompt and LoRA chain shared by a render, a retouch and an inpaint; returns the nodes and the model to sample with."""
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


# A face photo is put on the person by a second pass: the BFS head swap LoRA (catalog.py) on the image's own
# Krea 2 model, the image and the photo as the two references of comfyui-krea2edit, as its maker's workflow
# does it. ref_boost 4.0 is that workflow's recommended fidelity: higher copies the photo harder.
# Only a box around the head is swapped, at 1024, and only the head is blended back: swapping the whole
# picture redrew all of it at 1 MP, softer than the render, and left a small head a few dozen pixels.
HEADSWAP_LORA = "bfs_head_swap_v1.1_krea2.safetensors"
HEADSWAP_PROMPT = "head_swap: replace the head with the reference head."
HEADSWAP_FAMILIES = ("krea2",)
SWAPPER = "72"  # the head swap's sampler: its steps count again after the render's


def _headswap(g: dict, image: list, face_b64: str, seed: int, ref_boost: float = 4.0) -> list:
    """Adds the head swap to a graph that already has the Krea 2 loaders as 1, 2 and 3; returns the image
    with the head swapped and everything else untouched. The render's own LoRAs are left out on purpose:
    the swap LoRA was trained on the bare model."""
    both = {"image": ["78", 1], "image_b": ["62", 0]}
    g |= {
        # SAM 3.1 finds the head; the box around it (2.5x, so shoulders and some scene come along as the
        # swap LoRA expects) is cut out at 1024
        "74": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sam3.1_multiplex_fp16.safetensors"}},
        "75": {"class_type": "CLIPTextEncode", "inputs": {"text": "head", "clip": ["74", 1]}},
        "76": {"class_type": "SAM3_Detect", "inputs": {"threshold": 0.5, "refine_iterations": 2, "individual_masks": False,
                                                       "model": ["74", 0], "image": image, "conditioning": ["75", 0]}},
        "77": {"class_type": "GrowMask", "inputs": {"expand": 16, "tapered_corners": True, "mask": ["76", 0]}},
        "78": {"class_type": "InpaintCropImproved", "inputs": {**CROP, "context_from_mask_extend_factor": 2.5, "image": image,
                                                               "mask": ["77", 0]}},
        "60": {"class_type": "StudioImageBase64", "inputs": {"data": face_b64}},
        "62": {"class_type": "ImageScaleToTotalPixels", "inputs": {"upscale_method": "lanczos", "megapixels": 1.0,
                                                                   "resolution_steps": 16, "image": ["60", 0]}},
        "65": {"class_type": "LoraLoaderModelOnly", "inputs": {"lora_name": HEADSWAP_LORA, "strength_model": 1.0, "model": ["1", 0]}},
        "66": {"class_type": "VAEEncode", "inputs": {"pixels": ["78", 1], "vae": ["3", 0]}},
        "67": {"class_type": "VAEEncode", "inputs": {"pixels": ["62", 0], "vae": ["3", 0]}},
        "68": {"class_type": "Krea2EditModelPatch", "inputs": {
            "model": ["65", 0], "source_latent": ["66", 0], "source_latent_b": ["67", 0], "ref_boost": ref_boost, "ref_boost_a": 1.0,
            "fit_mode": "fit", "vae": ["3", 0], "source_image": ["78", 1], "source_image_b": ["62", 0]}},
        "69": {"class_type": "Krea2EditGroundedEncode", "inputs": {"clip": ["2", 0], "prompt": HEADSWAP_PROMPT, "grounding_px": 512,
                                                                   "system_prompt": "", **both}},
        "70": {"class_type": "Krea2EditGroundedEncode", "inputs": {"clip": ["2", 0], "prompt": "", "grounding_px": 768,
                                                                   "system_prompt": "", **both}},
        "71": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        SWAPPER: {"class_type": "KSampler", "inputs": {"seed": seed, "steps": 10, "cfg": 1.0, "sampler_name": "euler", "scheduler": "simple",
                                                      "denoise": 1.0, "model": ["68", 0], "positive": ["69", 0], "negative": ["70", 0],
                                                      "latent_image": ["71", 0]}},
        "73": {"class_type": "VAEDecode", "inputs": {"samples": [SWAPPER, 0], "vae": ["3", 0]}},
        # only the head goes back in, blended over 32 px; the rest of the picture is the render's own pixels
        "79": {"class_type": "InpaintStitchImproved", "inputs": {"stitcher": ["78", 0], "inpainted_image": ["73", 0]}},
    }
    return ["79", 0]


def _sampler(family: str, model: list, latent: list, seed: int, steps: int, cfg: float, denoise: float) -> dict:
    return {"class_type": "KSampler", "inputs": {"seed": seed, "steps": steps, "cfg": cfg, "sampler_name": FAMILIES[family]["sampler"],
                                                 "scheduler": "simple", "denoise": denoise, "model": model, "positive": ["4", 0],
                                                 "negative": ["5", 0], "latent_image": latent}}


def graph(family: str, unet: str, text: str, negative: str, width: int, height: int, seed: int, steps: int, cfg: float,
          loras: list[tuple[str, float]], face: str | None = None) -> dict:
    """A render; with `face` (a base64 photo) the head swap runs on it before it is sent back."""
    g, model = _base(family, unet, text, negative, cfg, loras)
    g["6"] = {"class_type": FAMILIES[family]["latent"], "inputs": {"width": width, "height": height, "batch_size": 1}}
    g[SAMPLER] = _sampler(family, model, ["6", 0], seed, steps, cfg, 1.0)
    g["8"] = {"class_type": "VAEDecode", "inputs": {"samples": [SAMPLER, 0], "vae": ["3", 0]}}
    out = _headswap(g, ["8", 0], face, seed) if face else ["8", 0]
    g["9"] = {"class_type": "SaveImageWebsocket", "inputs": {"images": out}}
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


# Workflow 09's crop: the source keeps its resolution, a box 1.5x the mask gives context, the box itself is
# worked on at 1024, and 32 px blend it back in.
CROP = {"downscale_algorithm": "bilinear", "upscale_algorithm": "lanczos", "preresize": False, "preresize_mode": "ensure minimum resolution",
        "preresize_min_width": 1024, "preresize_min_height": 1024, "preresize_max_width": 16384, "preresize_max_height": 16384,
        "mask_fill_holes": True, "mask_expand_pixels": 0, "mask_invert": False, "mask_blend_pixels": 32, "mask_hipass_filter": 0.1,
        "extend_for_outpainting": False, "extend_up_factor": 1.0, "extend_down_factor": 1.0, "extend_left_factor": 1.0,
        "extend_right_factor": 1.0, "context_from_mask_extend_factor": 1.5, "output_resize_to_target_size": True,
        "output_target_width": 1024, "output_target_height": 1024, "output_padding": "32", "device_mode": "gpu (much faster)"}


def inpaint(image_b64: str, mask_b64: str, target: str, r: dict, seed: int, face: str | None = None) -> dict:
    """Repaint part of an image, workflow 09's chain. The mask is what the phone painted (white on black, the
    image's size) plus, with `target`, what SAM 3.1 finds by that name. Only a box around it is cut out and
    re-rendered, by the image's own model (r: family, unet, text, negative, steps, cfg, loras), with LanPaint
    standing in for an inpainting checkpoint Krea 2 does not have; with `face`, the head swap runs on the result."""
    g = {
        "30": {"class_type": "StudioImageBase64", "inputs": {"data": image_b64}},
        "35": {"class_type": "StudioImageBase64", "inputs": {"data": mask_b64}},
        "36": {"class_type": "ImageToMask", "inputs": {"channel": "red", "image": ["35", 0]}},
    }
    mask = ["36", 0]
    if target:
        g |= {
            "37": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "sam3.1_multiplex_fp16.safetensors"}},
            "38": {"class_type": "CLIPTextEncode", "inputs": {"text": target, "clip": ["37", 1]}},
            "39": {"class_type": "SAM3_Detect", "inputs": {"threshold": 0.5, "refine_iterations": 2, "individual_masks": False,
                                                           "model": ["37", 0], "image": ["30", 0], "conditioning": ["38", 0]}},
            "50": {"class_type": "GrowMask", "inputs": {"expand": 12, "tapered_corners": True, "mask": ["39", 0]}},
            "51": {"class_type": "MaskComposite", "inputs": {"x": 0, "y": 0, "operation": "add", "destination": ["50", 0], "source": mask}},
        }
        mask = ["51", 0]
    g["52"] = {"class_type": "InpaintCropImproved", "inputs": {**CROP, "image": ["30", 0], "mask": mask}}
    base, model = _base(r["family"], r["unet"], r["text"], r["negative"], r["cfg"], r["loras"])
    g |= base
    g |= {
        "11": {"class_type": "VAEEncode", "inputs": {"pixels": ["52", 1], "vae": ["3", 0]}},
        "53": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["11", 0], "mask": ["52", 2]}},
        SAMPLER: {"class_type": "LanPaint_KSampler", "inputs": {
            "seed": seed, "steps": r["steps"], "cfg": r["cfg"], "sampler_name": FAMILIES[r["family"]]["sampler"], "scheduler": "simple",
            "denoise": 1.0, "LanPaint_NumSteps": 3, "LanPaint_PromptMode": "Image First", "LanPaint_Info": "LanPaint KSampler.",
            "Inpainting_mode": "\U0001f5bc\ufe0f Image Inpainting", "model": model, "positive": ["4", 0], "negative": ["5", 0],
            "latent_image": ["53", 0]}},
        "8": {"class_type": "VAEDecode", "inputs": {"samples": [SAMPLER, 0], "vae": ["3", 0]}},
        "54": {"class_type": "InpaintStitchImproved", "inputs": {"stitcher": ["52", 0], "inpainted_image": ["8", 0]}},
    }
    out = _headswap(g, ["54", 0], face, seed) if face else ["54", 0]
    g["9"] = {"class_type": "SaveImageWebsocket", "inputs": {"images": out}}
    return g
