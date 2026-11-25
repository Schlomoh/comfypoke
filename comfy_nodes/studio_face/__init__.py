"""Faces, by InsightFace: how much the face in one image looks like the face in another (the studio's face match),
where a face is (the face pass's mask), every face and whose it is (the Edit tab's People), and which person found by
RT-DETR a face belongs to (dressing one of several).

InsightFace's buffalo_l pack (catalog.py) finds the largest face in each image and turns it into an ArcFace embedding;
the score is their cosine similarity. Around 0.22 is where buffalo_l tells two people apart on photo benchmarks, and
the same person scores well above that. On the CPU on purpose: two faces take a fraction of a second there, and
onnxruntime's CUDA build would have to agree with the CUDA that PyTorch brings.

The score is the node's only output. It goes out as one message, which the worker rebuilds from the number alone
before it leaves a sealed run (seal.score_message), so nothing of either image comes with it.

The face pass finds the face here rather than with SAM 3.1: asked for "face" on a beach at sunset, SAM marked the sky.
SCRFD finds faces only, and finding none, the mask is empty and the face pass leaves the picture as it was.
"""
import json
import os

import numpy as np
import torch
import folder_paths
from server import PromptServer

from .assign import LEVEL, assign, levels

MESSAGE = "studio_face"
PACK = os.path.join(folder_paths.models_dir, "insightface", "models", "buffalo_l")

_analysis = None


def _faces():
    global _analysis
    if _analysis is None:
        from insightface.app import FaceAnalysis

        # a directory as the name: insightface loads it as it is and never downloads
        _analysis = FaceAnalysis(name=PACK, allowed_modules=["detection", "recognition"], providers=["CPUExecutionProvider"])
        _analysis.prepare(ctx_id=-1, det_size=(640, 640))
    return _analysis


_seen: dict[tuple, list] = {}  # the last few pictures' faces: every person's mask looks at the same render and photos


def _all(image) -> list:
    """Every face in the first image of a batch."""
    key = (image.data_ptr(), tuple(image.shape), float(image[0].sum()))
    if key not in _seen:
        rgb = (image[0].cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
        _seen[key] = list(_faces().get(np.ascontiguousarray(rgb[:, :, ::-1])))  # insightface reads BGR, as OpenCV does
        while len(_seen) > 8:
            del _seen[next(iter(_seen))]
    return _seen[key]


def _largest(image):
    """The largest face in the first image of a batch, or None."""
    faces = _all(image)
    return max(faces, key=lambda f: (f.bbox[2] - f.bbox[0]) * (f.bbox[3] - f.bbox[1])) if faces else None


def _embedding(image) -> np.ndarray | None:
    face = _largest(image)
    return None if face is None else face.normed_embedding


class StudioFaceScore:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",), "reference": ("IMAGE",)}}

    RETURN_TYPES = ()
    OUTPUT_NODE = True
    FUNCTION = "score"
    CATEGORY = "image"

    @classmethod
    def IS_CHANGED(cls, **_):
        return float("nan")  # never from ComfyUI's cache: a cached node sends no message, and the score is its only output

    def score(self, image, reference):
        a, b = _embedding(image), _embedding(reference)
        score = None if a is None or b is None else float(np.dot(a, b))
        server = PromptServer.instance
        server.send_sync(MESSAGE, {"prompt_id": server.last_prompt_id, "score": score}, server.client_id)
        return {}


REFS = 4  # people with a face photo in one picture, at most: assign.PEOPLE


def _box(h: int, w: int, x0: float, y0: float, x1: float, y1: float) -> torch.Tensor:
    mask = torch.zeros((1, h, w), dtype=torch.float32)
    mask[0, max(0, int(y0)):min(h, int(y1)), max(0, int(x0)):min(w, int(x1))] = 1.0
    return mask


def _grown(face, grow: float) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = face.bbox
    dx, dy = (x1 - x0) * grow, (y1 - y0) * grow
    return x0 - dx, y0 - dy, x1 + dx, y1 + dy


def _pick(image, sides: list[str], refs: dict) -> tuple[list, list[int | None]]:
    """The picture's faces left to right, and per person of `sides` the index of theirs (assign.py)."""
    faces = sorted(_all(image), key=lambda f: f.bbox[0] + f.bbox[2])
    photos = [refs.get(f"ref_{n}") for n in range(len(sides))]
    people = [(side, None if photo is None else _embedding(photo)) for side, photo in zip(sides, photos)]
    return faces, assign([((f.bbox[0] + f.bbox[2]) / 2, f.normed_embedding) for f in faces], people)


def _optional_people() -> dict:
    return {"people": ("STRING", {"default": ""}), **{f"ref_{n}": ("IMAGE",) for n in range(REFS)}}


class StudioFaceMask:
    """A face's box, grown by `grow` of its size on each side, as a mask; empty when there is none. With `box`
    ("x0,y0,x1,y1" in pixels) that box as it is: a face the phone picked. With `slot` -1 the largest face. Otherwise
    the face of person `slot` of `people` (a JSON list of where each stands: "left", "center", "right" or ""), each
    person's face photo as `ref_<n>` when they have one (assign.py)."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"image": ("IMAGE",), "grow": ("FLOAT", {"default": 0.15, "min": 0.0, "max": 1.0, "step": 0.05})},
            "optional": {"slot": ("INT", {"default": -1, "min": -1, "max": REFS - 1}), "box": ("STRING", {"default": ""}),
                         **_optional_people()},
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "find"
    CATEGORY = "mask"

    def find(self, image, grow, slot=-1, box="", people="", **refs):
        h, w = image.shape[1], image.shape[2]
        if box:
            return (_box(h, w, *(float(v) for v in box.split(","))),)
        if slot < 0:
            face = _largest(image)
        else:
            faces, pick = _pick(image, json.loads(people or "[]"), refs)
            face = None if slot >= len(pick) or pick[slot] is None else faces[pick[slot]]
        return (_box(h, w, *_grown(face, grow)) if face is not None else torch.zeros((1, h, w), dtype=torch.float32),)


class StudioFaceLabels:
    """Every face in the picture, grown by `grow`, as one label image (assign.levels): the phone reads the boxes and
    whose each is from it, people as in StudioFaceMask."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"image": ("IMAGE",), "grow": ("FLOAT", {"default": 0.15, "min": 0.0, "max": 1.0, "step": 0.05})},
            "optional": _optional_people(),
        }

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "label"
    CATEGORY = "mask"

    def label(self, image, grow, people="", **refs):
        h, w = image.shape[1], image.shape[2]
        faces, pick = _pick(image, json.loads(people or "[]"), refs)
        out = torch.zeros((1, h, w), dtype=torch.float32)
        # largest first, so a small face in front of a large one keeps its own box
        for face, level in sorted(zip(faces, levels(pick, len(faces))), key=lambda fl: -_area(fl[0])):
            if level:
                out = torch.where(_box(h, w, *_grown(face, grow)) > 0, level * LEVEL / 255, out)
        return (out[..., None].repeat(1, 1, 1, 3),)


def _area(face) -> float:
    return (face.bbox[2] - face.bbox[0]) * (face.bbox[3] - face.bbox[1])


class StudioPersonBox:
    """Of the people RT-DETR found (`people`, a BOUNDING_BOX), the one whose box holds the face at `box` ("x0,y0,x1,y1"):
    the smallest that holds its center, so someone standing behind does not take it. With none, a box below the face,
    three faces wide, down to the bottom of the picture. Without `box`, the likeliest person, or the whole picture. As a
    BOUNDING_BOX of one, for SAM 3.1 and SAM 3D Body."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",), "people": ("BOUNDING_BOX",), "box": ("STRING", {"default": ""})}}

    RETURN_TYPES = ("BOUNDING_BOX",)
    FUNCTION = "pick"
    CATEGORY = "mask"

    def pick(self, image, people, box):
        found = people[0] if people and isinstance(people[0], list) else people or []
        h, w = image.shape[1], image.shape[2]
        if not box:
            best = max(found, key=lambda d: d.get("score", 0), default=None)
            return ([[best or {"x": 0.0, "y": 0.0, "width": float(w), "height": float(h), "score": 0.0}]],)
        x0, y0, x1, y1 = (float(v) for v in box.split(","))
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        holding = [d for d in found if d["x"] <= cx <= d["x"] + d["width"] and d["y"] <= cy <= d["y"] + d["height"]]
        if holding:
            return ([[min(holding, key=lambda d: d["width"] * d["height"])]],)
        fw = x1 - x0
        left, right = max(0.0, x0 - fw), min(float(w), x1 + fw)
        return ([[{"x": left, "y": max(0.0, y0), "width": right - left, "height": h - max(0.0, y0), "score": 0.0}]],)


class StudioMaskStrip:
    """Up to four masks of one picture side by side as one image, for the phone to cut apart again: a job sends one image
    back, and People's areas are one per person."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"mask_0": ("MASK",)}, "optional": {f"mask_{n}": ("MASK",) for n in range(1, REFS)}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "strip"
    CATEGORY = "mask"

    def strip(self, **masks):
        parts = [masks[f"mask_{n}"][:1] for n in range(REFS) if masks.get(f"mask_{n}") is not None]
        return (torch.cat(parts, dim=2)[..., None].repeat(1, 1, 1, 3),)


NODE_CLASS_MAPPINGS = {"StudioFaceScore": StudioFaceScore, "StudioFaceMask": StudioFaceMask, "StudioFaceLabels": StudioFaceLabels,
                       "StudioPersonBox": StudioPersonBox, "StudioMaskStrip": StudioMaskStrip}
