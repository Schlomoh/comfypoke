"""Generate the default workflows in workflows/ and their API-format prompts in tools/*_api.json.

    uv run tools/build_workflows.py

01  Z-Image-Turbo text to image: 8 steps, CFG 1.
02  FLUX.2 klein 4B text to image: 4 steps, CFG 1.
03  Upscale with SeedVR2 7B: one step, size set in megapixels, color matched to the source.
04  Krea 2 Turbo text to image: 8 steps, CFG 1.
05  Krea 2 RAW text to image: 52 steps, CFG 3.5, with a real negative prompt. Slow on purpose.
06  Krea 2 style reference: an image in, its look carried onto a new prompt. Needs the LoRA,
    see the note on build_krea2_reference.
07  Krea 2 masked edit: name what to change ("her jacket") and SAM 3.1 makes the mask.
09  Krea 2 outfit swap: 08's shape, on Krea 2. SAM mask, crop to the mask, LanPaint, stitch back.

Workflows are plain graphs, one node per step, so they read well in the GUI and in a diff. Edit the
functions below (or copy one) to make your own; `Graph.add` wires a node, `Graph.write` dumps the
GUI JSON and the API prompt that tools/render.py can submit. To use a LoRA, upload it with
tools/sync.sh and put a LoraLoaderModelOnly node between the model (or the sampling patch) and
the sampler, in the GUI or here: add("LoraLoaderModelOnly", ["file.safetensors", 0.8], pos, model=(ms, 0)).
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from workflow_graph import Graph  # noqa: E402

REPO = Path(__file__).resolve().parents[1]
GREEN, RED, BLUE, YELLOW = ("#232", "#353"), ("#322", "#533"), ("#223", "#335"), ("#432", "#653")
PROMPT = "a red enamel camping mug on a wooden table, morning light through a window, film photo"


def write(g: Graph, name: str, groups):
    g.write(REPO / "workflows" / f"{name}.json", REPO / "tools" / f"{name.split('-', 1)[1]}_api.json", groups)


def build_zimage(seed: int):
    g = Graph()
    add = g.add
    unet = add("UNETLoader", ["z_image_turbo_bf16.safetensors", "default"], (40, 60), "Z-Image-Turbo")
    clip = add("CLIPLoader", ["qwen_3_4b.safetensors", "lumina2", "default"], (40, 180), "Text encoder (Qwen3 4B)")
    vae = add("VAELoader", ["ae.safetensors"], (40, 300))
    ms = add("ModelSamplingAuraFlow", [3], (40, 400), model=(unet, 0))
    pos = add("CLIPTextEncode", [PROMPT], (420, 60), "Prompt", GREEN, clip=(clip, 0))
    neg = add("ConditioningZeroOut", [], (420, 330), "Negative (zeroed, CFG 1)", RED, conditioning=(pos, 0))
    latent = add("EmptySD3LatentImage", [1024, 1024, 1], (420, 430), "Size", YELLOW)
    ks = add("KSampler", [seed, "randomize", 8, 1.0, "res_multistep", "simple", 1.0], (800, 60), "Turbo: 8 steps, CFG 1",
             model=(ms, 0), positive=(pos, 0), negative=(neg, 0), latent_image=(latent, 0))
    dec = add("VAEDecode", [], (800, 420), samples=(ks, 0), vae=(vae, 0))
    add("SaveImage", ["zimage/render"], (800, 520), "Save", BLUE, images=(dec, 0))
    write(g, "01-zimage-turbo", [("Model", [20, 10, 360, 900], "#3f789e"), ("Prompt, size", [400, 10, 360, 900], "#8A8"), ("Sample", [780, 10, 380, 900], "#b58b2a")])


def build_klein(seed: int):
    g = Graph()
    add = g.add
    unet = add("UNETLoader", ["flux-2-klein-4b.safetensors", "default"], (40, 60), "FLUX.2 klein 4B (distilled)")
    clip = add("CLIPLoader", ["qwen_3_4b.safetensors", "flux2", "default"], (40, 180), "Text encoder (Qwen3 4B, flux2)")
    vae = add("VAELoader", ["flux2-vae.safetensors"], (40, 300))
    pos = add("CLIPTextEncode", [PROMPT], (420, 60), "Prompt", GREEN, clip=(clip, 0))
    zero = add("ConditioningZeroOut", [], (420, 330), "Negative (zeroed, CFG 1)", RED, conditioning=(pos, 0))
    latent = add("EmptyFlux2LatentImage", [1024, 1024, 1], (420, 430), "Size", YELLOW)
    guider = add("CFGGuider", [1.0], (800, 60), "klein is distilled: CFG 1", model=(unet, 0), positive=(pos, 0), negative=(zero, 0))
    sigmas = add("Flux2Scheduler", [4, 1024, 1024], (800, 200), "4 steps (distilled); width and height as in the latent")
    sampler = add("KSamplerSelect", ["euler"], (800, 340))
    noise = add("RandomNoise", [seed, "randomize"], (800, 440))
    ks = add("SamplerCustomAdvanced", [], (800, 560), noise=(noise, 0), guider=(guider, 0), sampler=(sampler, 0), sigmas=(sigmas, 0), latent_image=(latent, 0))
    dec = add("VAEDecode", [], (800, 740), samples=(ks, 0), vae=(vae, 0))
    add("SaveImage", ["klein/render"], (800, 840), "Save", BLUE, images=(dec, 0))
    write(g, "02-flux2-klein", [("Model", [20, 10, 360, 1000], "#3f789e"), ("Prompt, size", [400, 10, 360, 1000], "#8A8"), ("Sample", [780, 10, 380, 1000], "#b58b2a")])


def build_krea2(seed: int):
    g = Graph()
    add = g.add
    unet = add("UNETLoader", ["krea2_turbo_bf16.safetensors", "default"], (40, 60), "Krea 2 Turbo 12B (distilled)")
    clip = add("CLIPLoader", ["qwen3vl_4b_bf16.safetensors", "krea2", "default"], (40, 180), "Text encoder (Qwen3-VL 4B, krea2)")
    vae = add("VAELoader", ["qwen_image_vae.safetensors"], (40, 300), "Qwen-Image VAE")
    pos = add("CLIPTextEncode", [PROMPT], (420, 60), "Prompt", GREEN, clip=(clip, 0))
    neg = add("ConditioningZeroOut", [], (420, 330), "Negative (zeroed, CFG 1)", RED, conditioning=(pos, 0))
    latent = add("EmptyLatentImage", [1024, 1024, 1], (420, 430), "Size: Krea 2 is trained up to 1K", YELLOW)
    ks = add("KSampler", [seed, "randomize", 8, 1.0, "euler", "simple", 1.0], (800, 60), "Turbo: 8 steps, CFG 1",
             model=(unet, 0), positive=(pos, 0), negative=(neg, 0), latent_image=(latent, 0))
    dec = add("VAEDecode", [], (800, 420), samples=(ks, 0), vae=(vae, 0))
    add("SaveImage", ["krea2/render"], (800, 520), "Save", BLUE, images=(dec, 0))
    write(g, "04-krea2-turbo", [("Model", [20, 10, 360, 900], "#3f789e"), ("Prompt, size", [400, 10, 360, 900], "#8A8"), ("Sample", [780, 10, 380, 900], "#b58b2a")])


def build_krea2_raw(seed: int):
    g = Graph()
    add = g.add
    unet = add("UNETLoader", ["krea2_raw_bf16.safetensors", "default"], (40, 60), "Krea 2 RAW 12B (undistilled)")
    clip = add("CLIPLoader", ["qwen3vl_4b_bf16.safetensors", "krea2", "default"], (40, 180), "Text encoder (Qwen3-VL 4B, krea2)")
    vae = add("VAELoader", ["qwen_image_vae.safetensors"], (40, 300), "Qwen-Image VAE")
    pos = add("CLIPTextEncode", [PROMPT], (420, 60), "Prompt", GREEN, clip=(clip, 0))
    neg = add("CLIPTextEncode", ["blurry, washed out, plastic skin"], (420, 330), "Negative: RAW is undistilled, so CFG 3.5 gives this something to push against", RED, clip=(clip, 0))
    latent = add("EmptyLatentImage", [1024, 1024, 1], (420, 560), "Size: Krea 2 is trained up to 1K", YELLOW)
    ks = add("KSampler", [seed, "randomize", 52, 3.5, "euler", "simple", 1.0], (800, 60), "RAW: 52 steps, CFG 3.5. A minute or two per image, not ten seconds",
             model=(unet, 0), positive=(pos, 0), negative=(neg, 0), latent_image=(latent, 0))
    dec = add("VAEDecode", [], (800, 420), samples=(ks, 0), vae=(vae, 0))
    add("SaveImage", ["krea2-raw/render"], (800, 520), "Save", BLUE, images=(dec, 0))
    write(g, "05-krea2-raw", [("Model", [20, 10, 360, 900], "#3f789e"), ("Prompt, size", [400, 10, 360, 900], "#8A8"), ("Sample", [780, 10, 380, 900], "#b58b2a")])


def build_krea2_reference(image_file: str, seed: int):
    """Krea 2 with an image as input, which is as close as the open weights get to editing.

    There is no Krea 2 edit checkpoint: krea.ai published RAW and Turbo, both text to image, and
    the only image-conditioned workflow Comfy ships for it is this one. The reference image goes
    through the Qwen-Image-Edit conditioning path, the latent stays empty, and the LoRA is what
    turns that into "paint my prompt in the style of this picture" rather than an edit. Ask it to
    change something in the picture and it will not: it has not been trained to.

    The LoRA is not in catalog.py, so no rebuild is needed for it:
        tools/sync.sh hf Comfy-Org/Krea-2 loras/krea2_style_reference.safetensors loras
    Comfy's own template pairs it with krea2_turbo_int8_convrot rather than the bf16 here. If the
    result looks wrong, that is the first thing to try: add the int8 file to catalog.py and deploy.
    """
    g = Graph()
    add = g.add
    img = add("LoadImage", [image_file, "image"], (40, 60), "Reference image: upload it with the node's button first", YELLOW)
    unet = add("UNETLoader", ["krea2_turbo_bf16.safetensors", "default"], (40, 380), "Krea 2 Turbo 12B")
    clip = add("CLIPLoader", ["qwen3vl_4b_bf16.safetensors", "krea2", "default"], (40, 500), "Text encoder (Qwen3-VL 4B, krea2)")
    vae = add("VAELoader", ["qwen_image_vae.safetensors"], (40, 620), "Qwen-Image VAE")
    lora = add("LoraLoaderModelOnly", ["krea2_style_reference.safetensors", 1.0], (40, 720), "Style reference LoRA (ostris), strength 1.0", RED, model=(unet, 0))
    ms = add("ModelSamplingFlux", [1.15, 0.5, 1024, 1024], (40, 840), "Shift: width and height as in the latent", model=(lora, 0))
    pos = add("TextEncodeQwenImageEditPlus", [PROMPT], (420, 60), "Prompt, with the image as its reference", GREEN,
              clip=(clip, 0), vae=(vae, 0), image1=(img, 0))
    ref = add("FluxKontextMultiReferenceLatentMethod", ["index_timestep_zero"], (420, 340), conditioning=(pos, 0))
    zero = add("ConditioningZeroOut", [], (420, 440), "Negative (zeroed, CFG 1)", RED, conditioning=(ref, 0))
    latent = add("EmptyLatentImage", [1024, 1024, 1], (420, 540), "Size", YELLOW)
    guider = add("CFGGuider", [1.0], (800, 60), "Turbo is distilled: CFG 1", model=(ms, 0), positive=(ref, 0), negative=(zero, 0))
    sigmas = add("BasicScheduler", ["simple", 8, 1.0], (800, 200), "8 steps", model=(ms, 0))
    sampler = add("KSamplerSelect", ["euler"], (800, 340))
    noise = add("RandomNoise", [seed, "randomize"], (800, 440))
    ks = add("SamplerCustomAdvanced", [], (800, 560), noise=(noise, 0), guider=(guider, 0), sampler=(sampler, 0), sigmas=(sigmas, 0), latent_image=(latent, 0))
    dec = add("VAEDecode", [], (800, 740), samples=(ks, 0), vae=(vae, 0))
    add("SaveImage", ["krea2-reference/render"], (800, 840), "Save", BLUE, images=(dec, 0))
    write(g, "06-krea2-style-reference", [("Image, model", [20, 10, 360, 1000], "#3f789e"), ("Prompt, size", [400, 10, 360, 1000], "#8A8"), ("Sample", [780, 10, 380, 1000], "#b58b2a")])


def build_krea2_edit(image_file: str, target: str, megapixels: float, denoise: float, seed: int):
    """Change part of a picture: SAM 3.1 finds what you named, Krea 2 re-renders only that.

    Krea 2 has no inpainting checkpoint, so this is the model-agnostic route: encode the picture,
    mark the part to redo with SetLatentNoiseMask, denoise only that part. What it costs is
    context. A real inpainting model looks at the pixels around the hole; here the unmasked latent
    is re-noised to the current sigma every step, so during the early steps, the ones that decide
    the composition, there is almost nothing to see. That is why low denoise looks safe and high
    denoise drifts. DifferentialDiffusion fades the mask in over the steps so the seam is not a
    hard edge, and the LanPaint sampler in NODE_PACKS is the real fix if this is not enough.

    Two sizes matter. ImageScaleToTotalPixels puts whatever you upload at the resolution Krea 2
    was trained for, which is up to 1k for RAW; a 4 MP photo costs four times the sampling time
    per step and looks no better. The mask rides along at the same size because SAM sees the
    already-scaled image.

    To draw the mask by hand instead, right-click the Load Image node, Open in MaskEditor, and
    wire its MASK output into SetLatentNoiseMask in place of the GrowMask node.
    """
    g = Graph()
    add = g.add
    img = add("LoadImage", [image_file, "image"], (40, 60), "Image to edit: upload with the node's button", YELLOW)
    small = add("ImageScaleToTotalPixels", ["lanczos", megapixels, 8], (40, 320),
                f"{megapixels} MP: Krea 2 is trained to about 1k, and a bigger photo only costs time", YELLOW, image=(img, 0))
    sam = add("CheckpointLoaderSimple", ["sam3.1_multiplex_fp16.safetensors"], (40, 460), "SAM 3.1")
    what = add("CLIPTextEncode", [target], (40, 580), f'What to mask: "{target}"', GREEN, clip=(sam, 1))
    mask = add("SAM3_Detect", [0.5, 2, False], (40, 760), "Finds it and returns the mask", model=(sam, 0), image=(small, 0), conditioning=(what, 0))
    grow = add("GrowMask", [12, True], (40, 940), "A little slack around the edge, so the seam has somewhere to blend", mask=(mask, 0))
    unet = add("UNETLoader", ["krea2_raw_bf16.safetensors", "default"], (420, 60), "Krea 2 RAW: CFG has to bite for an edit")
    clip = add("CLIPLoader", ["qwen3vl_4b_bf16.safetensors", "krea2", "default"], (420, 180), "Text encoder (Qwen3-VL 4B, krea2)")
    vae = add("VAELoader", ["qwen_image_vae.safetensors"], (420, 300), "Qwen-Image VAE")
    dd = add("DifferentialDiffusion", [1.0], (420, 400), "Fades the mask in over the steps, so the edit has no hard seam", model=(unet, 0))
    pos = add("CLIPTextEncode", ["a red waxed cotton jacket"], (420, 500), "What the masked part should become", GREEN, clip=(clip, 0))
    neg = add("CLIPTextEncode", ["blurry, washed out, plastic skin"], (420, 740), "Negative", RED, clip=(clip, 0))
    enc = add("VAEEncode", [], (420, 960), "The picture as a latent", pixels=(small, 0), vae=(vae, 0))
    masked = add("SetLatentNoiseMask", [], (420, 1080), "Only the masked part gets new noise", YELLOW, samples=(enc, 0), mask=(grow, 0))
    ks = add("KSampler", [seed, "randomize", 52, 3.5, "euler", "simple", denoise], (800, 60),
             f"denoise {denoise}: lower keeps more of the original, higher invents more",
             model=(dd, 0), positive=(pos, 0), negative=(neg, 0), latent_image=(masked, 0))
    dec = add("VAEDecode", [], (800, 420), samples=(ks, 0), vae=(vae, 0))
    seen = add("MaskToImage", [], (800, 540), "The mask SAM found, to check it caught the right thing", mask=(grow, 0))
    add("PreviewImage", [], (800, 640), "Mask preview: if this is not the thing you meant, change the SAM prompt", images=(seen, 0))
    add("SaveImage", ["krea2-edit/render"], (800, 820), "Save", BLUE, images=(dec, 0))
    write(g, "07-krea2-masked-edit", [("Find the mask", [20, 10, 360, 1100], "#b58b2a"), ("Model, prompt", [400, 10, 360, 1200], "#3f789e"), ("Sample", [780, 10, 380, 800], "#8A8")])


CROP_SETTINGS = ["bilinear", "lanczos", False, "ensure minimum resolution", 1024, 1024, 16384, 16384,
                 True, 0, False, 32, 0.1, False, 1.0, 1.0, 1.0, 1.0, 1.5, True, 1024, 1024, "32", "gpu (much faster)"]


def build_krea2_outfit(image_file: str, target: str, outfit: str, seed: int):
    """Replace what someone is wearing, on Krea 2. Same shape as 08, which does this on Z-Image.

    08 works because of three things, and only one of them is Z-Image-specific. SAM 3.1 names the
    mask instead of you drawing it. Crop-and-stitch cuts a padded box around the mask, edits it at
    1024 and blends it back, so a jacket that is 200 px of a 2K photo gets the whole model rather
    than 200 px of it. And the Fun Controlnet in inpaint mode feeds the surrounding pixels to the
    model, which is what lets 08 denoise fully instead of creeping up from 0.6.

    That third one has no Krea 2 equivalent installed, so LanPaint stands in for it. It attacks
    the same problem from the sampler instead of the model: a few Langevin iterations inside every
    step, so the masked region and the pixels around it settle against each other rather than the
    mask being stamped on at the end. Hence denoise 1.0 here too.

    What is missing next to 08 is the body branch. RT-DETR and SAM 3D Body still work, but nothing
    consumes a pose or depth map for Krea 2: there is no Krea 2 controlnet on this deployment.
    facok/comfyui-krea2-controlnet is the pack that would add one, and then the body depth wires
    in the same way it does in 08.

    Dials, in the order worth touching: LanPaint_NumSteps (3 here, up to 10, each one costs a full
    extra pass), steps, then cfg. The LoRA slot sits at strength 0, so it does nothing until set.
    """
    g = Graph()
    add = g.add
    img = add("LoadImage", [image_file, "image"], (40, 60), "Your image; paint extra mask in the MaskEditor if SAM misses something", YELLOW)
    sam = add("CheckpointLoaderSimple", ["sam3.1_multiplex_fp16.safetensors"], (40, 320), "SAM 3.1 (segments by text)")
    what = add("CLIPTextEncode", [target], (40, 440), f"What to mask automatically ('{target}'; 'top, shorts' for parts)", GREEN, clip=(sam, 1))
    det = add("SAM3_Detect", [0.5, 2, False], (40, 620), "Mask every match above the threshold", model=(sam, 0), image=(img, 0), conditioning=(what, 0))
    grow = add("GrowMask", [12, True], (40, 800), "Grow past the edge so the old fabric is fully covered", mask=(det, 0))
    both = add("MaskComposite", [0, 0, "add"], (40, 920), "Automatic mask plus whatever you painted", destination=(grow, 0), source=(img, 1))
    crop = add("InpaintCropImproved", CROP_SETTINGS, (40, 1080), "Crop around the mask at 1024, context factor 1.5, 32 px blend", YELLOW, image=(img, 0), mask=(both, 0))
    add("PreviewImage", [], (40, 1320), "The crop the sampler works on", images=(crop, 1))
    add("MaskPreview", [], (40, 1440), "Mask inside the crop: white is repainted", mask=(crop, 2))

    unet = add("UNETLoader", ["krea2_raw_bf16.safetensors", "default"], (420, 60), "Krea 2 RAW")
    lora = add("LoraLoaderModelOnly", ["krea2_style_reference.safetensors", 0.0], (420, 180), "LoRA slot (strength 0 = off)", RED, model=(unet, 0))
    clip = add("CLIPLoader", ["qwen3vl_4b_bf16.safetensors", "krea2", "default"], (420, 300), "Text encoder (Qwen3-VL 4B, krea2)")
    vae = add("VAELoader", ["qwen_image_vae.safetensors"], (420, 420), "Qwen-Image VAE")
    pos = add("CLIPTextEncode", [outfit], (420, 520), "Only what goes inside the mask: clothing, and any hands, held objects or bare skin it covers. No lighting, no style", GREEN, clip=(clip, 0))
    neg = add("CLIPTextEncode", ["blurry, low quality, distorted, deformed, text, watermark"], (420, 760), "Negative", RED, clip=(clip, 0))
    enc = add("VAEEncode", [], (420, 980), pixels=(crop, 1), vae=(vae, 0))
    masked = add("SetLatentNoiseMask", [], (420, 1100), "Noise only inside the mask", YELLOW, samples=(enc, 0), mask=(crop, 2))

    ks = add("LanPaint_KSampler",
             [seed, "fixed", 24, 3.5, "euler", "simple", 1.0, 3, "Image First", "LanPaint KSampler.", "\U0001f5bc\ufe0f Image Inpainting"],
             (800, 60), "LanPaint: 3 thinking passes per step is why full denoise holds together here",
             model=(lora, 0), positive=(pos, 0), negative=(neg, 0), latent_image=(masked, 0))
    dec = add("VAEDecode", [], (800, 420), samples=(ks, 0), vae=(vae, 0))
    add("PreviewImage", [], (800, 540), "Inpainted crop before stitching", images=(dec, 0))
    st = add("InpaintStitchImproved", [], (800, 660), "Blend it back into the original", stitcher=(crop, 0), inpainted_image=(dec, 0))
    add("SaveImage", ["krea2-outfit/result"], (800, 780), "Save", BLUE, images=(st, 0))
    write(g, "09-krea2-outfit-swap", [("Mask and crop", [20, 10, 360, 1560], "#b58b2a"), ("Model and prompt", [400, 10, 360, 1240], "#3f789e"), ("Sample and stitch", [780, 10, 380, 900], "#8A8")])


def build_upscale(image_file: str, megapixels: float, seed: int):
    g = Graph()
    add = g.add
    img = add("LoadImage", [image_file, "image"], (40, 60), "Image to upscale: use the node's upload button first", YELLOW)
    su = add("UNETLoader", ["seedvr2_7b_fp16.safetensors", "default"], (420, 60), "SeedVR2 7B")
    sv = add("VAELoader", ["seedvr2_ema_vae_fp16.safetensors"], (420, 180), "SeedVR2 VAE")
    big = add("ImageScaleToTotalPixels", ["lanczos", megapixels, 1], (420, 280), "Target size: 4 MP = 2048 square, 8 = 2.8K, 16 = 4K", YELLOW, image=(img, 0))
    prep = add("SeedVR2Preprocess", [], (420, 400), resized_images=(big, 0))
    enc = add("VAEEncodeTiled", [512, 128, 4096, 8], (420, 500), pixels=(prep, 0), vae=(sv, 0))
    cond = add("SeedVR2Conditioning", [], (420, 660), model=(su, 0), vae_conditioning=(enc, 0))
    ks = add("KSampler", [seed, "fixed", 1, 1.0, "euler", "simple", 1.0], (420, 760), "SeedVR2: one step", model=(su, 0), positive=(cond, 0), negative=(cond, 1), latent_image=(enc, 0))
    dec = add("VAEDecodeTiled", [512, 128, 4096, 8], (420, 1120), samples=(ks, 0), vae=(sv, 0))
    post = add("SeedVR2PostProcessing", ["lab"], (420, 1280), "Align to the source; color match: lab / wavelet / none", images=(dec, 0), original_resized_images=(big, 0))
    add("SaveImage", ["upscale/result"], (420, 1420), "Save", BLUE, images=(post, 0))
    write(g, "03-upscale-seedvr2", [("Image", [20, 10, 360, 1600], "#b58b2a"), ("SeedVR2", [400, 10, 380, 1600], "#3f789e")])


build_zimage(seed=1)
build_klein(seed=1)
build_krea2(seed=1)
build_krea2_raw(seed=1)
build_krea2_reference("example.png", seed=1)
build_krea2_edit("example.png", target="jacket", megapixels=1.0, denoise=0.6, seed=1)
build_krea2_outfit("example.png", target="clothing", outfit="a red hooded sweatshirt and black denim shorts", seed=20260912)
build_upscale("example.png", megapixels=4.0, seed=1)
