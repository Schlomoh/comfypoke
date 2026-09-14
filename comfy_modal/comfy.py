"""Start a ComfyUI process in a container and wait until it answers."""
import socket
import subprocess
import time
from pathlib import Path

from . import config


def wait_for_port(port: int, timeout: float):
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=1):
                return
        except OSError:
            time.sleep(0.5)
    raise TimeoutError(f"ComfyUI did not open port {port} within {timeout}s")


def launch(port: int, extra_args: tuple = ()):
    for d in ("output", "input", "temp"):
        Path(config.IO_DIR, d).mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "comfy", "launch", "--background", "--",
            "--listen", "0.0.0.0", "--port", str(port),
            "--output-directory", f"{config.IO_DIR}/output",
            "--input-directory", f"{config.IO_DIR}/input",
            "--temp-directory", f"{config.IO_DIR}/temp",  # previews: written by the worker, served by the UI
            *extra_args,
        ],
        check=True,
    )
    wait_for_port(port, timeout=300)


def log_file(port: int) -> Path:
    """comfy-cli writes the server log here in background mode."""
    return Path(config.COMFY_DIR, "user", f"comfyui_{port}.log")
