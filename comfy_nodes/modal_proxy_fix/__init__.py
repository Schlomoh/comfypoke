"""Make ComfyUI work behind Modal's edge proxy: workflow load/save and websockets.

ComfyUI's frontend loads and saves workflows via /userdata/workflows%2Fname.json.
Modal's proxy decodes %2F to a real slash, so the path gains a segment and
ComfyUI's single-segment route no longer matches (404 on open, 405 on save).
This re-registers the userdata GET/POST/DELETE handlers with a slash-tolerant
pattern. ComfyUI's handlers still sandbox the path, so this cannot escape the
user directory. Route technique from caru-ini/modal-comfyui.
"""
from aiohttp import web
from server import PromptServer

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
NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
