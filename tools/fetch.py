"""Download a model into the models volume from Modal's side (comfy_modal/fetch.py): the file goes from Civitai or
Hugging Face to the volume directly, not through this laptop.

The token never leaves this laptop. It is sent, as a header, only to its own host (config.TOKEN_HOSTS, https only),
and only to ask where the file is: both hosts answer with a redirect to a signed, short-lived URL on their CDN, for
that one file. That URL is what Modal gets.

    uv run tools/fetch.py <download url> <folder> [--auth CIVITAI_TOKEN|HF_TOKEN] [--name file.safetensors] [--allow-pickle]

tools/sync.sh civitai|hf resolve a model page or id into the download URL and call this."""
import argparse
import os
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlparse

import modal

from render import REPO, config


def allowed_hosts(token_name: str, env: dict) -> set[str]:
    extra = (os.environ.get("CIVITAI_HOSTS") or env.get("CIVITAI_HOSTS", "")) if token_name == "CIVITAI_TOKEN" else ""
    return set(config.TOKEN_HOSTS.get(token_name, ())) | {h.strip().lower() for h in extra.replace(" ", ",").split(",") if h.strip()}


def trusted(url: str, hosts: set[str]) -> bool:
    u = urlparse(url)
    host = (u.hostname or "").lower()
    return (u.scheme == "https" and u.username is None and u.password is None
            and any(host == h or host.endswith("." + h) for h in hosts))


class _Stop(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args):
        return None  # a 3xx comes back as an HTTPError, with its Location


def signed_url(url: str, token: str, hosts: set[str]) -> str:
    """The first URL off the token's hosts that `url` redirects to, asked with the token. Redirects within those hosts
    (a renamed repo, a cache path) are followed with the token; nothing past them ever sees it."""
    opener = urllib.request.build_opener(_Stop)
    for _ in range(10):
        if not trusted(url, hosts):
            if urlparse(url).scheme != "https":
                sys.exit(f"refusing a download link that is not https: {url.split('?')[0]}")
            return url
        request = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}", "User-Agent": "comfypoke-fetch"})
        try:
            with opener.open(request, timeout=60) as r:
                if r.headers.get_content_type() == "text/html":
                    sys.exit(f"{urlparse(url).hostname} answered with a web page: the token was refused, or the file "
                             "needs a login or a licence accepted on the site")
                sys.exit(f"{urlparse(url).hostname} served the file itself (HTTP {r.status}) instead of a CDN link, "
                         "so it cannot be fetched on Modal without the token: add --local to the sync.sh command")
        except urllib.error.HTTPError as e:
            location = e.headers.get("Location")
            e.close()
            if e.code not in (301, 302, 303, 307, 308) or not location:
                sys.exit(f"{urlparse(url).hostname} answered HTTP {e.code}: check the link and the token")
            url = urljoin(url, location)
        except urllib.error.URLError as e:
            sys.exit(f"could not reach {urlparse(url).hostname}: {e.reason}")
    sys.exit("too many redirects")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url")
    ap.add_argument("folder", help="models/ subfolder: loras, diffusion_models, checkpoints, ...")
    ap.add_argument("--auth", choices=sorted(config.TOKEN_HOSTS), help="environment variable holding the token")
    ap.add_argument("--name", help="file name to save as (default: what the server calls it)")
    ap.add_argument("--allow-pickle", action="store_true", help=f"accept a file that is not {' or '.join(config.SAFE_MODEL_TYPES)}")
    a = ap.parse_args()

    env = dict(line.split("=", 1) for line in (REPO / ".env").read_text().splitlines() if "=" in line) if (REPO / ".env").exists() else {}
    url = a.url
    if a.auth:
        hosts = allowed_hosts(a.auth, env)
        if not trusted(url, hosts):
            sys.exit(f"refusing to send {a.auth} to {urlparse(url).hostname or url!r}: only https to {', '.join(sorted(hosts))}"
                     + (" (add a mirror you trust with CIVITAI_HOSTS=<host> in .env)" if a.auth == "CIVITAI_TOKEN" else ""))
        token = os.environ.get(a.auth) or env.get(a.auth, "").strip()
        if not token:
            sys.exit(f"set {a.auth} (or add it in the console under Tokens)")
        url = signed_url(url, token, hosts)

    fetch = modal.Function.from_name(config.APP_NAME, "fetch")
    start = time.time()
    last = ""
    for line in fetch.remote_gen(url, a.folder, a.name, a.allow_pickle):
        print(line, flush=True)
        last = line
    if last.startswith("done "):
        print(f"in {a.folder} after {time.time() - start:.0f} s; reload the GUI or the studio's model list to see it")
