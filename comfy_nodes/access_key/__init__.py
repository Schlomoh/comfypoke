"""Gate the whole ComfyUI server behind a shared key.

Modal web endpoints are public URLs, so the container needs its own gate. A browser that asks
for a page gets a small login form; anything else (the API, the websocket, curl) gets a 401
with a Basic-auth challenge, so tools can send the key in an Authorization header. Either way
a correct key sets a cookie and every later request is checked against it. The cookie holds a
token derived from the key, never the key itself, so it opens this GUI and nothing else (the
studio derives its own). No key configured means no gate, so the container always starts.

Every *.modal.run host is the same site as this one (modal.run is not on the Public Suffix
List), so SameSite cookies and ComfyUI's Sec-Fetch-Site check do not stop another Modal app's
page from posting here or opening the websocket with the owner's cookie. _cross_origin closes
that: anything that can change state, and every websocket, must come from this origin. The
__Host- prefix keeps those other hosts from planting or shadowing the cookie.

The form exists because browsers do not reliably show the Basic-auth dialog for this response:
Chrome and Safari both render the 401 body instead, which left a new user staring at the words
"missing or wrong key" with nothing to type them into. It is served as 200 rather than 401
because filtering software reads a 401 page asking for a secret on a random cloud subdomain as
phishing; NordVPN's Threat Protection answered it with a 403 of its own.
"""
import base64
import hashlib
import hmac
import os
from urllib.parse import urlsplit

from aiohttp import web
from server import PromptServer

KEY = os.environ.get("COMFY_ACCESS_KEY", "")
TOKEN = hmac.new(KEY.encode(), b"gui-v1", hashlib.sha256).hexdigest()
COOKIE = "__Host-comfy_key"
OLD_COOKIE = "comfy_key"  # held the raw key before the rename; cleared at the next sign-in
SAFE_METHODS = ("GET", "HEAD", "OPTIONS")
LOGIN_PATH = "/comfypoke-login"

PAGE = """<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>comfypoke, a self-hosted ComfyUI</title>
<meta name="description" content="Sign-in for a private comfypoke deployment: ComfyUI running on its
 owner's own Modal account. Open source, MIT licensed, github.com/Schlomoh/comfypoke">
<meta name="robots" content="noindex,nofollow">
<style>
 :root{color-scheme:dark}
 body{margin:0;min-height:100vh;display:grid;place-items:center;background:#1a1a1a;color:#e8e8e8;
      font:15px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
 main{width:min(92vw,25rem);display:flex;flex-direction:column;gap:1rem}
 h1{margin:0;font-size:1.25rem;font-weight:600}
 p{margin:0;color:#9a9a9a;font-size:.875rem}
 form{display:flex;flex-direction:column;gap:.75rem}
 input{padding:.6rem .7rem;border:1px solid #3a3a3a;border-radius:6px;background:#242424;color:inherit;font:inherit}
 input:focus{outline:2px solid #4a8;outline-offset:1px;border-color:transparent}
 button{padding:.6rem;border:0;border-radius:6px;background:#4a8;color:#08110d;font:600 inherit;cursor:pointer}
 button:hover{background:#5cb995}
 .bad{color:#e88;font-size:.875rem}
 code{background:#242424;padding:.1rem .3rem;border-radius:3px;font-size:.85em}
 a{color:#7cc;text-decoration:none}
 a:hover{text-decoration:underline}
 footer{color:#6a6a6a;font-size:.8125rem;border-top:1px solid #2c2c2c;padding-top:.75rem}
</style></head><body>
<main>
  <h1>comfypoke</h1>
  <p>This is a private <strong>ComfyUI</strong> instance running on its owner's own
     <a href="https://modal.com" rel="noopener">Modal</a> account. It is not a service, a store
     or a sign-up, and it asks for one key that only its owner has.</p>
  <form method="post" action="%(action)s">
    <input type="text" name="username" autocomplete="username" value="comfypoke" hidden readonly>
    <input type="password" name="key" autocomplete="current-password" placeholder="access key" autofocus required>
    <button type="submit">Unlock</button>
    %(error)s
  </form>
  <p>The key is the contents of <code>.access_key</code> in the repo you deployed from.</p>
  <footer>comfypoke is open source, MIT licensed:
    <a href="https://github.com/Schlomoh/comfypoke" rel="noopener">github.com/Schlomoh/comfypoke</a>
  </footer>
</main></body></html>"""


def _page(error: str = "") -> str:
    return PAGE % {"action": LOGIN_PATH, "error": f'<p class="bad">{error}</p>' if error else ""}


def _basic_password(request) -> str:
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Basic "):
        return ""
    try:
        return base64.b64decode(auth[6:]).decode().split(":", 1)[1]
    except Exception:
        return ""


def _is_key(value: str) -> bool:
    return hmac.compare_digest(value.encode(), KEY.encode())


def _set_cookie(resp):
    # __Host- requires Secure, Path=/ and no Domain. Lax, not Strict, so a link from Modal's
    # dashboard arrives signed in; the origin check below is what stops forged requests.
    if not resp.prepared:  # a websocket's handshake has gone out by the time its handler returns
        resp.set_cookie(COOKIE, TOKEN, path="/", httponly=True, secure=True, samesite="Lax", max_age=30 * 86400)
    return resp


def _cross_origin(request) -> bool:
    """A state-changing request or a websocket that did not come from a page on this origin.
    Browsers send Origin on every POST and every websocket handshake. Without one, Sec-Fetch-Site
    must say same-origin or none (typed in the address bar). A client sending neither is not a
    browser, so it cannot be riding the owner's cookie, and tools still get through."""
    upgrade = request.headers.get("Upgrade", "").lower() == "websocket"
    if request.method in SAFE_METHODS and not upgrade:
        return False
    origin = request.headers.get("Origin")
    if origin is None:
        return request.headers.get("Sec-Fetch-Site", "same-origin") not in ("same-origin", "none")
    return urlsplit(origin).netloc != request.headers.get("Host")


def _wants_html(request) -> bool:
    """A browser navigating to a page, as opposed to the API, the websocket or a tool."""
    return "text/html" in request.headers.get("Accept", "") and request.headers.get("Upgrade", "").lower() != "websocket"


def _login_page(error: str = ""):
    """200, not 401. The page is meant to be read and typed into, and a 401 body is the shape
    security filters treat as a credential-phishing attempt: NordVPN's Threat Protection
    replaced this very response with its own 403. Tools still get a real 401 below."""
    return web.Response(text=_page(error), content_type="text/html")


def _is_plain_navigation(request) -> bool:
    """A person clicking a link to this page: a top-level GET of a document."""
    return (request.method in ("GET", "HEAD")
            and request.headers.get("Sec-Fetch-Mode") == "navigate"
            and request.headers.get("Sec-Fetch-Dest") == "document")


@web.middleware
async def _gate(request, handler):
    """_check, and the cookie that held the raw key before the rename is cleared on whatever answers a browser that
    still sends it, signed in or not."""
    old = OLD_COOKIE in request.cookies
    try:
        resp = await _check(request, handler)
    except web.HTTPException as e:
        if old:
            e.del_cookie(OLD_COOKIE)
        raise
    if old and not resp.prepared:
        resp.del_cookie(OLD_COOKIE)
    return resp


async def _check(request, handler):
    # ComfyUI's own origin_only_middleware (server.py) answers anything carrying
    # Sec-Fetch-Site: cross-site with an empty 403. That includes every click on the deployment
    # link from Modal's dashboard, which is how people actually open this, and the empty body
    # makes it look like the app is broken. A top-level GET navigation cannot change state and
    # carries no credentials the browser would not send anyway, so relabel that one case before
    # ComfyUI sees it. Anything else cross-site still gets ComfyUI's 403.
    if request.headers.get("Sec-Fetch-Site") == "cross-site" and _is_plain_navigation(request):
        headers = request.headers.copy()
        headers["Sec-Fetch-Site"] = "same-origin"
        request = request.clone(headers=headers)

    if _cross_origin(request):
        raise web.HTTPForbidden(text="cross-origin request refused")

    if request.path == LOGIN_PATH:  # the form posts here, so it cannot itself be gated
        if request.method != "POST":
            return web.HTTPFound("/")
        data = await request.post()
        if _is_key(str(data.get("key", ""))):
            return _set_cookie(web.HTTPSeeOther("/"))  # 303, so the browser follows it with GET
        return _login_page("That key is not right.")

    if hmac.compare_digest(request.cookies.get(COOKIE, "").encode(), TOKEN.encode()):
        return await handler(request)
    if _is_key(_basic_password(request)):
        return _set_cookie(await handler(request))
    if _wants_html(request):
        return _login_page()
    raise web.HTTPUnauthorized(text="missing or wrong key", headers={"WWW-Authenticate": 'Basic realm="comfy", charset="UTF-8"'})


# ComfyUI's frontend needs inline script, so a full Content-Security-Policy is its own project. These stop the GUI
# from being framed by another page (clickjacking) and the browser from guessing content types.
# A policy ComfyUI sets itself (on /view, say) is kept, with frame-ancestors added to it.
async def _headers(request, response):
    h = response.headers
    h.setdefault("X-Frame-Options", "DENY")
    h.setdefault("X-Content-Type-Options", "nosniff")
    csp = h.get("Content-Security-Policy")
    if csp is None:
        h["Content-Security-Policy"] = "frame-ancestors 'none'"
    elif "frame-ancestors" not in csp:
        h["Content-Security-Policy"] = csp.rstrip("; ") + "; frame-ancestors 'none'"


PromptServer.instance.app.on_response_prepare.append(_headers)  # every response, the websocket's and errors included

if KEY:
    # First in the list, so it runs outside ComfyUI's origin_only_middleware: the relabel above
    # has to happen before that middleware reads the header, and checking the key first is right
    # anyway. Appending put us after it, which is how the cross-site 403 got through.
    PromptServer.instance.app.middlewares.insert(0, _gate)

NODE_CLASS_MAPPINGS = {}
NODE_DISPLAY_NAME_MAPPINGS = {}
