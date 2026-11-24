"""Faces, by InsightFace: how much the face in one image looks like the face in another (the studio's face match), and
where the largest face is (the face pass's mask).

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

from .assign import assign

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


REFS = 4  # people with a face photo in one picture, at most


class StudioFaceMask:
    """A face's box, grown by `grow` of its size on each side, as a mask; empty when there is none. With `slot` -1 the
    largest face. Otherwise the face of person `slot` of `people` (a JSON list of where each stands: "left", "center",
    "right" or ""), each person's face photo as `ref_<n>` when they have one (assign.py)."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"image": ("IMAGE",), "grow": ("FLOAT", {"default": 0.15, "min": 0.0, "max": 1.0, "step": 0.05})},
            "optional": {"slot": ("INT", {"default": -1, "min": -1, "max": REFS - 1}), "people": ("STRING", {"default": ""}),
                         **{f"ref_{n}": ("IMAGE",) for n in range(REFS)}},
        }

    RETURN_TYPES = ("MASK",)
    FUNCTION = "find"
    CATEGORY = "mask"

    def find(self, image, grow, slot=-1, people="", **refs):
        h, w = image.shape[1], image.shape[2]
        mask = torch.zeros((1, h, w), dtype=torch.float32)
        face = _largest(image) if slot < 0 else self._of(image, slot, json.loads(people or "[]"), refs)
        if face is not None:
            x0, y0, x1, y1 = face.bbox
            dx, dy = (x1 - x0) * grow, (y1 - y0) * grow
            mask[0, max(0, int(y0 - dy)):min(h, int(y1 + dy)), max(0, int(x0 - dx)):min(w, int(x1 + dx))] = 1.0
        return (mask,)

    @staticmethod
    def _of(image, slot: int, sides: list[str], refs: dict):
        faces = _all(image)
        photos = [refs.get(f"ref_{n}") for n in range(len(sides))]
        people = [(side, None if photo is None else _embedding(photo)) for side, photo in zip(sides, photos)]
        pick = assign([((f.bbox[0] + f.bbox[2]) / 2, f.normed_embedding) for f in faces], people)
        return None if slot >= len(pick) or pick[slot] is None else faces[pick[slot]]


NODE_CLASS_MAPPINGS = {"StudioFaceScore": StudioFaceScore, "StudioFaceMask": StudioFaceMask}
