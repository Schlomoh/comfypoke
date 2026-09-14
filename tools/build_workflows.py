"""Generate the default workflows in workflows/ and their API-format prompts in tools/*_api.json.

    uv run tools/build_workflows.py

01  Z-Image-Turbo text to image: 8 steps, CFG 1.
02  FLUX.2 klein 4B text to image: 4 steps, CFG 1.
03  Upscale with SeedVR2 7B: one step, size set in megapixels, color matched to the source.

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
build_upscale("example.png", megapixels=4.0, seed=1)
