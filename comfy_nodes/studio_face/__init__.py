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
import os

import numpy as np
import torch
import folder_paths
from server import PromptServer

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


def _largest(image):
    """The largest face in the first image of a batch, or None."""
    rgb = (image[0].cpu().numpy() * 255).clip(0, 255).astype(np.uint8)
    faces = _faces().get(np.ascontiguousarray(rgb[:, :, ::-1]))  # insightface reads BGR, as OpenCV does
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


class StudioFaceMask:
    """The largest face's box, grown by `grow` of its size on each side, as a mask; empty when there is no face."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"image": ("IMAGE",), "grow": ("FLOAT", {"default": 0.15, "min": 0.0, "max": 1.0, "step": 0.05})}}

    RETURN_TYPES = ("MASK",)
    FUNCTION = "find"
    CATEGORY = "mask"

    def find(self, image, grow):
        h, w = image.shape[1], image.shape[2]
        mask = torch.zeros((1, h, w), dtype=torch.float32)
        face = _largest(image)
        if face is not None:
            x0, y0, x1, y1 = face.bbox
            dx, dy = (x1 - x0) * grow, (y1 - y0) * grow
            mask[0, max(0, int(y0 - dy)):min(h, int(y1 + dy)), max(0, int(x0 - dx)):min(w, int(x1 + dx))] = 1.0
        return (mask,)


NODE_CLASS_MAPPINGS = {"StudioFaceScore": StudioFaceScore, "StudioFaceMask": StudioFaceMask}
