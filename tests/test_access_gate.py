"""comfy_nodes/access_key: the GUI's gate, against a stand-in for ComfyUI's server (S1, S7, S11, S18)."""
import asyncio
import base64

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

from tests import comfy_stub

KEY = "test-key-0123456789abcdef"
EVIL = {"Origin": "https://evil--x.modal.run", "Sec-Fetch-Site": "same-site"}

gate = comfy_stub.load("access_key", {"COMFY_ACCESS_KEY": KEY})


async def _ws(request):
    ws = web.WebSocketResponse()
    await ws.prepare(request)
    await ws.close()
    return ws


async def _ok(request):
    return web.json_response({"ok": True})


def run(check):
    async def main():
        app = web.Application(middlewares=[gate._gate])
        app.on_response_prepare.append(gate._headers)
        app.router.add_route("*", "/api/prompt", _ok)
        app.router.add_get("/ws", _ws)
        app.router.add_get("/", _ok)
        async with TestClient(TestServer(app)) as c:
            await check(c, f"http://{c.server.host}:{c.server.port}")
    asyncio.run(main())


def cookie():
    return {gate.COOKIE: gate.TOKEN}


def test_login_sets_a_host_prefixed_derived_token():
    async def check(c, origin):
        r = await c.post(gate.LOGIN_PATH, data={"key": KEY}, headers={"Origin": origin}, allow_redirects=False)
        assert r.status == 303
        header = r.headers.getall("Set-Cookie")
        mine = next(h for h in header if h.startswith("__Host-comfy_key="))
        assert KEY not in mine and gate.TOKEN in mine and "Path=/" in mine and "Secure" in mine and "Domain" not in mine
    run(check)


def test_the_old_raw_key_cookie_is_cleared_whatever_answers():
    async def check(c, origin):
        for r in (await c.get("/api/prompt", cookies={"comfy_key": KEY}),
                  await c.get("/api/prompt", cookies={**cookie(), "comfy_key": KEY}),
                  await c.post("/api/prompt", headers=EVIL, cookies={"comfy_key": KEY})):
            assert any(h.startswith("comfy_key=") and "Max-Age=0" in h for h in r.headers.getall("Set-Cookie")), r.status
    run(check)


def test_query_key_no_longer_signs_in():
    async def check(c, origin):
        r = await c.get(f"/?key={KEY}", headers={"Accept": "text/html"}, allow_redirects=False)
        assert r.status == 200 and "Set-Cookie" not in r.headers  # the login page: no cookie, and no redirect to go off-site by
        assert (await c.get(f"/api/prompt?key={KEY}")).status == 401
    run(check)


def test_raw_key_as_cookie_does_not_unlock():
    async def check(c, origin):
        assert (await c.get("/api/prompt", cookies={gate.COOKIE: KEY})).status == 401
        assert (await c.get("/api/prompt", cookies={"comfy_key": KEY})).status == 401
        assert (await c.get("/api/prompt", cookies=cookie())).status == 200
    run(check)


def test_another_origin_is_refused_even_signed_in():
    async def check(c, origin):
        r = await c.post("/api/prompt", data='{"prompt":{}}', headers={**EVIL, "Content-Type": "text/plain"}, cookies=cookie())
        assert r.status == 403
        r = await c.post("/api/prompt", headers={"Sec-Fetch-Site": "same-site"}, cookies=cookie())
        assert r.status == 403
        basic = "Basic " + base64.b64encode(f"x:{KEY}".encode()).decode()
        assert (await c.post("/api/prompt", headers={**EVIL, "Authorization": basic})).status == 403
        assert (await c.post("/api/prompt", headers={"Origin": "null"}, cookies=cookie())).status == 403
        r = await c.post("/api/prompt", headers={**EVIL, "Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate",
                                                 "Sec-Fetch-Dest": "document"}, cookies=cookie())
        assert r.status == 403  # the relabel of a cross-site navigation is for GET only
        r = await c.post("/api/prompt", headers={**EVIL, "X-Forwarded-Host": "evil--x.modal.run"}, cookies=cookie())
        assert r.status == 403
        r = await c.get("/ws", headers={**EVIL, "Connection": "Upgrade", "Upgrade": "websocket", "Sec-WebSocket-Version": "13",
                                        "Sec-WebSocket-Key": base64.b64encode(bytes(16)).decode()}, cookies=cookie())
        assert r.status == 403
    run(check)


def test_this_origin_and_tools_get_through():
    async def check(c, origin):
        assert (await c.post("/api/prompt", json={}, headers={"Origin": origin}, cookies=cookie())).status == 200
        async with c.ws_connect("/ws", headers={"Origin": origin, "Cookie": f"{gate.COOKIE}={gate.TOKEN}"}):
            pass
        basic = "Basic " + base64.b64encode(f"comfypoke:{KEY}".encode()).decode()
        assert (await c.post("/api/prompt", json={}, headers={"Authorization": basic})).status == 200  # no Origin: a tool
        r = await c.get("/", headers={"Sec-Fetch-Site": "cross-site", "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Dest": "document"}, cookies=cookie())
        assert r.status == 200  # a link from Modal's dashboard still opens the GUI
        r = await c.post(gate.LOGIN_PATH, data={"key": KEY}, headers={"Sec-Fetch-Site": "same-origin"}, allow_redirects=False)
        assert r.status == 303  # a form post that came without Origin
    run(check)


def test_every_response_refuses_framing():
    async def check(c, origin):
        for r in (await c.get("/api/prompt", cookies=cookie()), await c.get("/api/prompt"), await c.post("/api/prompt", headers=EVIL)):
            assert r.headers["X-Frame-Options"] == "SAMEORIGIN" and r.headers["X-Content-Type-Options"] == "nosniff"
            assert "frame-ancestors 'self'" in r.headers["Content-Security-Policy"]
    run(check)


def test_a_policy_of_comfyuis_own_keeps_its_rules():
    async def check(c, origin):
        r = web.Response()
        r.headers["Content-Security-Policy"] = "default-src 'none'"
        await gate._headers(None, r)
        assert r.headers["Content-Security-Policy"] == "default-src 'none'; frame-ancestors 'self'"
    run(check)


def test_the_gui_without_a_key_fails_closed():
    bare = comfy_stub.load("access_key", {"COMFY_ACCESS_KEY": "", "COMFY_RELAY": "1"})
    assert bare.PromptServer.instance.app.middlewares == [bare._no_key]
    worker = comfy_stub.load("access_key", {"COMFY_ACCESS_KEY": ""})  # the worker's ComfyUI, on localhost only
    assert worker.PromptServer.instance.app.middlewares == []
