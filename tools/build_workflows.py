"""Generate the default workflows in workflows/ and their API-format prompts in tools/*_api.json.

    uv run tools/build_workflows.py

01  Z-Image-Turbo text to image: 8 steps, CFG 1.
02  FLUX.2 klein 4B text to image: 4 steps, CFG 1.
03  Upscale with SeedVR2 7B: one step, size set in megapixels, color matched to the source.
04  Krea 2 Turbo text to image: 8 steps, CFG 1.
05  Krea 2 RAW text to image: 52 steps, CFG 3.5, with a real negative prompt. Slow on purpose.
06  Krea 2 style reference: an image in, its look carried onto a new prompt. Needs the LoRA,
    see the note on build_krea2_reference.
07  Krea 2 masked edit: name what to change ("her jacket"), SAM 3.1 masks it, stock sampler.
08  Z-Image outfit swap with the body pinned: SAM mask, SAM 3D Body depth, Fun Controlnet inpaint.
    Built in the GUI, not here: this file leaves workflows/08-*.json alone.
09  Krea 2 outfit swap: 08's shape, on Krea 2. SAM mask, crop to the mask, LanPaint, stitch back.
10  Same as 09 with the body pinned: SAM 3D Body draws the skeleton, a pose LoRA makes Krea 2 hold it.

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


# Shared by the three workflows that edit part of a picture (07, 09, 10), so they crop the same
# way: no preresize, so the source keeps its resolution; a box 1.5x the mask for context; the box
# itself resized to 1024, which is what Krea 2 was trained for; 32 px of blend on the way back.
CROP_SETTINGS = ["bilinear", "lanczos", False, "ensure minimum resolution", 1024, 1024, 16384, 16384,
                 True, 0, False, 32, 0.1, False, 1.0, 1.0, 1.0, 1.0, 1.5, True, 1024, 1024, "32", "gpu (much faster)"]


def build_krea2_edit(image_file: str, target: str, denoise: float, seed: int):
    """Change part of a picture with the stock sampler: SAM 3.1 finds what you named, Krea 2
    re-renders only that, and only the box around it is ever resized.

    This used to put the whole photo through ImageScaleToTotalPixels at 1 MP, so a 4 MP source
    came back as a 1 MP one whether or not you wanted that. It now does what 08 does: cut a
    context-padded box around the mask, edit that at 1024, blend it back. Everything outside the
    mask keeps the resolution you uploaded, and the model still works at the size it was trained
    for. The cost is that InpaintCropImproved is a node pack rather than stock ComfyUI, so this is
    no longer the workflow that runs on a bare install; it is in NODE_PACKS, so on this deployment
    that distinction is academic.

    Krea 2 has no inpainting checkpoint, so context still comes only from the latent:
    SetLatentNoiseMask re-noises the unmasked part to the current sigma every step, which means
    the early steps, the ones that decide composition, see almost nothing. That is why denoise is
    0.6 here rather than 1.0, and why DifferentialDiffusion fades the mask in over the steps
    instead of switching it on. 09 uses the LanPaint sampler to attack the same problem properly
    and can therefore run at full denoise; this one is the conservative version.

    RAW rather than Turbo: partial denoising at CFG 1 gives the prompt almost nothing to steer
    with, and 8 distilled steps times 0.6 is five real steps.
    """
    g = Graph()
    add = g.add
    img = add("LoadImage", [image_file, "image"], (40, 60), "Image to edit; paint extra mask in the MaskEditor if SAM misses something", YELLOW)
    sam = add("CheckpointLoaderSimple", ["sam3.1_multiplex_fp16.safetensors"], (40, 320), "SAM 3.1 (segments by text)")
    what = add("CLIPTextEncode", [target], (40, 440), f"What to mask: \"{target}\"", GREEN, clip=(sam, 1))
    det = add("SAM3_Detect", [0.5, 2, False], (40, 620), "Finds it and returns the mask", model=(sam, 0), image=(img, 0), conditioning=(what, 0))
    grow = add("GrowMask", [12, True], (40, 800), "A little slack around the edge, so the seam has somewhere to blend", mask=(det, 0))
    both = add("MaskComposite", [0, 0, "add"], (40, 920), "Automatic mask plus whatever you painted", destination=(grow, 0), source=(img, 1))
    crop = add("InpaintCropImproved", CROP_SETTINGS, (40, 1080), "Only this box is resized; the rest of the photo is left alone", YELLOW, image=(img, 0), mask=(both, 0))
    add("MaskPreview", [], (40, 1320), "Mask inside the crop: white is repainted", mask=(crop, 2))

    unet = add("UNETLoader", ["krea2_raw_bf16.safetensors", "default"], (420, 60), "Krea 2 RAW: CFG has to bite for an edit")
    clip = add("CLIPLoader", ["qwen3vl_4b_bf16.safetensors", "krea2", "default"], (420, 180), "Text encoder (Qwen3-VL 4B, krea2)")
    vae = add("VAELoader", ["qwen_image_vae.safetensors"], (420, 300), "Qwen-Image VAE")
    dd = add("DifferentialDiffusion", [1.0], (420, 400), "Fades the mask in over the steps, so the edit has no hard seam", model=(unet, 0))
    pos = add("CLIPTextEncode", ["a red waxed cotton jacket"], (420, 500), "What the masked part should become", GREEN, clip=(clip, 0))
    neg = add("CLIPTextEncode", ["blurry, washed out, plastic skin"], (420, 740), "Negative", RED, clip=(clip, 0))
    enc = add("VAEEncode", [], (420, 960), "The crop as a latent", pixels=(crop, 1), vae=(vae, 0))
    masked = add("SetLatentNoiseMask", [], (420, 1080), "Only the masked part gets new noise", YELLOW, samples=(enc, 0), mask=(crop, 2))

    ks = add("KSampler", [seed, "randomize", 52, 3.5, "euler", "simple", denoise], (800, 60),
             f"denoise {denoise}: lower keeps more of the original, higher invents more",
             model=(dd, 0), positive=(pos, 0), negative=(neg, 0), latent_image=(masked, 0))
    dec = add("VAEDecode", [], (800, 420), samples=(ks, 0), vae=(vae, 0))
    st = add("InpaintStitchImproved", [], (800, 540), "Blend it back into the original, at its own resolution", stitcher=(crop, 0), inpainted_image=(dec, 0))
    add("SaveImage", ["krea2-edit/render"], (800, 660), "Save", BLUE, images=(st, 0))
    write(g, "07-krea2-masked-edit", [("Mask and crop", [20, 10, 360, 1420], "#b58b2a"), ("Model, prompt", [400, 10, 360, 1200], "#3f789e"), ("Sample and stitch", [780, 10, 380, 780], "#8A8")])


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


def build_krea2_outfit_posed(image_file: str, target: str, outfit: str, seed: int):
    """09 with the body held in place, which is the branch 08 has and 09 was missing.

    08 pins the body by rendering a mesh from SAM 3D Body and feeding it to Z-Image's Fun
    Controlnet. Krea 2 needs two different pieces for the same idea. SAM3DBody_Render has an
    openpose_2d style that draws a DWPose-looking skeleton instead of a mesh, and the pose LoRA in
    catalog.py teaches Krea 2 to read one. The skeleton goes in through ostris' encoder rather
    than a controlnet node: it rides with the prompt into Qwen3-VL as a reference image.

    The skeleton is cropped by the same InpaintCropImproved settings as the picture, so the two
    line up pixel for pixel. That is what 08 does with its second crop node and it is not optional:
    a pose map at a different scale than the latent pins the wrong body.

    Two things here are unproven and worth knowing before you read the output as a verdict on the
    idea. The LoRA was trained on Krea 2 Turbo and this runs it on RAW, so if the pose does not
    take, try krea2_turbo_bf16 at 8 steps and CFG 1 first. And nobody has put a pose LoRA and
    LanPaint together: one steers the model, the other the sampler, and they should not fight, but
    should is not the same as does. 09 stays as it is so there is always one that works.
    """
    g = Graph()
    add = g.add
    img = add("LoadImage", [image_file, "image"], (40, 60), "Your image; paint extra mask in the MaskEditor if SAM misses something", YELLOW)
    sam = add("CheckpointLoaderSimple", ["sam3.1_multiplex_fp16.safetensors"], (40, 320), "SAM 3.1 (segments by text)")
    what = add("CLIPTextEncode", [target], (40, 440), f"What to mask automatically ('{target}')", GREEN, clip=(sam, 1))
    det = add("SAM3_Detect", [0.5, 2, False], (40, 620), "Mask every match above the threshold", model=(sam, 0), image=(img, 0), conditioning=(what, 0))
    grow = add("GrowMask", [12, True], (40, 800), "Grow past the edge so the old fabric is fully covered", mask=(det, 0))
    both = add("MaskComposite", [0, 0, "add"], (40, 920), "Automatic mask plus whatever you painted", destination=(grow, 0), source=(img, 1))
    crop = add("InpaintCropImproved", CROP_SETTINGS, (40, 1080), "Crop around the mask at 1024, context factor 1.5, 32 px blend", YELLOW, image=(img, 0), mask=(both, 0))
    add("PreviewImage", [], (40, 1320), "The crop the sampler works on", images=(crop, 1))

    rt = add("UNETLoader", ["rt_detr_v4-x-hgnet_fp16.safetensors", "default"], (420, 60), "RT-DETR (person boxes)")
    box = add("RTDETR_detect", [0.5, "person", 1], (420, 180), "The person's box, so the body fit picks the right one", model=(rt, 0), image=(img, 0))
    body = add("SAM3DBody_Loader", ["sam_3d_body_dinov3_bf16.safetensors"], (420, 340), "SAM 3D Body")
    fit = add("SAM3DBody_Predict", [True, 0.0, 64], (420, 460), "Fit a body to the whole image", sam3d_body_model=(body, 0), image=(img, 0), bboxes=(box, 0))
    pose = add("SAM3DBody_Render", [0, 0, "openpose_2d", 4, 4, 0.6, "disabled", "disabled", 0.6], (420, 620),
               "Skeleton at full size; hands and face off, the outfit does not need them", pose_data=(fit, 0))
    posecrop = add("InpaintCropImproved", CROP_SETTINGS, (420, 820), "The same crop on the skeleton, so it lines up with the latent", YELLOW, image=(pose, 0), mask=(both, 0))
    add("PreviewImage", [], (420, 1060), "The pose the model is given", images=(posecrop, 1))

    unet = add("UNETLoader", ["krea2_raw_bf16.safetensors", "default"], (800, 60), "Krea 2 RAW")
    lora = add("LoraLoaderModelOnly", ["krea2_turbo_openpose_controlnet.safetensors", 1.0], (800, 180), "Pose LoRA (trained on Turbo, running on RAW)", RED, model=(unet, 0))
    patch = add("Krea2OstrisEditModelPatch", [False], (800, 300), "Lets the model read the reference; kv_cache off, this is a plain edit LoRA", model=(lora, 0))
    clip = add("CLIPLoader", ["qwen3vl_4b_bf16.safetensors", "krea2", "default"], (800, 420), "Text encoder (Qwen3-VL 4B, krea2)")
    vae = add("VAELoader", ["qwen_image_vae.safetensors"], (800, 540), "Qwen-Image VAE")
    pos = add("TextEncodeKrea2OstrisEdit", [outfit], (800, 640), "The outfit, with the skeleton as its reference", GREEN, clip=(clip, 0), vae=(vae, 0), image1=(posecrop, 1))
    neg = add("TextEncodeKrea2OstrisEdit", ["blurry, low quality, distorted, deformed, text, watermark"], (800, 900), "Negative, no reference", RED, clip=(clip, 0))
    enc = add("VAEEncode", [], (800, 1120), pixels=(crop, 1), vae=(vae, 0))
    masked = add("SetLatentNoiseMask", [], (800, 1240), "Noise only inside the mask", YELLOW, samples=(enc, 0), mask=(crop, 2))

    ks = add("LanPaint_KSampler",
             [seed, "fixed", 24, 3.5, "euler", "simple", 1.0, 3, "Image First", "LanPaint KSampler.", "\U0001f5bc\ufe0f Image Inpainting"],
             (1180, 60), "LanPaint keeps the new clothing agreeing with the body around it",
             model=(patch, 0), positive=(pos, 0), negative=(neg, 0), latent_image=(masked, 0))
    dec = add("VAEDecode", [], (1180, 420), samples=(ks, 0), vae=(vae, 0))
    st = add("InpaintStitchImproved", [], (1180, 540), "Blend it back into the original", stitcher=(crop, 0), inpainted_image=(dec, 0))
    add("SaveImage", ["krea2-outfit-posed/result"], (1180, 660), "Save", BLUE, images=(st, 0))
    write(g, "10-krea2-outfit-swap-posed", [("Mask and crop", [20, 10, 360, 1420], "#b58b2a"), ("Body", [400, 10, 360, 1200], "#8A8"),
                                            ("Model and prompt", [780, 10, 360, 1400], "#3f789e"), ("Sample and stitch", [1160, 10, 380, 780], "#653")])


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
build_krea2_edit("example.png", target="jacket", denoise=0.6, seed=1)
build_krea2_outfit("example.png", target="clothing", outfit="a red hooded sweatshirt and black denim shorts", seed=20260912)
build_krea2_outfit_posed("example.png", target="clothing", outfit="a red hooded sweatshirt and black denim shorts", seed=20260912)
build_upscale("example.png", megapixels=4.0, seed=1)
