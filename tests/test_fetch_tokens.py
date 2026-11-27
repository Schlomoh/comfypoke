"""tools/fetch.py: a download token goes only to its own hosts, and Modal gets the signed CDN link, never the token
(security review S8). comfy_modal/fetch.py: only safetensors and gguf unless asked (S22)."""
import email.message
import re
import io
import sys
import urllib.error
from pathlib import Path
from unittest import mock

import pytest

sys.path.insert(0, str(Path(__file__).parents[1] / "tools"))
import fetch as tool  # noqa: E402

from comfy_modal import config  # noqa: E402

HF = tool.allowed_hosts("HF_TOKEN", {})


def test_tokens_go_only_to_their_hosts_over_https():
    assert tool.trusted("https://huggingface.co/a/b", HF) and tool.trusted("https://cdn.huggingface.co/x", HF)
    for url in ("http://huggingface.co/a", "https://huggingface.co.evil.example/a", "https://evilhuggingface.co/a",
                "https://example.com/a"):
        assert not tool.trusted(url, HF), url
    civitai = tool.allowed_hosts("CIVITAI_TOKEN", {"CIVITAI_HOSTS": "civitai.red, mirror.example"})
    assert civitai == {"civitai.com", "civitai.red", "mirror.example"}
    assert tool.allowed_hosts("HF_TOKEN", {"CIVITAI_HOSTS": "x.example"}) == {"huggingface.co"}


def _redirects(*hops):
    """An opener whose answers are 3xx to each of `hops` in turn, recording the requests it was given."""
    seen = []

    def open_(request, timeout):
        seen.append((request.full_url, request.get_header("Authorization")))
        headers = email.message.Message()
        headers["Location"] = hops[len(seen) - 1]
        raise urllib.error.HTTPError(request.full_url, 302, "Found", headers, io.BytesIO())
    return mock.Mock(open=open_), seen


def test_modal_gets_the_first_link_off_the_tokens_hosts():
    opener, seen = _redirects("/api/resolve-cache/x", "https://us.aws.cdn.hf.co/signed?x=1")
    with mock.patch.object(tool.urllib.request, "build_opener", return_value=opener):
        url = tool.signed_url("https://huggingface.co/a/b/resolve/main/m.safetensors", "secret", HF)
    assert url == "https://us.aws.cdn.hf.co/signed?x=1" and "secret" not in url
    assert seen == [("https://huggingface.co/a/b/resolve/main/m.safetensors", "Bearer secret"),
                    ("https://huggingface.co/api/resolve-cache/x", "Bearer secret")]  # the CDN never sees it


def test_a_file_served_on_the_tokens_host_is_not_sent_to_modal():
    served = mock.MagicMock()
    served.__enter__.return_value.status = 200
    with mock.patch.object(tool.urllib.request, "build_opener", return_value=mock.Mock(open=lambda r, timeout: served)), \
            pytest.raises(SystemExit):
        tool.signed_url("https://huggingface.co/a/b/resolve/main/m.safetensors", "secret", HF)


def test_the_modal_function_takes_no_token_and_refuses_pickles_unless_asked():
    import ast
    source = (Path(__file__).parents[1] / "comfy_modal" / "fetch.py").read_text()  # importing it needs Modal credentials
    fn = next(n for n in ast.parse(source).body if isinstance(n, ast.FunctionDef) and n.name == "fetch")
    assert [a.arg for a in fn.args.args] == ["url", "folder", "name", "allow_pickle"]
    assert "headers=" not in ast.get_source_segment(source, fn) and "SAFE_MODEL_TYPES" in ast.get_source_segment(source, fn)
    assert config.SAFE_MODEL_TYPES == (".safetensors", ".gguf")


class _Server:
    """A local HTTP server answering every GET with `status` and `headers`, recording the requests' headers."""

    def __init__(self, status, headers):
        import http.server
        import threading
        seen = self.seen = []

        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                seen.append(dict(self.headers))
                self.send_response(status)
                for k, v in headers.items():
                    self.send_header(k, v)
                self.send_header("Content-Length", "0")
                self.end_headers()

            def log_message(self, *args):
                pass
        self.httpd = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.httpd.server_port}/"
        threading.Thread(target=self.httpd.serve_forever, daemon=True).start()

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.httpd.shutdown()


def test_the_redirect_handler_hands_back_the_location():
    with _Server(302, {"Location": "https://cdn.example/signed"}) as s:
        with pytest.raises(urllib.error.HTTPError) as e:
            tool.urllib.request.build_opener(tool._Stop).open(s.url, timeout=5)
        assert e.value.code == 302 and e.value.headers["Location"] == "https://cdn.example/signed"
        assert len(s.seen) == 1  # not followed


@pytest.mark.parametrize("location", ["//evil.example/x", "https://huggingface.co@evil.example/x",
                                      "https://evil.example\\\\@huggingface.co/x"])
def test_a_hostile_redirect_never_gets_the_token(location):
    opener, seen = _redirects(location, "https://never.example/")
    with mock.patch.object(tool.urllib.request, "build_opener", return_value=opener):
        try:
            url = tool.signed_url("https://huggingface.co/a/b/resolve/main/m.safetensors", "secret", HF)
        except SystemExit:
            url = None
    assert len(seen) == 1 and (url is None or not tool.trusted(url, HF))


def test_a_redirect_to_plain_http_is_refused():
    opener, _ = _redirects("http://huggingface.co/a/b/m.safetensors")
    with mock.patch.object(tool.urllib.request, "build_opener", return_value=opener), pytest.raises(SystemExit):
        tool.signed_url("https://huggingface.co/a/b/resolve/main/m.safetensors", "secret", HF)


def test_sync_sh_hands_curl_the_token_as_a_header_it_can_read():
    import shutil
    import subprocess
    if not shutil.which("curl"):
        pytest.skip("no curl")
    script = (Path(__file__).parents[1] / "tools" / "sync.sh").read_text()
    helpers = re.search(r"^bearer\(\).*?^}\n", script, re.S | re.M).group(0)
    with _Server(200, {}) as s:
        for token, expect in (("secret", "Bearer secret"), ("", None)):
            run = subprocess.run(["/bin/bash", "-c", f'set -e\n{helpers}\ncurl_with "$1" -sS --fail -o /dev/null "$2"',
                                  "sh", token, s.url], capture_output=True, text=True)
            assert run.returncode == 0, run.stderr
            assert s.seen[-1].get("Authorization") == expect
