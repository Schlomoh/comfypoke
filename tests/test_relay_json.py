"""comfy_nodes/gpu_relay: a body that is not application/json is refused, and a POST with no body still gets through."""
import asyncio
import types

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from tests import comfy_stub

relay = comfy_stub.load("gpu_relay", {})


def run(check):
    interrupted = []

    async def interrupt(pid=None):
        interrupted.append(pid)

    relay._worker = lambda: types.SimpleNamespace(interrupt=types.SimpleNamespace(remote=types.SimpleNamespace(aio=interrupt)))

    async def main():
        app = web.Application(middlewares=[relay._relay_middleware])
        app.router.add_post("/gpu/keep_warm", relay.gpu_keep_warm)
        async with TestClient(TestServer(app)) as c:
            await check(c, interrupted)
    asyncio.run(main())


def test_text_plain_is_refused():
    async def check(c, interrupted):
        for path in ("/api/prompt", "/api/interrupt", "/api/queue", "/gpu/keep_warm"):
            r = await c.post(path, data='{"minutes": 1}', headers={"Content-Type": "text/plain"})
            assert r.status == 415, path
        assert interrupted == []
    run(check)


def test_no_body_and_json_get_through():
    async def check(c, interrupted):
        assert (await c.post("/api/interrupt")).status == 200
        assert (await c.post("/api/interrupt", json={"prompt_id": "p"})).status == 200
        assert interrupted == [None, "p"]
    run(check)


def test_keep_warm_takes_finite_minutes_up_to_the_cap():
    relay.KEEP_WARM_MAX = 120.0

    async def check(c, interrupted):
        for body in ('{"minutes": Infinity}', '{"minutes": NaN}', '{"minutes": 121}', '{"minutes": -1}', '{"minutes": "x"}', "[]"):
            r = await c.post("/gpu/keep_warm", data=body, headers={"Content-Type": "application/json"})
            assert r.status == 400, body
    run(check)
