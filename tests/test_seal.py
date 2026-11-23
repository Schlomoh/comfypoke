"""comfy_modal/seal.py: what the worker opens and seals, and that it reads what WebCrypto writes (seal_vectors.json)."""
import base64
import json
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
    assert seal.open_(KEY, sealed[8:]) == b"png bytes"


def test_kid_is_stable_and_short():
    assert seal.kid(VECTORS["spki"]) == seal.kid(VECTORS["spki"])
    assert len(seal.kid(VECTORS["spki"])) == 16


def test_open_prompt_refuses_data_that_is_not_a_sealed_image():
    for data in ("not base64!", ["5", 0], None):
        with pytest.raises(seal.SealError):
            seal.open_prompt(KEY, {"1": {"class_type": seal.IMAGE_NODE, "inputs": {"data": data}}})


def test_stray_outputs_allow_only_the_websocket_save():
    outputs = {"SaveImageWebsocket", "SaveImage", "PreviewImage", "PreviewAny"}
    for name, g in samples().items():  # every studio graph passes
        assert seal.stray_outputs(g, outputs) == [], name
    g = {"1": {"class_type": "SaveImageWebsocket"}, "2": {"class_type": "SaveImage"}, "3": {"class_type": "PreviewImage"}}
    assert seal.stray_outputs(g, outputs) == ["PreviewImage", "SaveImage"]
