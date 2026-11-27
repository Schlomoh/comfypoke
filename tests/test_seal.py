"""comfy_modal/seal.py: what the worker opens and seals, and that it reads what WebCrypto writes (seal_vectors.json)."""
import base64
import json
import re
import struct
from pathlib import Path

import pytest

from comfy_modal import seal
from tests.samples import samples

VECTORS = json.loads((Path(__file__).parent / "seal_vectors.json").read_text())
KEY = bytes(range(32))


def test_round_trip():
    data = b"\x89PNG\r\n\x1a\n" + bytes(1000)
    sealed = seal.seal(KEY, data)
    assert sealed != seal.seal(KEY, data)  # a new iv each time
    assert seal.open_(KEY, sealed) == data


def test_tampered_or_wrong_key_is_refused():
    sealed = bytearray(seal.seal(KEY, b"picture"))
    with pytest.raises(seal.SealError):
        seal.open_(bytes(32), bytes(sealed))
    sealed[-1] ^= 1
    with pytest.raises(seal.SealError):
        seal.open_(KEY, bytes(sealed))
    with pytest.raises(seal.SealError):
        seal.open_(KEY, b"short")


def test_opens_what_webcrypto_wrapped_and_sealed():
    key = seal.unwrap(seal.load_private(VECTORS["private"]), VECTORS["wrapped"])
    assert key == KEY
    assert seal.open_(key, base64.b64decode(VECTORS["webcrypto_sealed"])) == b"sealed by webcrypto"


def test_unwrap_refuses_another_keypair():
    other, _ = seal.mint()
    with pytest.raises(seal.SealError):
        seal.unwrap(seal.load_private(other), VECTORS["wrapped"])


def test_open_prompt_opens_image_nodes_only():
    picture = b"\x89PNG picture"
    prompt = {
        "1": {"class_type": seal.IMAGE_NODE, "inputs": {"data": base64.b64encode(seal.seal(KEY, picture)).decode()}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "a portrait"}},
    }
    opened = seal.open_prompt(KEY, prompt)
    assert base64.b64decode(opened["1"]["inputs"]["data"]) == picture
    assert opened["2"] == prompt["2"]
    assert prompt["1"]["inputs"]["data"] != opened["1"]["inputs"]["data"]  # the original is left as it came


def test_seal_frame_keeps_the_header_readable():
    frame = (1).to_bytes(4, "big") + (2).to_bytes(4, "big") + b"png bytes"
    sealed = seal.seal_frame(KEY, frame)
    assert sealed[:8] == frame[:8]
    assert seal.open_(KEY, sealed[8:], aad=frame[:8]) == b"png bytes"


def test_kid_is_stable_and_short():
    assert seal.kid(VECTORS["spki"]) == seal.kid(VECTORS["spki"])
    assert len(seal.kid(VECTORS["spki"])) == 16


def test_open_prompt_refuses_data_that_is_not_a_sealed_image():
    for data in ("not base64!", ["5", 0], None):
        with pytest.raises(seal.SealError):
            seal.open_prompt(KEY, {"1": {"class_type": seal.IMAGE_NODE, "inputs": {"data": data}}})


def test_keyed_graphs_may_hold_only_the_studios_node_classes():
    for name, g in samples().items():  # every studio graph passes
        assert seal.unlisted(g) == [], name
    added = set(re.findall(r'\.add\("(\w+)"', (Path(__file__).parents[1] / "comfy_modal" / "graphs.py").read_text()))
    assert added <= seal.SEALED_CLASSES, added - seal.SEALED_CLASSES  # graphs a sample may not reach yet
    g = {**samples()["render krea2"], "99": {"class_type": "ImageScale", "inputs": {}}}
    assert seal.unlisted(g) == ["ImageScale"]
    assert seal.unlisted({"1": {"class_type": "SaveImage"}, "2": {"class_type": "PreviewImage"}}) == ["PreviewImage", "SaveImage"]


def test_score_message_keeps_only_the_rounded_number():
    sent = {"prompt_id": "other", "score": 0.61234, "image": "aGVsbG8=", "extra": [1, 2]}
    assert seal.score_message("p1", sent) == {"type": "studio_face", "data": {"prompt_id": "p1", "score": 0.61}}
    for bad in ("0.5", True, 3.0, float("nan"), None, [0.5]):
        assert seal.score_message("p1", {"score": bad})["data"]["score"] is None, bad


def test_score_node_only_in_the_face_graphs_shape():
    assert seal.score_shape(samples()["face"]) is None
    assert seal.score_shape(samples()["render krea2"]) is None  # no score node: not this check's business
    img = {"class_type": "StudioImageBase64", "inputs": {"data": "x"}}
    score = {"class_type": "StudioFaceScore", "inputs": {"image": ["1", 0], "reference": ["2", 0]}}
    two = {"1": img, "2": img, "3": score, "4": {**score}}
    cropped = {"1": img, "2": img, "3": {"class_type": "ImageCrop", "inputs": {}}, "4": score}
    for g in (two, cropped):
        assert seal.score_shape(g), g



def test_frames_are_sealed_with_their_header_as_associated_data():
    header = struct.pack(">II", 1, 2)
    sealed = seal.seal_frame(KEY, header + b"png")
    assert sealed[:8] == header and seal.open_(KEY, sealed[8:], aad=header) == b"png"
    for wrong in (struct.pack(">II", 1, 1), None):  # a PNG passed off as a preview, or opened without its header
        with pytest.raises(seal.SealError):
            seal.open_(KEY, sealed[8:], aad=wrong)


def test_opens_a_frame_webcrypto_sealed():
    preview = struct.pack(">II", 1, 1)
    assert seal.open_(KEY, base64.b64decode(VECTORS["webcrypto_frame_preview"]), aad=preview) == b"preview framed by webcrypto"
