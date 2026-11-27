"""comfy_modal/studio_api.py's gate: the cookie is a derived token, and only this origin may change state (S1, S7)."""
import hashlib
import hmac
import os
import sys
from unittest import mock

from fastapi.testclient import TestClient

with mock.patch.dict(os.environ, {"COMFY_ACCESS_KEY": "test-key-0123456789abcdef"}):
    sys.modules.pop("comfy_modal.studio_api", None)
    from comfy_modal import studio_api

KEY = studio_api.KEY
SELF = "http://testserver"  # TestClient's Host
EVIL = {"Origin": "https://evil--x.modal.run", "Sec-Fetch-Site": "same-site"}


def client(signed_in=True) -> TestClient:
    c = TestClient(studio_api.api, base_url=SELF)
    if signed_in:
        c.cookies.set(studio_api.COOKIE, studio_api.TOKEN)
    return c


def test_login_sets_a_derived_token_not_the_key():
    r = client(False).post("/api/login", json={"key": KEY}, headers={"Origin": SELF})
    assert r.status_code == 200
    cookie = r.headers["set-cookie"]
    assert cookie.startswith("__Host-studio_key=") and KEY not in cookie
    assert "Path=/" in cookie and "Secure" in cookie and "Domain" not in cookie
    assert studio_api.TOKEN == hmac.new(KEY.encode(), b"studio-v1", hashlib.sha256).hexdigest()


def test_wrong_key_and_text_plain_login_are_refused():
    assert client(False).post("/api/login", json={"key": "nope"}).status_code == 401
    r = client(False).post("/api/login", content=f'{{"key":"{KEY}"}}', headers={"Content-Type": "text/plain"})
    assert r.status_code == 415


def test_raw_key_or_old_cookie_does_not_unlock():
    c = client(False)
    c.cookies.set(studio_api.COOKIE, KEY)
    assert c.get("/api/transport").status_code == 401
    c = client(False)
    c.cookies.set("studio_key", KEY)
    assert c.get("/api/transport").status_code == 401
    assert client().get("/api/transport").status_code == 200


def test_another_origin_cannot_post_even_with_the_cookie():
    c = client()
    assert c.post("/api/gpu/wake", headers=EVIL).status_code == 403
    assert c.post("/api/gpu/stop?force=true", headers=EVIL).status_code == 403
    assert c.post("/api/generate", content="{}", headers={**EVIL, "Content-Type": "text/plain"}).status_code == 403
    assert c.post("/api/gpu/wake", headers={"Sec-Fetch-Site": "same-site"}).status_code == 403
    assert c.delete("/api/jobs/x", headers=EVIL).status_code == 403
    assert c.post("/api/gpu/wake", headers={"Origin": "null"}).status_code == 403
    assert c.post("/api/gpu/wake", headers={**EVIL, "X-Forwarded-Host": "evil--x.modal.run"}).status_code == 403


def test_this_origin_may_post_but_json_must_be_json():
    c = client()
    assert c.post("/api/gpu/stop-after", headers={"Origin": SELF}).status_code == 200
    assert c.post("/api/gpu/stop-after", headers={"Sec-Fetch-Site": "same-origin"}).status_code == 200
    assert c.get("/api/transport", headers=EVIL).status_code == 200  # reading is not refused; CORS keeps the answer from them
    r = c.post("/api/generate", content="{}", headers={"Origin": SELF, "Content-Type": "text/plain"})
    assert r.status_code == 415


def test_the_old_raw_key_cookie_is_cleared():
    c = client(False)
    c.cookies.set("studio_key", KEY)
    r = c.get("/api/transport")
    assert r.status_code == 401 and 'studio_key=""' in r.headers["set-cookie"]


def test_security_headers_on_every_response():
    for r in (client(False).get("/api/transport"), client().get("/api/transport"), client().post("/api/gpu/wake", headers=EVIL)):
        csp = r.headers["content-security-policy"]
        assert "frame-ancestors 'none'" in csp and "script-src 'self'" in csp
        assert r.headers["x-content-type-options"] == "nosniff" and "max-age" in r.headers["strict-transport-security"]
