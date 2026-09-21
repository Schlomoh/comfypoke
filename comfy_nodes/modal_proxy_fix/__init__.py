"""Make ComfyUI work behind Modal's edge proxy: workflow load/save, websockets, asset caching.

ComfyUI's frontend loads and saves workflows via /userdata/workflows%2Fname.json.
Modal's proxy decodes %2F to a real slash, so the path gains a segment and
ComfyUI's single-segment route no longer matches (404 on open, 405 on save).
This re-registers the userdata GET/POST/DELETE handlers with a slash-tolerant
pattern. ComfyUI's handlers still sandbox the path, so this cannot escape the
user directory. Route technique from caru-ini/modal-comfyui.
"""
import re

from aiohttp import web
from server import PromptServer

# ComfyUI answers every .js and .css with Cache-Control: no-store (middleware/cache_middleware.py).
# On localhost that costs nothing. Here the frontend is about two hundred separate chunks and each
# one is a round trip to a container that may be on another continent, so no-store means several
# megabytes and the better part of a minute on every single page load, with the spinner up the
# whole time. The names are content hashed (GraphView-DrI6fzMv.js), so a changed file is a changed
# URL and caching one forever is safe: a new frontend version simply asks for different names.
_HASHED = re.compile(r"-[A-Za-z0-9_-]{8,}\.(js|css)$")


@web.middleware
async def _cache_hashed_assets(request, handler):
    response = await handler(request)
    if request.method in ("GET", "HEAD") and response.status == 200 and _HASHED.search(request.path):
        response.headers["Cache-Control"] = "public, max-age=31536000, immutable"
    return response


# Modal's proxy drops websocket frames that use permessage-deflate: the
# connection opens and is closed with code 1000 before the first message.
# Browsers always offer the extension, so refuse it server-side.
_orig_ws_init = web.WebSocketResponse.__init__


def _ws_init(self, *args, **kwargs):
    kwargs["compress"] = False
    _orig_ws_init(self, *args, **kwargs)


web.WebSocketResponse.__init__ = _ws_init

_orig_add_routes = PromptServer.add_routes


def _add_routes(self):
    result = _orig_add_routes(self)
    extra = []
    for route in self.app.router.routes():
        res = route.resource
        if res is None or route.method not in ("GET", "POST", "DELETE"):
            continue
        if res.canonical.endswith("/userdata/{file}"):
            extra.append((route.method, res.canonical[: -len("{file}")] + "{file:.+}", route.handler))
    for method, path, handler in extra:
        self.app.router.add_route(method, path, handler)
    return result


PromptServer.add_routes = _add_routes

# After the access gate, which has to stay outermost, but outside ComfyUI's own cache_control:
# that one uses setdefault, so the header has to be replaced on the way out, not set on the way in.
PromptServer.instance.app.middlewares.insert(1, _cache_hashed_assets)
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
