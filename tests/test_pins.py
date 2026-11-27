"""Everything the image installs is pinned (security review S4): a rebuild takes exactly what was chosen."""
import re
from pathlib import Path

from comfy_modal import pins
from comfy_modal.catalog import MODELS, NODE_PACKS, REVISIONS

SRC = Path(__file__).parents[1] / "comfy_modal"
IMAGE = (SRC / "image.py").read_text()


def test_every_model_repo_has_a_commit():
    assert {m.repo for m in MODELS} <= set(REVISIONS), {m.repo for m in MODELS} - set(REVISIONS)
    assert all(re.fullmatch(r"[0-9a-f]{40}", sha) for sha in REVISIONS.values())


def test_every_node_pack_has_a_version():
    assert all(re.fullmatch(r"\d+(\.\d+)+", v) for v in NODE_PACKS.values()), NODE_PACKS


def test_every_pip_install_in_the_images_is_pinned_in_the_file_dependabot_reads():
    assert pins.PINS and all(re.search(r"==\d", line) for line in pins.PINS.values()), pins.PINS
    for module in ("image.py", "studio.py"):
        calls = re.findall(r"uv_pip_install\((.*)\)", (SRC / module).read_text())
        assert calls and all(c.startswith("*pinned(") for c in calls), (module, calls)
        for c in calls:
            pins.pinned(*re.findall(r'"([^"]+)"', c))  # every name is in the file


def test_the_image_installs_comfyui_without_the_manager():
    assert "--skip-manager" in IMAGE and "--version {v}" in IMAGE
