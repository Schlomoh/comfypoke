"""Every studio graph, built with typical inputs: what tests/test_graphs.py checks against ComfyUI's node
definitions, and what tools/object_info_snapshot.py reads the node classes from."""
import base64
import io
import struct
import zlib

from comfy_modal import graphs


def _png(w: int = 8, h: int = 8) -> str:
    raw = b"".join(b"\x00" + b"\x80" * (w * 3) for _ in range(h))
    chunk = lambda kind, data: struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))  # noqa: E731
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")
    return base64.b64encode(png).decode()


IMG = _png()
LORAS = [("some_lora.safetensors", 0.8)]


def _pass(family: str, unet: str, **more) -> dict:
    return {"family": family, "unet": unet, "text": "a red coat", "negative": "blurry", "steps": 8, "cfg": 1.0, "loras": LORAS, **more}


def samples() -> dict[str, dict]:
    krea = _pass("krea2", "krea2_turbo_bf16.safetensors")
    raw = _pass("krea2", "krea2_raw_bf16.safetensors", cfg=3.5)  # a real negative prompt
    zimage = {"unet": "z_image_turbo_bf16.safetensors", "steps": 8, "cfg": 1.0, "loras": LORAS}
    return {
        "render krea2": graphs.graph("krea2", "krea2_turbo_bf16.safetensors", "a cat", "", 512, 768, 1, 8, 1.0, LORAS),
        "render krea2 cfg": graphs.graph("krea2", "krea2_raw_bf16.safetensors", "a cat", "blurry", 512, 768, 1, 30, 3.5, []),
        "render zimage": graphs.graph("zimage", "z_image_turbo_bf16.safetensors", "a cat", "", 512, 768, 1, 8, 1.0, LORAS),
        "render gguf": graphs.graph("krea2", "krea2_turbo_Q8_0.gguf", "a cat", "", 512, 768, 1, 8, 1.0, []),
        "render finish face": graphs.graph("zimage", "z_image_turbo_bf16.safetensors", "a cat", "", 512, 768, 1, 8, 1.0, [], IMG,
                                           {**krea, "denoise": 0.35}),
        "render face pass": graphs.graph("zimage", "z_image_turbo_bf16.safetensors", "a cat", "", 512, 768, 1, 8, 1.0, LORAS,
                                         face_pass=0.35),
        "render finish face pass": graphs.graph("zimage", "z_image_turbo_bf16.safetensors", "a cat", "", 512, 768, 1, 8, 1.0, [],
                                                finish={**raw, "denoise": 0.35}, face_pass=0.35),
        "render face pass two people": graphs.graph("zimage", "z_image_turbo_bf16.safetensors", "two women", "", 512, 768, 1, 8, 1.0,
                                                    LORAS, face_pass=0.35, face_people=[
                                                        {"text": "Mia.", "side": "left", "loras": LORAS, "face": IMG},
                                                        {"text": "Jen.", "side": "", "loras": [], "face": None}]),
        "render face": graphs.graph("krea2", "krea2_turbo_bf16.safetensors", "a cat", "", 512, 768, 1, 8, 1.0, LORAS, face=IMG),
        "upscale": graphs.upscale(IMG, 4, 1),
        "upscale retouch": graphs.upscale(IMG, 4, 1, {**raw, "denoise": 0.3}),
        "inpaint": graphs.inpaint(IMG, IMG, krea, 1),
        "inpaint face": graphs.inpaint(IMG, IMG, krea, 1, IMG),
        "faces": graphs.faces(IMG, [{"side": "left", "face": IMG}, {"side": "right", "face": None}]),
        "people dress and faces": graphs.people(IMG, [
            {"box": "1,1,4,4", "text": "Mia.", "loras": LORAS, "outfit": "a red dress", "part": "shirt, pants", "redraw": True},
            {"box": "5,1,7,4", "text": "Jen.", "loras": [], "outfit": "a coat", "part": "shirt, pants", "redraw": True},
            {"box": "2,5,3,7", "text": "Ann.", "loras": [], "outfit": None, "part": "", "redraw": False}],
            1, {"hold": "tight", "dresser": zimage, "finish": {**krea, "denoise": 0.35}}, {**krea, "denoise": 0.35}),
        "people no face over their mask": graphs.people(IMG, [{"box": None, "text": "", "loras": [], "outfit": "a coat", "part": "",
                                                              "mask": IMG, "redraw": False}], 1,
                                                      {"hold": "off", "dresser": zimage, "finish": None}, None),
        "areas": graphs.areas(IMG, [{"box": "1,1,4,4", "part": "shirt, pants"}, {"box": None, "part": "shoes"}]),
        "people faces only": graphs.people(IMG, [{"box": "1,1,4,4", "text": "Mia.", "loras": [], "outfit": None, "part": "",
                                                  "redraw": True}], 1, None, {**zimage, "family": "zimage", "negative": "", "denoise": 0.3}),
        "mask": graphs.mask(IMG, "shirt"),
        "mask taps": graphs.mask(IMG, points={"positive": [{"x": 10, "y": 20}], "negative": [{"x": 3, "y": 4}]}),
        "mask text and taps": graphs.mask(IMG, "shoe", {"positive": [{"x": 10, "y": 20}]}),
        "body": graphs.body(IMG),
        "face": graphs.face(IMG, IMG),
    }
