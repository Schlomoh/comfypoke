"""Refresh tests/object_info.json: the definitions of every node class the studio's graphs use, read from the
deployed GUI's ComfyUI (the same node packs as the worker; no GPU needed). Run after adding a node type or a pack.

    uv run tools/object_info_snapshot.py [--url https://...]
"""
import argparse
import json
import sys
import urllib.request

from render import REPO, config, default_url

sys.path.insert(0, str(REPO))
from tests.samples import samples  # noqa: E402

ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
ap.add_argument("--url", default=None)
url = (ap.parse_args().url or default_url()).rstrip("/")
key = (REPO / config.ACCESS_KEY_FILE).read_text().strip()
req = urllib.request.Request(f"{url}/api/object_info", headers={"Cookie": f"comfy_key={key}"})
with urllib.request.urlopen(req, timeout=300) as r:
    info = json.load(r)
used = sorted({n["class_type"] for g in samples().values() for n in g.values()})
missing = [c for c in used if c not in info]
keep = {c: {k: info[c][k] for k in ("input", "output", "output_name")} for c in used if c in info}
(REPO / "tests" / "object_info.json").write_text(json.dumps(keep, indent=1, sort_keys=True) + "\n")
print(f"wrote {len(keep)} node classes to tests/object_info.json")
if missing:
    sys.exit(f"the running ComfyUI does not know {missing}: deploy its node pack, then run this again")
