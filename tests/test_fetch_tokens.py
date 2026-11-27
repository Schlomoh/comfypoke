"""tools/fetch.py: a download token goes only to its own hosts, and Modal gets the signed CDN link, never the token
(security review S8). comfy_modal/fetch.py: only safetensors and gguf unless asked (S22)."""
import email.message
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
