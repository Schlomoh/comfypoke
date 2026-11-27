"""Import a node pack from comfy_nodes/ against stand-ins for the ComfyUI modules it imports, and leave sys.modules and
the environment as they were afterwards."""
import importlib
import os
import sys
import types
from unittest import mock


def _routes():
    return types.SimpleNamespace(**{m: (lambda path: (lambda f: f)) for m in ("get", "post", "delete", "put")})


def load(name: str, env: dict):
    server = types.ModuleType("server")
    server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(
        app=types.SimpleNamespace(middlewares=[], on_response_prepare=[]), routes=_routes()))
    jobs = types.ModuleType("comfy_execution.jobs")
    jobs.validate_job_id = lambda x: x
    stubs = {"server": server, "execution": types.ModuleType("execution"),
             "comfy_execution": types.ModuleType("comfy_execution"), "comfy_execution.jobs": jobs}
    with mock.patch.dict(sys.modules, stubs), mock.patch.dict(os.environ, env):
        sys.modules.pop(f"comfy_nodes.{name}", None)
        module = importlib.import_module(f"comfy_nodes.{name}")
    sys.modules.pop(f"comfy_nodes.{name}", None)
    return module
