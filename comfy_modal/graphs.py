"""The studio's graphs as API prompts: renders (one per model family), upscales, repaints, dressing, and the
looks ahead of an edit (what SAM finds, the fitted body). A family fixes the text encoder, the VAE and the
sampling; the diffusion model file inside it is the user's choice, so any file on the volume can be tried
with any family, and a mismatch fails in ComfyUI's loader.

Krea 2 is workflows 04 and 05 in tools/build_workflows.py, Z-Image is workflow 01. LoRAs chain between the
model loader and the rest. Every graph ends in SaveImageWebsocket: the PNG goes back over the worker's socket
instead of onto the io volume, so a studio render leaves no file behind. The negative prompt is used only when
CFG is above 1; at 1 a distilled model ignores it anyway. Node ids come from graph.G; what the studio watches
is marked with a stage or a role there, never by a number."""
import json
import os
import re
from typing import NamedTuple

from .catalog import MODELS as CATALOG
from .graph import G, Ref

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

# The diffusion model's loader node, by file extension. A new format is one entry here plus its
# node pack in catalog.NODE_PACKS; the studio's listing and validation read the extensions from here.
LOADERS = {
    ".safetensors": ("UNETLoader", {"weight_dtype": "default"}),
    ".gguf": ("UnetLoaderGGUF", {}),  # comfyui-gguf-reboot (catalog.NODE_PACKS)
}
MODEL_EXTENSIONS = tuple(LOADERS)
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


def _unet(g: G, unet: str, stage: str = "loading") -> Ref:
    class_type, extra = LOADERS[os.path.splitext(unet)[1]]
    return g.add(class_type, unet_name=unet, **extra, stage=stage)


def _loras(g: G, model: Ref, loras: list[tuple[str, float]]) -> Ref:
    for name, strength in loras:
        model = g.add("LoraLoaderModelOnly", lora_name=name, strength_model=strength, model=model)
    return model


class Base(NamedTuple):
    bare: Ref  # the diffusion model as loaded, before LoRAs: what the head swap patches
    model: Ref  # with the LoRAs and the family's sampling shift: what samples
    clip: Ref
    vae: Ref
    positive: Ref
    negative: Ref


def _base(g: G, family: str, unet: str, text: str, negative: str, cfg: float, loras: list[tuple[str, float]]) -> Base:
    """Loaders, prompt and LoRA chain shared by a render, a retouch, a repaint and a finish."""
    f = FAMILIES[family]
    bare = _unet(g, unet)
    clip = g.add("CLIPLoader", clip_name=f["clip"][0], type=f["clip"][1], device="default", stage="loading")
    vae = g.add("VAELoader", vae_name=f["vae"], stage="loading")
    return _rebase(g, Base(bare, bare, clip, vae, bare, bare), family, text, negative, cfg, loras)


def _rebase(g: G, b: Base, family: str, text: str, negative: str, cfg: float, loras: list[tuple[str, float]]) -> Base:
    """The loaders of `b` (its bare model, encoder and VAE) with a prompt and LoRA chain of their own: what `_base`
    finishes, and one person's face pass."""
    pos = g.add("CLIPTextEncode", text=text, clip=b.clip, stage="encoding")
    neg = (g.add("CLIPTextEncode", text=negative, clip=b.clip) if cfg > 1
           else g.add("ConditioningZeroOut", conditioning=pos))
    model = _loras(g, b.bare, loras)
    if "shift" in FAMILIES[family]:
        model = g.add("ModelSamplingAuraFlow", shift=FAMILIES[family]["shift"], model=model)
    return Base(b.bare, model, b.clip, b.vae, pos, neg)


def _image(g: G, b64: str) -> Ref:
    return g.add("StudioImageBase64", data=b64, stage="loading")


def _save(g: G, image: Ref) -> None:
    g.add("SaveImageWebsocket", images=image, stage="decoding", role="output")


def _sampler(g: G, family: str, b: Base, latent: Ref, seed: int, steps: int, cfg: float, denoise: float,
             stage: str = "sampling") -> Ref:
    return g.add("KSampler", seed=seed, steps=steps, cfg=cfg, sampler_name=FAMILIES[family]["sampler"], scheduler="simple",
                 denoise=denoise, model=b.model, positive=b.positive, negative=b.negative, latent_image=latent,
                 stage=stage, role="sampler")


def _lanpaint(g: G, r: dict, b: Base, latent: Ref, seed: int, denoise: float) -> Ref:
    return g.add("LanPaint_KSampler", {"Inpainting_mode": "\U0001f5bc️ Image Inpainting"},
                 seed=seed, steps=r["steps"], cfg=r["cfg"], sampler_name=FAMILIES[r["family"]]["sampler"], scheduler="simple",
                 denoise=denoise, LanPaint_NumSteps=3, LanPaint_PromptMode="Image First", LanPaint_Info="LanPaint KSampler.",
                 model=b.model, positive=b.positive, negative=b.negative, latent_image=latent, stage="sampling", role="sampler")


# Workflow 09's crop: the source keeps its resolution, a box 1.5x the mask gives context, the box itself is
# worked on at 1024, and 32 px blend it back in. Holes stay holes: the phone's mask is meant as drawn.
CROP = {"downscale_algorithm": "bilinear", "upscale_algorithm": "lanczos", "preresize": False, "preresize_mode": "ensure minimum resolution",
        "preresize_min_width": 1024, "preresize_min_height": 1024, "preresize_max_width": 16384, "preresize_max_height": 16384,
        "mask_fill_holes": False, "mask_expand_pixels": 0, "mask_invert": False, "mask_blend_pixels": 32, "mask_hipass_filter": 0.1,
        "extend_for_outpainting": False, "extend_up_factor": 1.0, "extend_down_factor": 1.0, "extend_left_factor": 1.0,
        "extend_right_factor": 1.0, "context_from_mask_extend_factor": 1.5, "output_resize_to_target_size": True,
        "output_target_width": 1024, "output_target_height": 1024, "output_padding": "32", "device_mode": "gpu (much faster)"}


def _sam(g: G, image: Ref, text: str, threshold: float, expand: int, points: dict | None = None) -> Ref:
    """What SAM 3.1 finds by `text`, by tapped `points` ({"positive": [{"x", "y"}], "negative": [...]}, in pixels)
    or by both, grown a little past its edge."""
    sam = g.add("CheckpointLoaderSimple", ckpt_name="sam3.1_multiplex_fp16.safetensors", stage="masking")
    more = {f"{k}_coords": json.dumps(v) for k, v in (points or {}).items() if v}
    if text:
        more["conditioning"] = g.add("CLIPTextEncode", text=text, clip=sam.out(1))
    found = g.add("SAM3_Detect", threshold=threshold, refine_iterations=2, individual_masks=False, model=sam, image=image,
                  stage="masking", **more)
    return g.add("GrowMask", expand=expand, tapered_corners=True, mask=found, stage="masking")


# A face photo is put on the person by a second pass: the BFS head swap LoRA (catalog.py) on the image's own
# Krea 2 model, the image and the photo as the two references of comfyui-krea2edit, as its maker's workflow
# does it. ref_boost 4.0 is that workflow's recommended fidelity: higher copies the photo harder.
# Only a box around the head is swapped, at 1024, and only the head is blended back: swapping the whole
# picture redrew all of it at 1 MP, softer than the render, and left a small head a few dozen pixels.
HEADSWAP_LORA = "bfs_head_swap_v1.1_krea2.safetensors"
HEADSWAP_PROMPT = "head_swap: replace the head with the reference head."
HEADSWAP_FAMILIES = ("krea2",)


def _headswap(g: G, b: Base, image: Ref, face_b64: str, seed: int, ref_boost: float = 4.0) -> Ref:
    """The head swap on `image` with the Krea 2 loaders of `b`; returns the image with the head swapped and
    everything else untouched. The render's own LoRAs are left out on purpose: the swap LoRA was trained on the
    bare model."""
    # the box around the head is 2.5x, so shoulders and some scene come along as the swap LoRA expects
    crop = g.add("InpaintCropImproved", {**CROP, "context_from_mask_extend_factor": 2.5}, image=image,
                 mask=_sam(g, image, "head", 0.5, 16), stage="masking")
    face = g.add("ImageScaleToTotalPixels", upscale_method="lanczos", megapixels=1.0, resolution_steps=16,
                 image=_image(g, face_b64))
    both = {"image": crop.out(1), "image_b": face}
    patched = g.add("Krea2EditModelPatch",
                    model=g.add("LoraLoaderModelOnly", lora_name=HEADSWAP_LORA, strength_model=1.0, model=b.bare),
                    source_latent=g.add("VAEEncode", pixels=crop.out(1), vae=b.vae),
                    source_latent_b=g.add("VAEEncode", pixels=face, vae=b.vae), ref_boost=ref_boost, ref_boost_a=1.0,
                    fit_mode="fit", vae=b.vae, source_image=crop.out(1), source_image_b=face, stage="swapping")
    swapped = g.add("KSampler", seed=seed, steps=10, cfg=1.0, sampler_name="euler", scheduler="simple", denoise=1.0, model=patched,
                    positive=g.add("Krea2EditGroundedEncode", clip=b.clip, prompt=HEADSWAP_PROMPT, grounding_px=512, system_prompt="", **both),
                    negative=g.add("Krea2EditGroundedEncode", clip=b.clip, prompt="", grounding_px=768, system_prompt="", **both),
                    latent_image=g.add("EmptySD3LatentImage", width=1024, height=1024, batch_size=1), stage="swapping", role="swapper")
    # only the head goes back in, blended over 32 px; the rest of the picture is the render's own pixels
    return g.add("InpaintStitchImproved", stitcher=crop,
                 inpainted_image=g.add("VAEDecode", samples=swapped, vae=b.vae, stage="decoding"), stage="decoding")


# The face pass: a face a few dozen pixels high in a full-body render gets a few dozen pixels of the model's attention,
# which is where likeness goes first. A box twice the face is cut out, redrawn at 1024 by the last pass's model with its
# prompt and LoRAs (a character's LoRA included), lightly, and only the face is blended back. Skipped under a face
# photo: the head swap redraws the head at 1024 already.
FACE_PASS = (0.15, 0.6)


def _facepass(g: G, b: Base, family: str, image: Ref, seed: int, steps: int, cfg: float, denoise: float,
              which: dict | None = None, found_in: Ref | None = None) -> Ref:
    """The largest face redrawn, or with `which` (StudioFaceMask's slot, people and refs) one person's, found in
    `found_in` (the render before any face pass, so every person's face is decided on the same picture) and redrawn
    in `image`."""
    # SCRFD's box around the face (comfy_nodes/studio_face), not SAM's "face", which can take the sky for one
    face = g.add("StudioFaceMask", image=found_in or image, grow=0.15, stage="masking", **(which or {}))
    crop = g.add("InpaintCropImproved", {**CROP, "context_from_mask_extend_factor": 2.0}, image=image, mask=face)
    latent = g.add("SetLatentNoiseMask", samples=g.add("VAEEncode", pixels=crop.out(1), vae=b.vae), mask=crop.out(2))
    redrawn = g.add("VAEDecode", samples=_sampler(g, family, b, latent, seed, steps, cfg, denoise, "refining"), vae=b.vae,
                    stage="decoding")
    stitched = g.add("InpaintStitchImproved", stitcher=crop, inpainted_image=redrawn, stage="decoding")
    # only the face and its blend go back: with no face the mask is empty, and so is what changes
    keep = g.add("GrowMask", expand=CROP["mask_blend_pixels"], tapered_corners=True, mask=face)
    return g.add("ImageCompositeMasked", x=0, y=0, resize_source=False, destination=image, source=stitched, mask=keep)


FACE_PEOPLE = 4  # comfy_nodes/studio_face REFS: people a face pass tells apart


def _facepasses(g: G, b: Base, last: dict, image: Ref, seed: int, denoise: float, people: list[dict]) -> Ref:
    """One face pass per person of `people` (text, loras, side, face: a photo or None), each with only their own LoRAs
    and description, so two characters' faces do not drift towards each other. Which face is whose: assign.py."""
    refs = {f"ref_{n}": _image(g, p["face"]) for n, p in enumerate(people) if p.get("face")}
    sides = json.dumps([p["side"] for p in people])
    rendered = image
    for slot, p in enumerate(people):
        own = _rebase(g, b, last["family"], p["text"], last["negative"], last["cfg"], p["loras"])
        image = _facepass(g, own, last["family"], image, seed, last["steps"], last["cfg"], denoise,
                          {"slot": slot, "people": sides, **refs}, found_in=rendered)
    return image


def graph(family: str, unet: str, text: str, negative: str, width: int, height: int, seed: int, steps: int, cfg: float,
          loras: list[tuple[str, float]], face: str | None = None, finish: dict | None = None,
          face_pass: float | None = None, face_people: list[dict] | None = None) -> dict:
    """A render. With `finish` (family, unet, text, negative, steps, cfg, loras, denoise) another model goes over the
    whole image lightly afterwards; with `face` (a base64 photo) the head swap runs last, on the last pass's model, and
    without one `face_pass` (a strength) redraws the face with it: each person's of `face_people` with their own, or the
    largest."""
    g = G()
    b = _base(g, family, unet, text, negative, cfg, loras)
    latent = g.add(FAMILIES[family]["latent"], width=width, height=height, batch_size=1)
    out = g.add("VAEDecode", samples=_sampler(g, family, b, latent, seed, steps, cfg, 1.0), vae=b.vae, stage="decoding")
    if finish:
        f = finish
        b = _base(g, f["family"], f["unet"], f["text"], f["negative"], f["cfg"], f["loras"])
        latent = g.add("VAEEncode", pixels=out, vae=b.vae, stage="encoding")
        out = g.add("VAEDecode", samples=_sampler(g, f["family"], b, latent, seed, f["steps"], f["cfg"], f["denoise"]), vae=b.vae,
                    stage="decoding")
    if face:
        out = _headswap(g, b, out, face, seed)
    elif face_pass:
        last = finish or {"family": family, "steps": steps, "cfg": cfg, "negative": negative}
        out = (_facepasses(g, b, last, out, seed, face_pass, face_people) if face_people
               else _facepass(g, b, last["family"], out, seed, last["steps"], last["cfg"], face_pass))
    _save(g, out)
    return g.prompt()


def upscale(image_b64: str, megapixels: float, seed: int, retouch: dict | None = None) -> dict:
    """SeedVR2 to `megapixels`, workflow 03's chain. With `retouch` (family, unet, text, negative, steps,
    cfg, loras, denoise) a light img2img pass with the image's own model runs first, at its own size:
    the prompt steers the touch-up cheaply, and SeedVR2 then restores detail on the result."""
    g = G()
    source = _image(g, image_b64)
    if retouch:
        r = retouch
        b = _base(g, r["family"], r["unet"], r["text"], r["negative"], r["cfg"], r["loras"])
        latent = g.add("VAEEncode", pixels=source, vae=b.vae, stage="encoding")
        source = g.add("VAEDecode", samples=_sampler(g, r["family"], b, latent, seed, r["steps"], r["cfg"], r["denoise"]),
                       vae=b.vae, stage="decoding")
    tiled = {"tile_size": 512, "overlap": 128, "temporal_size": 4096, "temporal_overlap": 8}
    model = g.add("UNETLoader", unet_name="seedvr2_7b_fp16.safetensors", weight_dtype="default", stage="upscaling")
    vae = g.add("VAELoader", vae_name="seedvr2_ema_vae_fp16.safetensors")
    resized = g.add("ImageScaleToTotalPixels", upscale_method="lanczos", megapixels=megapixels, resolution_steps=1, image=source)
    encoded = g.add("VAEEncodeTiled", **tiled, pixels=g.add("SeedVR2Preprocess", resized_images=resized), vae=vae, stage="upscaling")
    cond = g.add("SeedVR2Conditioning", model=model, vae_conditioning=encoded)
    sampled = g.add("KSampler", seed=seed, steps=1, cfg=1.0, sampler_name="euler", scheduler="simple", denoise=1.0, model=model,
                    positive=cond, negative=cond.out(1), latent_image=encoded, stage="upscaling", role="upscaler")
    decoded = g.add("VAEDecodeTiled", **tiled, samples=sampled, vae=vae, stage="decoding")
    _save(g, g.add("SeedVR2PostProcessing", color_correction_method="lab", images=decoded, original_resized_images=resized))
    return g.prompt()


def _masked(g: G, image_b64: str, mask_b64: str) -> tuple[Ref, Ref, Ref]:
    """The image, the phone's mask (white on black, the image's size: found with graphs.mask and refined there),
    and the box cut around it; the box's outputs are the stitcher, the cropped image and the cropped mask."""
    image = _image(g, image_b64)
    mask = g.add("ImageToMask", channel="red", image=_image(g, mask_b64))
    return image, mask, g.add("InpaintCropImproved", CROP, image=image, mask=mask, stage="masking")


def mask(image_b64: str, text: str = "", points: dict | None = None) -> dict:
    """What SAM 3.1 finds in the image by `text` or tapped `points`, as white on black: the phone adds it to the mask
    it paints."""
    g = G()
    _save(g, g.add("MaskToImage", mask=_sam(g, _image(g, image_b64), text, 0.4, 12, points)))
    return g.prompt()


def face(image_b64: str, reference_b64: str) -> dict:
    """How much the largest face in the image looks like the one in the reference photo (comfy_nodes/studio_face): a
    score, and no image."""
    g = G()
    g.add("StudioFaceScore", image=_image(g, image_b64), reference=_image(g, reference_b64), stage="comparing")
    return g.prompt()


def inpaint(image_b64: str, mask_b64: str, r: dict, seed: int, face: str | None = None) -> dict:
    """Repaint part of an image, workflow 09's chain. Only a box around the mask is cut out and re-rendered, by
    `r` (family, unet, text, negative, steps, cfg, loras), with LanPaint standing in for an inpainting checkpoint
    Krea 2 does not have; with `face`, the head swap runs on the result."""
    g = G()
    _, _, box = _masked(g, image_b64, mask_b64)
    b = _base(g, r["family"], r["unet"], r["text"], r["negative"], r["cfg"], r["loras"])
    latent = g.add("SetLatentNoiseMask", samples=g.add("VAEEncode", pixels=box.out(1), vae=b.vae, stage="encoding"), mask=box.out(2))
    painted = g.add("VAEDecode", samples=_lanpaint(g, r, b, latent, seed, 1.0), vae=b.vae, stage="decoding")
    out = g.add("InpaintStitchImproved", stitcher=box, inpainted_image=painted, stage="decoding")
    _save(g, _headswap(g, b, out, face, seed) if face else out)
    return g.prompt()


# Dressing: workflow 08's chain. SAM 3D Body fits a body to the person, its depth render is cropped with the
# same box as the picture, and Z-Image's Fun Controlnet takes both the depth (the body stays put) and the
# picture around the mask (the new clothes agree with it), which is what lets it denoise fully in 8 steps.
# Optionally another model then repaints the same mask lightly with LanPaint, so the fabric, skin and light are
# its own while the shape stays where Z-Image put it.
DRESS_HOLD = {"tight": 0.9, "loose": 0.65, "off": 0.9}  # controlnet strength; "off" gives it the picture but no body
FINISH = (0.1, 0.8)  # how much a finish may repaint, of a render or of dressed clothes; 0.35 keeps the shape and takes its look


def _body(g: G, image: Ref) -> Ref:
    """RT-DETR picks the person, SAM 3D Body fits a mesh to them; returns the fitted pose data."""
    detector = g.add("UNETLoader", unet_name="rt_detr_v4-x-hgnet_fp16.safetensors", weight_dtype="default", stage="fitting")
    person = g.add("RTDETR_detect", threshold=0.5, class_name="person", max_detections=1, model=detector, image=image, stage="fitting")
    model = g.add("SAM3DBody_Loader", model_file="sam_3d_body_dinov3_bf16.safetensors", stage="fitting")
    return g.add("SAM3DBody_Predict", run_hand_refinement=True, fov=0.0, batch_size=64, sam3d_body_model=model, image=image,
                 bboxes=person, stage="fitting")


def _mesh(shader: str, opacity: float = 1.0) -> dict:
    return {"width": 0, "height": 0, "render_style": "mesh", "render_style.shader": shader, "render_style.opacity": opacity,
            "render_style.person_palette_falloff": 0.6, "render_style.region": "full_body"}


def body(image_b64: str) -> dict:
    """The fitted body drawn over the picture, for the phone to show before anything is dressed."""
    g = G()
    image = _image(g, image_b64)
    _save(g, g.add("SAM3DBody_Render", _mesh("normals", 0.75), pose_data=_body(g, image), background=image, stage="fitting"))
    return g.prompt()


def dress(image_b64: str, mask_b64: str, outfit: str, seed: int, hold: str, dresser: dict,
          finish: dict | None, face: str | None = None) -> dict:
    """Replace what someone wears with `outfit`, the body held by its mesh (`hold`: tight, loose, off). `dresser` is the
    Z-Image model that dresses it (unet, steps, cfg, loras). With `finish` (family, unet, text, negative, steps, cfg,
    loras, denoise) a second model repaints the clothes lightly afterwards; `face` needs a Krea 2 finish, whose
    loaders the head swap uses."""
    g = G()
    image, mask, box = _masked(g, image_b64, mask_b64)
    control = {}
    if hold != "off":
        depth = g.add("SAM3DBody_Render", _mesh("depth"), pose_data=_body(g, image), stage="fitting")
        control = {"image": g.add("InpaintCropImproved", CROP, image=depth, mask=mask, stage="fitting").out(1)}
    z = FAMILIES["zimage"]
    vae = g.add("VAELoader", vae_name=z["vae"], stage="dressing")
    clip = g.add("CLIPLoader", clip_name=z["clip"][0], type=z["clip"][1], device="default", stage="dressing")
    held = g.add("ZImageFunControlnet", strength=DRESS_HOLD[hold], model=_loras(g, _unet(g, dresser["unet"], "dressing"), dresser["loras"]),
                 model_patch=g.add("ModelPatchLoader", name="Z-Image-Turbo-Fun-Controlnet-Union-2.1-2602-8steps.safetensors", stage="dressing"),
                 vae=vae, inpaint_image=box.out(1), mask=box.out(2), **control, stage="dressing")
    pos = g.add("CLIPTextEncode", text=outfit, clip=clip, stage="encoding")
    latent = g.add("SetLatentNoiseMask", samples=g.add("VAEEncode", pixels=box.out(1), vae=vae), mask=box.out(2))
    sampled = g.add("KSampler", seed=seed, steps=dresser["steps"], cfg=dresser["cfg"], sampler_name=z["sampler"], scheduler="simple",
                    denoise=1.0, model=g.add("ModelSamplingAuraFlow", shift=z["shift"], model=held), positive=pos,
                    negative=g.add("ConditioningZeroOut", conditioning=pos), latent_image=latent, stage="dressing", role="dresser")
    dressed = g.add("VAEDecode", samples=sampled, vae=vae, stage="decoding")
    b = None
    if finish:
        b = _base(g, finish["family"], finish["unet"], finish["text"], finish["negative"], finish["cfg"], finish["loras"])
        latent = g.add("SetLatentNoiseMask", samples=g.add("VAEEncode", pixels=dressed, vae=b.vae, stage="encoding"), mask=box.out(2))
        dressed = g.add("VAEDecode", samples=_lanpaint(g, finish, b, latent, seed, finish["denoise"]), vae=b.vae, stage="decoding")
    out = g.add("InpaintStitchImproved", stitcher=box, inpainted_image=dressed, stage="decoding")
    swap = face and finish and b and finish["family"] in HEADSWAP_FAMILIES
    _save(g, _headswap(g, b, out, face, seed) if swap else out)
    return g.prompt()
