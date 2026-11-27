"""Every graph against ComfyUI's own node definitions (tests/object_info.json, refreshed with
tools/object_info_snapshot.py). A wrong input name, a missing input, a link to the wrong output or a value
outside a node's choices does not fail when a graph is built: ComfyUI rejects it on the GPU, or worse, takes it."""
import json
from pathlib import Path

import pytest

from comfy_modal import graph, graphs
from tests.samples import IMG, samples

INFO = json.loads((Path(__file__).parent / "object_info.json").read_text())
FILES = (".safetensors", ".gguf", ".pt", ".pth", ".bin", ".ckpt")
GRAPHS = samples()


def _declared(cls: str) -> dict:
    spec = INFO[cls]["input"]
    return {**spec.get("required", {}), **spec.get("optional", {})}


def _type(t) -> str | None:
    return t if isinstance(t, str) else None  # a list is a combo of values


@pytest.mark.parametrize("name", GRAPHS)
def test_graph_matches_node_definitions(name):
    g = GRAPHS[name]
    for nid, node in g.items():
        cls = node["class_type"]
        assert cls in INFO, f"{name}: node {nid} is {cls}, which ComfyUI does not know (or the snapshot is old)"
        declared = _declared(cls)
        inputs = node["inputs"]
        for required in INFO[cls]["input"].get("required", {}):
            assert required in inputs or any(k.startswith(required + ".") for k in inputs), f"{name}: {cls} misses {required!r}"
        for key, value in inputs.items():
            base = key.split(".", 1)[0]  # a dynamic combo's options ride as "name.option"
            assert base in declared, f"{name}: {cls} has no input {key!r}"
            spec = declared[base][0]
            if isinstance(value, list):  # a link
                src = g.get(value[0])
                assert src, f"{name}: {cls}.{key} links to missing node {value[0]}"
                outs = INFO[src["class_type"]]["output"]
                assert value[1] < len(outs), f"{name}: {cls}.{key} takes output {value[1]} of {src['class_type']}, which has {len(outs)}"
                want, got = _type(spec), outs[value[1]]
                if want and want != "*" and got != "*" and "." not in key:
                    assert got in want.split(","), f"{name}: {cls}.{key} wants {want}, {src['class_type']} gives {got}"
            elif isinstance(spec, list) and spec and isinstance(value, str) and not value.endswith(FILES):
                assert value in spec, f"{name}: {cls}.{key}={value!r} is not one of its choices"


IMAGE_GRAPHS = [n for n, g in GRAPHS.items() if not any(x["class_type"] == "StudioFaceScore" for x in g.values())]


@pytest.mark.parametrize("name", IMAGE_GRAPHS)
def test_graph_sends_one_image_back(name):
    r = graph.roles(GRAPHS[name])
    assert GRAPHS[name][r["output"]]["class_type"] == "SaveImageWebsocket"
    assert sum(n["class_type"] == "SaveImageWebsocket" for n in GRAPHS[name].values()) == 1


def test_stages_and_counted_samplers_are_marked():
    assert set(graph.roles(GRAPHS["people dress and faces"])) >= {"dresser", "sampler", "output"}
    assert set(graph.roles(GRAPHS["inpaint finish face"])) >= {"dresser", "sampler", "swapper", "output"}
    assert graph.roles(GRAPHS["upscale"])["upscaler"]
    assert set(graph.stages(GRAPHS["body"]).values()) >= {"fitting"}


def test_face_match_sends_a_score_and_no_image():
    classes = [n["class_type"] for n in GRAPHS["face"].values()]
    assert classes.count("StudioFaceScore") == 1 and "SaveImageWebsocket" not in classes


def test_face_pass_runs_only_without_a_face_photo():
    assert "refining" in graph.stages(GRAPHS["render face pass"]).values()
    assert "refining" in graph.stages(GRAPHS["render finish face pass"]).values()
    swapped = graphs.graph("krea2", "krea2_turbo_bf16.safetensors", "a cat", "", 512, 768, 1, 8, 1.0, [], IMG, face_pass=0.35)
    assert "refining" not in graph.stages(swapped).values() and "swapping" in graph.stages(swapped).values()


def _count(name: str, cls: str) -> int:
    return sum(n["class_type"] == cls for n in GRAPHS[name].values())


def test_people_are_dressed_over_their_mask_held_to_the_body_sent():
    # each dressed person over the mask the phone sent; only the one sent with a body gets it as control, and nothing is
    # found or fitted on the way
    assert _count("people dress and faces", "ZImageFunControlnet") == 2
    assert _count("people dress and faces", "ImageToMask") == 2
    assert _count("people dress and faces", "InpaintCropImproved") >= 3  # two pictures and one body's depth, then faces
    for gone in ("SAM3_Detect", "SAM3DBody_Predict", "RTDETR_detect", "StudioPersonBox"):
        assert _count("people dress and faces", gone) == 0
    assert _count("people dress and faces", "StudioFaceMask") == 2
    controls = [n for n in samples()["people dress and faces"].values() if n["class_type"] == "ZImageFunControlnet"]
    assert ["image" in n["inputs"] for n in controls] == [True, False]


def test_people_dressed_over_their_own_mask_find_nothing_and_redraw_nothing():
    assert _count("people no face over their mask", "StudioFaceMask") == 0
    assert _count("people no face over their mask", "SAM3_Detect") == 0
    assert _count("people no face over their mask", "CheckpointLoaderSimple") == 0  # nor a SAM loaded for nothing
    assert _count("people no face over their mask", "ImageToMask") == 1


def test_no_lanpaint_and_a_repaint_is_drawn_by_z_image_then_finished():
    for name, g in samples().items():
        assert not any(n["class_type"] == "LanPaint_KSampler" for n in g.values()), name
    assert _count("inpaint", "ZImageFunControlnet") == 1
    assert _count("inpaint", "SAM3DBody_Predict") == 0
    assert _count("inpaint finish face", "KSampler") == 3  # drawn, finished, head swapped


def test_areas_come_back_as_one_strip_one_area_each():
    assert _count("areas", "StudioMaskStrip") == 1
    assert _count("areas", "MaskComposite") == 2


def test_head_swap_takes_the_head_around_a_face_not_any_head():
    g = GRAPHS["render face of two"]
    sam = [n for n in g.values() if n["class_type"] == "SAM3_Detect"]
    assert sam and all("bboxes" in n["inputs"] and "conditioning" not in n["inputs"] for n in sam)  # a box, no words
    assert any(n["class_type"] == "StudioFaceMask" and n["inputs"].get("slot") == 1 for n in g.values())
