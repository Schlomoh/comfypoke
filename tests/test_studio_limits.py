"""comfy_modal/studio_api.py: bodies, jobs and the image cache stay inside the one container's memory, bad input is a
400 rather than a 500, and no key means no API (security review S6, S9, S10, S15)."""
import asyncio
from unittest import mock

import pytest
from fastapi import HTTPException

from tests.test_studio_gate import SELF, client, studio_api

GOOD = {"unet": "z_image_turbo_bf16.safetensors", "prompt": "a cat"}


def test_login_refuses_a_large_body_and_anything_but_an_object():
    c = client(False)
    r = c.post("/api/login", content=b"{}", headers={"Content-Type": "application/json", "Content-Length": str(2**30)})
    assert r.status_code == 413
    assert c.post("/api/login", content=b'{"key":"' + b"x" * 5000 + b'"}', headers={"Content-Type": "application/json"}).status_code == 413
    for body in ("[]", '"key"', "null", "nope"):
        assert c.post("/api/login", content=body, headers={"Content-Type": "application/json"}).status_code == 400, body


def test_any_api_body_over_the_cap_is_refused_before_it_is_read():
    r = client().post("/api/generate", content=b"{}", headers={"Content-Type": "application/json", "Content-Length": str(2**31)})
    assert r.status_code == 413


def test_an_image_upload_over_its_cap_is_refused():
    r = client().post("/api/images", content=b"x", headers={"Content-Length": str(studio_api.MAX_IMAGE)})
    assert r.status_code == 413


def test_no_key_means_no_api():
    with mock.patch.object(studio_api, "KEY", ""):
        assert client().get("/api/transport").status_code == 503
        assert client(False).post("/api/login", json={"key": ""}).status_code == 503


@pytest.mark.parametrize("bad", [
    {"seed": "x"}, {"seed": "9" * 5000}, {"seed": -1}, {"seed": 2**53}, {"seed": 1.5}, {"seed": True}, {"seed": [1]},
    {"seed": float("inf")}, {"steps": float("inf")}, {"prompt": "a" * 4001}, {"negative": "a" * 4001, "cfg": 4},
    {"loras": [{"name": "../x.safetensors", "strength": 1}]}, {"loras": [{"name": "a\\b.safetensors", "strength": 1}]},
    {"loras": [{"name": ".hidden", "strength": 1}]},
])
def test_bad_render_input_is_a_400(bad):
    with pytest.raises(HTTPException) as e:
        studio_api._params({**GOOD, **bad})
    assert e.value.status_code == 400


def test_good_render_input_passes():
    p = studio_api._params({**GOOD, "seed": 2**53 - 1, "loras": [{"name": "a.safetensors", "strength": 1}]})
    assert p["seed"] == 2**53 - 1 and 0 <= studio_api._params(GOOD)["seed"] < 2**53


def test_only_the_latest_preview_is_kept():
    async def main():
        job = studio_api.Job({})
        job.emit("queued", {})
        for frame in ("a" * 100, "b" * 100, "c" * 100):
            job.emit("preview", frame)
        job.emit("image", "d" * 10)
        assert [d for n, d in job.events if n == "preview"] == [None, None, "c" * 100]
        assert job.bytes == 110
    asyncio.run(main())


def test_ended_jobs_go_oldest_first_past_the_memory_budget():
    async def main():
        old, new, running = (studio_api.Job({}) for _ in range(3))
        for j, at in ((old, 1.0), (new, 2.0)):
            j.end("done", "x" * 2**20)
            j.ended = at + 1e12  # not past the TTL
        running.emit("image", "x" * 2**20)
        with mock.patch.dict(studio_api.jobs, {j.id: j for j in (old, new, running)}, clear=True), \
                mock.patch.object(studio_api.config, "STUDIO_JOB_MEMORY_MB", 2):
            studio_api._purge()
            assert set(studio_api.jobs) == {new.id, running.id}
    asyncio.run(main())


def test_more_jobs_than_the_cap_get_a_429():
    async def main():
        busy = {str(i): studio_api.Job({}) for i in range(studio_api.config.STUDIO_MAX_JOBS)}
        with mock.patch.dict(studio_api.jobs, busy, clear=True), pytest.raises(HTTPException) as e:
            studio_api._start({"key": {"key": ""}}, {}, {})
        assert e.value.status_code == 429
    asyncio.run(main())


def test_the_image_cache_keeps_a_running_total():
    with mock.patch.object(studio_api, "IMAGE_CACHE", 100), mock.patch.dict(studio_api._images, clear=True), \
            mock.patch.dict(studio_api._cached, {"bytes": 0}):
        c = client()
        for i in range(3):
            assert c.post("/api/images", content=bytes([i]) * 60, headers={"Origin": SELF}).status_code == 200
        assert len(studio_api._images) == 1 and studio_api._cached["bytes"] == 80

