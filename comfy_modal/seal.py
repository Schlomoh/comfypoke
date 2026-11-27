"""The studio's images cross Modal encrypted, readable only on the phone and inside the GPU worker.

The phone sends a 256-bit AES key wrapped with the worker's RSA-OAEP public key (SHA-256), which each deploy mints
on the laptop: the private half goes to the Worker's Secret only, the public half to the studio, which hands it to
the phone. The worker unwraps it, opens the prompt's images before ComfyUI sees them and seals every image frame
before it leaves (Worker.run), so the studio, Modal's edge and Modal's stored call payloads carry ciphertext only.
Images are AES-256-GCM, iv (12 bytes) then ciphertext and tag, as WebCrypto writes them (studio/src/data/crypto.ts).
The phone derives the key from its workspace key and this deploy's key id, so an old deploy's private key opens
nothing sent after it.

What it does not keep out: Modal itself, which stores the Worker's Secret and runs its memory, and whoever deploys,
since the studio serves the phone's JavaScript.

`cryptography` is imported inside the functions: the studio's image does not have it, and needs none of them.
"""
import base64
import functools
import hashlib
import os

import modal

from . import config

IV = 12
IMAGE_NODE = "StudioImageBase64"  # comfy_nodes/studio_image: the only node that carries an image in the prompt
OUTPUT_NODE = "SaveImageWebsocket"  # the only image output a sealed run may have: its frames are sealed on the way out
SCORE_NODE = "StudioFaceScore"  # comfy_nodes/studio_face: outputs one number, as a message rebuilt by score_message
SCORE_MESSAGE = "studio_face"
# Every node class comfy_modal/graphs.py can emit, and no other: whoever sends a keyed prompt chooses the graph, and any
# node it runs sees the opened images. A new node in a studio graph is added here on purpose (tests/test_seal.py).
SEALED_CLASSES = frozenset({
    "CLIPLoader", "CLIPTextEncode", "CheckpointLoaderSimple", "ConditioningZeroOut", "EmptyLatentImage",
    "EmptySD3LatentImage", "GrowMask", "ImageCompositeMasked", "ImageScaleToTotalPixels", "ImageToMask",
    "InpaintCropImproved", "InpaintStitchImproved", "KSampler", "Krea2EditGroundedEncode", "Krea2EditModelPatch",
    "LoraLoaderModelOnly", "MaskComposite", "MaskToImage", "ModelPatchLoader", "ModelSamplingAuraFlow", "RTDETR_detect",
    "SAM3DBody_Loader", "SAM3DBody_Predict", "SAM3DBody_Render", "SAM3_Detect", "SeedVR2Conditioning",
    "SeedVR2PostProcessing", "SeedVR2Preprocess", "SetLatentNoiseMask", "StudioFaceLabels", "StudioFaceMask",
    "StudioHeadMask", "StudioMaskStrip", "StudioPersonBox", "UNETLoader", "UnetLoaderGGUF", "VAEDecode",
    "VAEDecodeTiled", "VAEEncode", "VAEEncodeTiled", "VAELoader", "ZImageFunControlnet",
    IMAGE_NODE, OUTPUT_NODE, SCORE_NODE,
})


class SealError(ValueError):
    """A key or an image that does not open: tampered with, or sealed for another key."""


def mint() -> tuple[str, str]:
    """A new keypair as (private, public), base64 DER."""
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
    private = key.private_bytes(serialization.Encoding.DER, serialization.PrivateFormat.PKCS8, serialization.NoEncryption())
    public = key.public_key().public_bytes(serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)
    return base64.b64encode(private).decode(), base64.b64encode(public).decode()


@functools.cache
def deploy_keys() -> tuple[str, str]:
    """This deploy's keypair: minted once per process on the laptop, like config.DEPLOY_ID; in a container, what the
    Secret carried in (each class gets only its own half, the other is ""). A `modal serve` mints its own pair."""
    if modal.is_local():
        return mint()
    return os.environ.get(config.TRANSPORT_PRIVATE_ENV, ""), os.environ.get(config.TRANSPORT_PUBLIC_ENV, "")


def kid(public: str) -> str:
    """A short id for a public key: the phone sends it with the wrapped key, so a key wrapped for an older deploy is
    refused by the studio (and the phone fetches the new one) instead of failing on the GPU."""
    return hashlib.sha256(base64.b64decode(public)).hexdigest()[:16]


def load_private(private: str):
    from cryptography.hazmat.primitives import serialization

    return serialization.load_der_private_key(base64.b64decode(private), password=None)


def unwrap(private_key, wrapped: str) -> bytes:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.asymmetric import padding

    try:
        key = private_key.decrypt(base64.b64decode(wrapped), padding.OAEP(mgf=padding.MGF1(hashes.SHA256()), algorithm=hashes.SHA256(), label=None))
    except ValueError as e:
        raise SealError("the image key was not wrapped for this deploy") from e
    if len(key) != 32:
        raise SealError("the image key is not 256 bits")
    return key


def seal(key: bytes, data: bytes, aad: bytes | None = None) -> bytes:
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    iv = os.urandom(IV)
    return iv + AESGCM(key).encrypt(iv, data, aad)


def open_(key: bytes, data: bytes, aad: bytes | None = None) -> bytes:
    from cryptography.exceptions import InvalidTag
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM

    try:
        return AESGCM(key).decrypt(data[:IV], data[IV:], aad)
    except (InvalidTag, ValueError) as e:
        raise SealError("an image did not decrypt: sealed with another key, or damaged") from e


def _open_b64(key: bytes, data) -> str:
    if not isinstance(data, str):
        raise SealError("an image node's data is not a sealed image")
    try:
        raw = base64.b64decode(data, validate=True)
    except ValueError as e:
        raise SealError("an image node's data is not base64") from e
    return base64.b64encode(open_(key, raw)).decode()


def open_prompt(key: bytes, prompt: dict) -> dict:
    """The prompt with every image node's data opened, for ComfyUI on localhost; the original is left as it came."""
    return {nid: {**n, "inputs": {**n["inputs"], "data": _open_b64(key, n["inputs"].get("data"))}}
            if n.get("class_type") == IMAGE_NODE else n for nid, n in prompt.items()}


def unlisted(prompt: dict) -> list[str]:
    """The prompt's node classes that no studio graph uses (SEALED_CLASSES). A keyed run with any is refused
    (Worker.run): a node outside the studio's graphs could write an opened image to a file, a cache or the network."""
    return sorted({str(n.get("class_type")) for n in prompt.values()} - SEALED_CLASSES)


def score_shape(prompt: dict) -> str | None:
    """Why a sealed prompt with the score node is refused, or None. Its number is the one thing a sealed run sends in the
    clear, so it may only compare two images exactly as they came (graphs.face): with more score nodes, or crops and
    transforms before them, a graph could read an opened image out piece by piece, or match it against a gallery."""
    classes = [n.get("class_type") for n in prompt.values()]
    if SCORE_NODE not in classes:
        return None
    if classes.count(SCORE_NODE) != 1 or set(classes) != {SCORE_NODE, IMAGE_NODE} or len(classes) != 3:
        return f"a sealed run with {SCORE_NODE} may hold only it and its two {IMAGE_NODE} images"
    return None


def score_message(pid: str, data: dict) -> dict:
    """The face match's message as the worker passes it on, sealed run or not: the score, a number between -1 and 1 or
    None, and nothing else the node put in, so no part of an opened image can ride along."""
    score = data.get("score")
    ok = isinstance(score, (int, float)) and not isinstance(score, bool) and -1.0 <= score <= 1.0
    return {"type": SCORE_MESSAGE, "data": {"prompt_id": pid, "score": round(float(score), 2) if ok else None}}


def seal_frame(key: bytes, frame: bytes) -> bytes:
    """ComfyUI's binary websocket frame with its image sealed; the 8-byte header (event, format) stays readable for
    the studio, which tells previews from the PNG by it, and is the sealed image's associated data: the phone opens it
    as what the studio said it was (data/images.ts), so a preview cannot be passed off as the final image. It binds no
    job: the studio could still hand one job's image to another job of the same workspace and deploy."""
    return frame[:8] + seal(key, frame[8:], aad=frame[:8])
