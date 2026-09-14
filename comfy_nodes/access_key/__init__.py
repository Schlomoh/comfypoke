"""Gate the whole ComfyUI server behind a shared key.

Modal web endpoints are public URLs. The browser gets a Basic-auth dialog: any user name, the key
as the password (the password manager remembers it); on success a cookie is set and every later
request (including the websocket and the API) is checked against it. ?key=<key> in the URL still
works for tools. No key configured means no gate, so the container always starts.
"""
import base64
import os

from aiohttp import web
from server import PromptServer

KEY = os.environ.get("COMFY_ACCESS_KEY", "")
COOKIE = "comfy_key"


def _basic_password(request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        return ""
    try:
        return base64.b64decode(auth[6:]).decode().split(":", 1)[1]
    except Exception:
        return ""


def _set_cookie(resp):
    resp.set_cookie(COOKIE, KEY, httponly=True, secure=True, samesite="Lax", max_age=30 * 86400)
    return resp


@web.middleware
async def _gate(request, handler):
    if request.cookies.get(COOKIE) == KEY:
        return await handler(request)
    if request.query.get("key") == KEY:
        raise _set_cookie(web.HTTPFound(request.path))
    if _basic_password(request) == KEY:
        return _set_cookie(await handler(request))
    raise web.HTTPUnauthorized(text="missing or wrong key", headers={"WWW-Authenticate": 'Basic realm="comfy", charset="UTF-8"'})


if KEY:
    PromptServer.instance.app.middlewares.append(_gate)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
