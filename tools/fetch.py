"""Download a model into the models volume from Modal's side (comfy_modal/fetch.py): the file goes from Civitai or
Hugging Face to the volume directly, not through this laptop. The token is read from an environment variable
(or .env) and sent as a header with this one call; it is never put on the command line or stored on Modal.

    uv run tools/fetch.py <download url> <folder> [--auth CIVITAI_TOKEN|HF_TOKEN] [--name file.safetensors]

tools/sync.sh civitai|hf resolve a model page or id into the download URL and call this."""
import argparse
import os
import sys
import time

import modal

from render import REPO, config

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("url")
ap.add_argument("folder", help="models/ subfolder: loras, diffusion_models, checkpoints, ...")
ap.add_argument("--auth", help="environment variable holding the token, sent as a Bearer header")
ap.add_argument("--name", help="file name to save as (default: what the server calls it)")
a = ap.parse_args()

env = dict(line.split("=", 1) for line in (REPO / ".env").read_text().splitlines() if "=" in line) if (REPO / ".env").exists() else {}
headers = {}
if a.auth:
    token = os.environ.get(a.auth) or env.get(a.auth, "").strip()
    if not token:
        sys.exit(f"set {a.auth} (or add it in the console under Tokens)")
    headers["Authorization"] = f"Bearer {token}"

fetch = modal.Function.from_name(config.APP_NAME, "fetch")
start = time.time()
last = ""
for line in fetch.remote_gen(a.url, a.folder, headers, a.name):
    print(line, flush=True)
    last = line
if last.startswith("done "):
    print(f"in {a.folder} after {time.time() - start:.0f} s; reload the GUI or the studio's model list to see it")
