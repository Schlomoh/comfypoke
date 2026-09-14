"""Submit a prompt through the deployed UI exactly like the browser does and
print what comes back. Useful for timing and for testing a workflow without
the GUI.

    uv run tools/render.py turbo "a prompt"            Z-Image-Turbo quick render
    uv run tools/render.py api some_prompt.json        any API-format prompt (Save > Export (API))
    options: --seed N  --prefix folder/name  --url https://...  (default: this workspace's deployed UI)
"""
import argparse
import asyncio
import json
import os
import subprocess
import sys
import time
import uuid
from pathlib import Path

import aiohttp

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
from comfy_modal import config  # noqa: E402

MODAL = os.environ.get("MODAL", str(Path.home() / ".local/bin/modal"))


def default_url() -> str:
    workspace = subprocess.run([MODAL, "profile", "current"], capture_output=True, text=True, check=True).stdout.strip()
    return f"https://{workspace}--{config.APP_NAME}-ui-ui.modal.run"


def turbo_prompt(text: str, seed: int, prefix: str) -> dict:
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": text}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": ""}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": 1024, "height": 1024, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
                                                   "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": prefix}},
    }


async def render(url: str, key: str, prompt: dict):
    cid = str(uuid.uuid4())
    t0 = time.time()
    async with aiohttp.ClientSession(cookies={"comfy_key": key}) as s:
        async with s.ws_connect(f"{url}/ws?clientId={cid}") as ws:
            async with s.post(f"{url}/prompt", json={"prompt": prompt, "client_id": cid}) as r:
                res = await r.json()
                pid = res.get("prompt_id")
                print(f"submitted {r.status}", res.get("node_errors") or res.get("error") or "")
                if r.status != 200:
                    return
            async for m in ws:
                if m.type != aiohttp.WSMsgType.TEXT:
                    continue
                msg = json.loads(m.data)
                d = msg.get("data") or {}
                if d.get("prompt_id") not in (None, pid):
                    continue
                t = msg["type"]
                if t == "execution_start":
                    print(f"[{time.time() - t0:5.0f}s] started")
                elif t == "executing" and d.get("node"):
                    print(f"[{time.time() - t0:5.0f}s] node {d['node']}")
                elif t == "progress" and d.get("value") in (1, d.get("max")):
                    print(f"[{time.time() - t0:5.0f}s] step {d['value']}/{d['max']}")
                elif t == "executed":
                    for im in (d.get("output") or {}).get("images", []):
                        print(f"[{time.time() - t0:5.0f}s] saved {im['subfolder']}/{im['filename']}")
                elif t == "execution_error":
                    print("ERROR", d.get("exception_message"))
                    return
                elif t == "execution_success":
                    print(f"[{time.time() - t0:5.0f}s] done")
                    return


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("mode", choices=["turbo", "api"])
    ap.add_argument("arg", help="prompt text (turbo) or path to an API-format json (api)")
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--prefix", default="render/test")
    ap.add_argument("--url", default=None)
    a = ap.parse_args()
    key = (REPO / config.ACCESS_KEY_FILE).read_text().strip()
    prompt = turbo_prompt(a.arg, a.seed, a.prefix) if a.mode == "turbo" else json.load(open(a.arg))
    asyncio.run(render((a.url or default_url()).rstrip("/"), key, prompt))


if __name__ == "__main__":
    main()
