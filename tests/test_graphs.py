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
    assert set(graph.roles(GRAPHS["dress finish face"])) >= {"dresser", "sampler", "swapper", "output"}
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
