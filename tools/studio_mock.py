"""The studio app against a fake GPU worker: the real comfy_modal/studio_api.py, with the Worker, the
worker's heartbeat, the models volume and the billing API replaced by stand-ins. No Modal calls and
nothing billed. Renders are flat colors with a few seconds of fake progress; upscales are the image
scaled up. Starts the API and Vite (hot reload) together; Ctrl+C stops both.

    npm --prefix studio run dev:mock       the usual way in
    uv run --with fastapi --with uvicorn --with pillow tools/studio_mock.py [--port 8788] [--api-only]

The access key is "mock". A prompt containing the word "fail" makes the render fail, to try the
error path; MOCK_BOOT=20 makes the first message wait 20 s, like a cold GPU.
"""
import argparse
import asyncio
import base64
import io
import os
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
os.environ["COMFY_ACCESS_KEY"] = "mock"
sys.path.insert(0, str(ROOT))

import modal  # noqa: E402
from PIL import Image  # noqa: E402

from comfy_modal import graphs, studio_api  # noqa: E402

STEP_SECONDS = 0.4


def frame(fmt: int, color, size) -> bytes:
    """ComfyUI's binary websocket frame: PREVIEW_IMAGE, then 1 for a JPEG preview or 2 for the final PNG."""
    b = io.BytesIO()
    Image.new("RGB", size, color).save(b, "PNG" if fmt == 2 else "JPEG")
    return (1).to_bytes(4, "big") + fmt.to_bytes(4, "big") + b.getvalue()


async def run(payload):
    g, pid = payload["prompt"], payload["prompt_id"]
    msg = lambda kind, **d: ("json", {"type": kind, "data": {"prompt_id": pid, **d}})  # noqa: E731
    await asyncio.sleep(float(os.environ.get("MOCK_BOOT", "0")))
    text = g.get("4", {}).get("inputs", {}).get("text", "")
    if "fail" in text.lower():
        yield msg("execution_error", exception_message="the mock was asked to fail")
        return
    if "30" in g:  # an upscale: the image comes with the prompt
        src = Image.open(io.BytesIO(base64.b64decode(g["30"]["inputs"]["data"])))
        s = (g["42"]["inputs"]["megapixels"] * 1024 * 1024 / (src.width * src.height)) ** 0.5
        size, color = (round(src.width * s), round(src.height * s)), src.convert("RGB").getpixel((src.width // 2, src.height // 2))
    else:
        size, color = (g["6"]["inputs"]["width"], g["6"]["inputs"]["height"]), (200, 120, 60)
    yield msg("executing", node="1" if "1" in g else "30")
    await asyncio.sleep(STEP_SECONDS)
    if graphs.SAMPLER in g:
        steps = g[graphs.SAMPLER]["inputs"]["steps"]
        yield msg("executing", node=graphs.SAMPLER)
        for i in range(1, steps + 1):
            yield msg("progress", node=graphs.SAMPLER, value=i, max=steps)
            yield ("bytes", frame(1, (20 * i % 255, 80, 160), (max(8, size[0] // 8), max(8, size[1] // 8))))
            await asyncio.sleep(STEP_SECONDS)
    if graphs.UPSCALER in g:
        yield msg("executing", node=graphs.UPSCALER)
        await asyncio.sleep(STEP_SECONDS * 4)
    yield msg("executing", node="9")
    yield ("bytes", frame(2, color, size))
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
