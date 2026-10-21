"""An image that arrives inside the prompt, base64 encoded, for the studio's upscales.

LoadImage reads from the input folder, which is the io volume, and the studio keeps its runs off
that volume (see Worker.run). The phone already holds the image, so it sends it along with the
graph: nothing is written to disk, and the image is gone with the prompt.
"""
import base64
import io

import numpy as np
import torch
from PIL import Image, ImageOps


class StudioImageBase64:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"data": ("STRING", {"multiline": False})}}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "load"
    CATEGORY = "image"

    def load(self, data: str):
        img = ImageOps.exif_transpose(Image.open(io.BytesIO(base64.b64decode(data)))).convert("RGB")
        return (torch.from_numpy(np.asarray(img).astype(np.float32) / 255.0)[None],)


NODE_CLASS_MAPPINGS = {"StudioImageBase64": StudioImageBase64}
