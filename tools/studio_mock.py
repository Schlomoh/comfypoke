"""The studio app against a fake GPU worker: the real comfy_modal/studio_api.py, with the Worker, the
worker's heartbeat, the models volume and the billing API replaced by stand-ins. No Modal calls and
nothing billed. Renders are flat colors with a few seconds of fake progress; upscales are the image
scaled up; a repaint or a dressing is the image with each mask sent tinted violet, each redrawn face pink; SAM's find
is a white ellipse in one of five bands, picked by the text; a person's fitted body is a stick figure below their face;
the face finder answers two faces, and an area is the column below a face. Starts the API and Vite (hot reload) together; Ctrl+C stops both.

    npm --prefix studio run dev:mock       the usual way in
    uv run --with fastapi --with uvicorn --with pillow tools/studio_mock.py [--port 8788] [--api-only]

The access key is "mock". A prompt containing the word "fail" makes the render fail, to try the
error path; MOCK_BOOT=20 makes the first message wait 20 s, like a cold GPU.
"""
import argparse
import asyncio
import base64
import io
import json
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["COMFY_ACCESS_KEY"] = "mock"
sys.path.insert(0, str(ROOT))

import modal  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

from comfy_modal import config, graph, seal  # noqa: E402

PRIVATE, os.environ[config.TRANSPORT_PUBLIC_ENV] = seal.mint()  # read when studio_api is imported
TRANSPORT = seal.load_private(PRIVATE)

from comfy_modal import studio_api  # noqa: E402

STEP_SECONDS = 0.4


def frame(fmt: int, color, size, image: Image.Image | None = None) -> bytes:
    """ComfyUI's binary websocket frame: PREVIEW_IMAGE, then 1 for a JPEG preview or 2 for the final PNG."""
    b = io.BytesIO()
    (image or Image.new("RGB", size, color)).save(b, "PNG" if fmt == 2 else "JPEG")
    return (1).to_bytes(4, "big") + fmt.to_bytes(4, "big") + b.getvalue()


def _nodes(g: dict, class_type: str) -> list[dict]:
    return [n for n in g.values() if n["class_type"] == class_type]


def _images(g: dict) -> list[Image.Image]:
    """The base64 images in the prompt, in order: the picture, then a mask or a face photo."""
    return [Image.open(io.BytesIO(base64.b64decode(n["inputs"]["data"]))) for n in _nodes(g, "StudioImageBase64")]


async def run(payload):
    """Worker.run's encryption included: the images arrive sealed and leave sealed, as on the GPU."""
    key = seal.unwrap(TRANSPORT, payload["key"])
    async for kind, data in fake(seal.open_prompt(key, payload["prompt"]), payload["prompt_id"]):
        yield (kind, seal.seal_frame(key, data) if kind == "bytes" else data)


async def fake(g, pid):
    msg = lambda kind, **d: ("json", {"type": kind, "data": {"prompt_id": pid, **d}})  # noqa: E731
    roles, stages = graph.roles(g), graph.stages(g)
    await asyncio.sleep(float(os.environ.get("MOCK_BOOT", "0")))
    texts = [n["inputs"].get("text") or n["inputs"].get("prompt") or "" for n in _nodes(g, "CLIPTextEncode")]
    if any("fail" in t.lower() for t in texts):
        yield msg("execution_error", exception_message="the mock was asked to fail")
        return
    images, out = _images(g), None
    if _nodes(g, "StudioFaceScore"):  # the face match: a number from the picture, so an image keeps its score
        yield msg("executing", node=next(iter(stages)))
        await asyncio.sleep(STEP_SECONDS * 2)
        small = images[0].convert("L").resize((8, 8))
        yield ("json", seal.score_message(pid, {"score": round(0.05 + sum(small.getdata()) % 70 / 100, 3)}))
        yield msg("execution_success")
        return
    # a repaint or a dressing, by the mask that came with the picture; a render's face pass crops too, with no picture
    first = next((g[k] for k in sorted(g, key=int) if g[k]["class_type"] == "KSampler"), None)  # the render's own sampler
    rendered = bool(first) and g.get(first["inputs"]["latent_image"][0], {}).get("class_type", "").startswith("Empty")
    cropped = not rendered and len(images) > 1 and bool(_nodes(g, "InpaintCropImproved")) and "SetLatentNoiseMask" in {n["class_type"] for n in g.values()}
    labels, boxes = _nodes(g, "StudioFaceLabels"), [n["inputs"]["box"] for n in _nodes(g, "StudioFaceMask") if n["inputs"].get("box")]
    if labels:  # the faces found: two, at a third and two thirds across, taken by the first people sent (assign.levels)
        w, h = images[0].size
        out = Image.new("RGB", (w, h))
        cast = len(json.loads(labels[0]["inputs"].get("people") or "[]"))
        for k, cx in enumerate((w // 3, 2 * w // 3)):
            level = k + 1 if k < cast else 5 + k - min(k, cast)
            ImageDraw.Draw(out).rectangle((cx - w // 14, h // 10, cx + w // 14, h // 10 + w // 7), fill=(level * 25,) * 3)
    elif _nodes(g, "StudioMaskStrip"):  # People's areas: each person's column below their face, side by side
        w, h = images[0].size
        people = _nodes(g, "StudioPersonBox")
        out = Image.new("RGB", (w * len(people), h))
        for k, n in enumerate(people):
            box = n["inputs"]["box"] or f"{w // 3},0,{2 * w // 3},0"
            x0, y0, x1, y1 = (int(v) for v in box.split(","))
            ImageDraw.Draw(out).rectangle((k * w + x0 - (x1 - x0), y1, k * w + x1 + (x1 - x0), h), fill=(255, 255, 255))
    elif "dresser" in roles or (boxes and not rendered):  # a repaint or People: each mask sent violet, each redrawn face pink
        out = images[0].convert("RGB")
        for n in _nodes(g, "ImageToMask"):
            mask = Image.open(io.BytesIO(base64.b64decode(g[n["inputs"]["image"][0]]["inputs"]["data"]))).convert("L")
            out = Image.composite(Image.new("RGB", out.size, (150, 80, 220)), out, mask.point(lambda v: v * 6 // 10))
        d = ImageDraw.Draw(out, "RGBA")
        for box in boxes:
            d.rectangle(tuple(int(v) for v in box.split(",")), fill=(255, 62, 165, 110))
    elif _nodes(g, "SAM3_Detect") and not cropped and not _nodes(g, "KSampler"):  # SAM's find by text: a white blob on black, placed by the text
        w, h = images[0].size
        out = Image.new("RGB", (w, h))
        taps = json.loads(_nodes(g, "SAM3_Detect")[0]["inputs"].get("positive_coords", "[]"))
        for p in taps:  # a tap: a blob around the point
            ImageDraw.Draw(out).ellipse((p["x"] - w // 8, p["y"] - h // 10, p["x"] + w // 8, p["y"] + h // 10), fill=(255, 255, 255))
        if texts:  # by text: one of five bands, top to bottom
            k = sum(map(ord, texts[0])) % 5
            ImageDraw.Draw(out).ellipse((w // 4, h * k // 5, 3 * w // 4, h * (k + 1) // 5), fill=(255, 255, 255))
    elif _nodes(g, "SAM3DBody_Render"):  # a person's fitted body as depth: a stick figure below their face, on black
        w, h = images[0].size
        out = Image.new("RGB", (w, h))
        d = ImageDraw.Draw(out)
        line = dict(fill=(200, 200, 200), width=max(3, w // 120))
        box = _nodes(g, "StudioPersonBox")[0]["inputs"]["box"]
        for x in ((int(box.split(",")[0]) + int(box.split(",")[2])) // 2 if box else w // 2,):
            d.ellipse((x - w // 16, h // 8, x + w // 16, h // 8 + w // 8), outline=line["fill"], width=line["width"])
            for a, b in [((x, h // 4), (x, h * 3 // 5)), ((x - w // 8, h // 3), (x + w // 8, h // 3)),
                         ((x, h * 3 // 5), (x - w // 12, h * 9 // 10)), ((x, h * 3 // 5), (x + w // 12, h * 9 // 10))]:
                d.line((a, b), **line)
    elif "upscaler" in roles:  # an upscale: the image comes with the prompt
        src = images[0]
        s = (_nodes(g, "ImageScaleToTotalPixels")[-1]["inputs"]["megapixels"] * 1024 * 1024 / (src.width * src.height)) ** 0.5
        out = Image.new("RGB", (round(src.width * s), round(src.height * s)), src.convert("RGB").getpixel((src.width // 2, src.height // 2)))
    else:
        latent = next(n for n in g.values() if n["class_type"].startswith("Empty") and "Latent" in n["class_type"])
        out = Image.new("RGB", (latent["inputs"]["width"], latent["inputs"]["height"]), (200, 120, 60))
    size = out.size
    for nid, stage in stages.items():  # each stage once, in the prompt's order, as ComfyUI announces nodes
        if stage in ("sampling", "refining", "dressing", "swapping", "upscaling") and nid in roles.values():
            continue  # the samplers below announce themselves
        yield msg("executing", node=nid)
        await asyncio.sleep(STEP_SECONDS / 4)
    for role in ("dresser", "sampler", "swapper"):
        if role not in roles:
            continue
        nid = roles[role]
        steps = g[nid]["inputs"]["steps"]
        yield msg("executing", node=nid)
        for i in range(1, steps + 1):
            yield msg("progress", node=nid, value=i, max=steps)
            yield ("bytes", frame(1, (20 * i % 255, 80, 160), (max(8, size[0] // 8), max(8, size[1] // 8))))
            await asyncio.sleep(STEP_SECONDS)
    if "upscaler" in roles:
        yield msg("executing", node=roles["upscaler"])
        await asyncio.sleep(STEP_SECONDS * 4)
    yield msg("executing", node=roles["output"])
    yield ("bytes", frame(2, None, size, out))
    yield msg("execution_success")


async def noop(*_, **__):
    return None


class Remote:
    def __init__(self, fn):
        self.aio = fn


class Method:
    def __init__(self, fn):
        self.remote = self.remote_gen = Remote(fn)


class Worker:
    run, interrupt, ping, stop = Method(run), Method(noop), Method(noop), Method(noop)


class Heartbeat:
    async def _get(self, _):
        now = time.time()
        return {"state": "warm", "since": now - 120, "beat": now, "busy": 0, "last_input": now - 30, "gpu": "L40S", "rate": 1.95, "idle_limit": 300}

    def __init__(self):
        self.get = Remote(self._get)


class Entry:
    def __init__(self, path):
        self.path = path


class Models:
    async def _ls(self, path):
        return [Entry(f"{path}/{n}") for n in ("mock_character_v1.safetensors", "mock_style.safetensors")]

    def __init__(self):
        self.listdir = Remote(self._ls)


studio_api._worker = lambda: Worker()
modal.Dict.from_name = staticmethod(lambda *a, **k: Heartbeat())
modal.Volume.from_name = staticmethod(lambda *a, **k: Models())
studio_api._billing.update(at=time.time() + 1e9, data={"used": 0.0, "left": 30.0, "monthly": 30})

if __name__ == "__main__":
    import uvicorn

    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8788)
    ap.add_argument("--api-only", action="store_true", help="no Vite: point your own at it with STUDIO_URL")
    args = ap.parse_args()
    env = {**os.environ, "STUDIO_URL": f"http://127.0.0.1:{args.port}"}
    vite = None if args.api_only else subprocess.Popen(["npm", "--prefix", str(ROOT / "studio"), "run", "dev"], env=env)
    print(f"mock studio API on :{args.port}, access key: mock", flush=True)
    try:
        uvicorn.run(studio_api.api, host="127.0.0.1", port=args.port, log_level="warning")
    finally:
        if vite:
            vite.terminate()
