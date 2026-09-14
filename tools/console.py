"""Arrow-key console for the deployed app. Every action shells out to the
existing tools (tools/sync.sh, tools/render.py, tools/check.py, the modal CLI),
prints the command it runs, streams the output and returns to the menu.

    uv run tools/console.py            the menu (Ctrl-C at the menu quits, inside an action goes back)
    uv run tools/console.py --status   print the status and exit (works without a terminal)
    uv run tools/console.py --logs 20  stream app logs for 20 seconds and exit
"""
import argparse
import json
import os
import shlex
import subprocess
import sys
from pathlib import Path

import questionary
from rich.console import Console
from rich.table import Table

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO))
sys.path.insert(0, str(REPO / "tools"))
from comfy_modal import config  # noqa: E402
from render import MODAL, default_url  # noqa: E402

SYNC = str(REPO / "tools" / "sync.sh")
MODEL_FOLDERS = ["loras", "diffusion_models", "vae", "text_encoders", "upscale_models", "controlnet"]
out = Console()


# ---- plumbing ---------------------------------------------------------------

def run(cmd: list[str], timeout: float | None = None) -> int:
    """Print the command, stream its output, return the exit code."""
    out.print(f"[bold cyan]$ {shlex.join(cmd)}[/]")
    try:
        code = subprocess.run(cmd, cwd=REPO, timeout=timeout).returncode
    except subprocess.TimeoutExpired:
        out.print(f"[dim]stopped after {timeout:.0f} s[/]")
        return 0
    if code:
        out.print(f"[red]exit {code}[/]")
    return code


def capture(cmd: list[str]) -> str:
    return subprocess.run(cmd, cwd=REPO, capture_output=True, text=True, check=True).stdout


def ask(question):
    """questionary returns None on Ctrl-C; turn that into 'back to the menu'."""
    answer = question.ask()
    if answer is None:
        raise KeyboardInterrupt
    return answer


def containers() -> list[dict]:
    return [c for c in json.loads(capture([MODAL, "container", "list", "--json"])) if c["app_name"] == config.APP_NAME]


def models_on_volume() -> list[tuple[str, str, str]]:
    """(folder, file name, size) for every file under extra/ on the models volume."""
    root = config.CONTAINER_ENV["COMFY_EXTRA_MODELS"]
    found = []
    top = subprocess.run([MODAL, "volume", "ls", config.VOLUME_MODELS, root, "--json"], capture_output=True, text=True)
    for d in json.loads(top.stdout) if top.returncode == 0 else []:  # a fresh volume has no extra/ yet
        if d["type"] != "dir":
            continue
        for f in json.loads(capture([MODAL, "volume", "ls", config.VOLUME_MODELS, d["filename"], "--json"])):
            if f["type"] == "file":
                found.append((Path(d["filename"]).name, Path(f["filename"]).name, f["size"]))
    return found


def pick_folder() -> str:
    return ask(questionary.select("Models folder", choices=MODEL_FOLDERS, default="loras"))


# ---- actions ----------------------------------------------------------------

def status():
    out.print(f"UI  [link]{default_url()}[/]")
    running = containers()
    if running:
        t = Table("container", "started", title=f"running containers of app '{config.APP_NAME}'")
        for c in running:
            t.add_row(c["container_id"], c["start_time"])
        out.print(t)
    else:
        out.print("no running containers (the app is asleep, the first request wakes it)")
    status_models()


def open_gui():
    url = default_url()
    with_key = ask(questionary.select("Open", choices=[
        "plain URL (the key cookie is already set in this browser)",
        "URL with ?key= (first visit, sets the cookie)",
    ])).startswith("URL with")
    if with_key:
        key_file = REPO / config.ACCESS_KEY_FILE
        if not key_file.exists():
            out.print(f"[red]no {config.ACCESS_KEY_FILE} in {REPO}; see README > Setup[/]")
            return
        out.print(f"[bold cyan]$ open {url}/?key=<contents of {config.ACCESS_KEY_FILE}>[/]")
        subprocess.run(["open", f"{url}/?key={key_file.read_text().strip()}"], check=True)
    else:
        run(["open", url])


def wake():
    out.print("Runs one small Z-Image-Turbo render so the GPU worker is loaded before you start (costs cents).")
    if ask(questionary.confirm("Wake the worker now?", default=False)):
        run([sys.executable, "tools/render.py", "turbo", "a red apple on a wooden table", "--prefix", "console/wake"])


def stop():
    what = ask(questionary.select("Stop what?", choices=[
        "running containers (the app stays deployed and wakes on the next request)",
        "the whole app (modal app stop; Deploy brings it back)",
    ]))
    if what.startswith("running"):
        running = containers()
        if not running:
            out.print("nothing is running")
        for c in running:
            run([MODAL, "container", "stop", "--yes", c["container_id"]])
        return
    typed = ask(questionary.text(f"This takes the UI offline until the next deploy. Type '{config.APP_NAME}' to confirm:"))
    if typed != config.APP_NAME:
        out.print("not confirmed, nothing stopped")
        return
    if run([MODAL, "app", "stop", "--yes", config.APP_NAME]) == 0:
        out.print(f"app '{config.APP_NAME}' is offline; Deploy brings it back")


def deploy():
    if run([MODAL, "deploy", "modal_app.py"]) != 0:
        return
    if ask(questionary.confirm("Run the acceptance check now (stops stale containers, about a minute, costs cents)?", default=True)):
        check()


def sync():
    what = ask(questionary.select("Sync", choices=["pull renders to the sync folder ($SYNC_DIR)", "pull, then clear renders, previews and uploads from the volume",
                                                    "push a file or folder to input/", "push workflows/ to the UI"]))
    if what.startswith("pull renders"):
        run([SYNC, "pull"])  # sync.sh says so when the sync folder is missing
    elif what.startswith("pull, then clear"):
        if ask(questionary.confirm("Pull to the sync folder first, then delete output/, temp/ and input/ (except the workflows' test images) on the volume?", default=False)):
            run([SYNC, "clear"])
    elif what.startswith("push a file"):
        path = os.path.expanduser(ask(questionary.path("File or folder to upload:")))
        if not os.path.exists(path):
            out.print(f"[red]not found: {path}[/]")
            return
        run([SYNC, "push", path])
    else:
        run([SYNC, "workflows"])


def models():
    what = ask(questionary.select("Models", choices=[
        "list what is on the volume", "add from a local file", "add from Civitai", "add from Hugging Face", "remove one",
    ]))
    if what.startswith("list"):
        status_models()
    elif what.startswith("add from a local"):
        path = os.path.expanduser(ask(questionary.path("Model file:")))
        if not os.path.isfile(path):
            out.print(f"[red]not a file: {path}[/]")
            return
        run([SYNC, "lora", path, pick_folder()])
    elif what.startswith("add from Civitai"):
        if not os.environ.get("CIVITAI_TOKEN"):
            out.print("[red]CIVITAI_TOKEN is not set.[/] Create an API key at civitai.com/user/account > API Keys, then start the console with "
                      "[bold]CIVITAI_TOKEN=... uv run tools/console.py[/]")
            return
        ref = ask(questionary.text("Civitai version id or model page URL:"))
        run([SYNC, "civitai", ref, pick_folder()])
    elif what.startswith("add from Hugging"):
        repo = ask(questionary.text("Repo (owner/name):"))
        path = ask(questionary.text("Path in repo (e.g. my_lora.safetensors):"))
        run([SYNC, "hf", repo, path, pick_folder()])  # HF_TOKEN only matters for gated repos; sync.sh picks it up
    else:
        files = models_on_volume()
        if not files:
            out.print("nothing to remove")
            return
        root = config.CONTAINER_ENV["COMFY_EXTRA_MODELS"]
        target = ask(questionary.select("Remove which file?", choices=[f"{root}/{folder}/{name}" for folder, name, _ in files]))
        if ask(questionary.confirm(f"Delete {target} from {config.VOLUME_MODELS}? This cannot be undone.", default=False)):
            run([MODAL, "volume", "rm", config.VOLUME_MODELS, target])


def status_models():
    files = models_on_volume()
    if not files:
        out.print(f"no hand-uploaded models on {config.VOLUME_MODELS} (Models > add)")
        return
    t = Table("folder", "file", "size", title=f"hand-uploaded models on {config.VOLUME_MODELS}")
    for row in files:
        t.add_row(*row)
    out.print(t)


def check():
    run([sys.executable, "tools/check.py", "--stop-stale"])  # prints its own PASS/FAIL lines


def logs(seconds: int | None = None):
    if seconds is None:
        seconds = int(ask(questionary.text("Stream logs for how many seconds?", default="30", validate=lambda v: v.isdigit() and int(v) > 0)))
    run([MODAL, "app", "logs", config.APP_NAME, "-f"], timeout=seconds)


ACTIONS = {
    "Status": status,
    "Open GUI": open_gui,
    "Wake worker": wake,
    "Stop": stop,
    "Deploy": deploy,
    "Sync": sync,
    "Models": models,
    "Check": check,
    "Logs": logs,
    "Quit": None,
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--status", action="store_true", help="print the status and exit")
    ap.add_argument("--logs", type=int, metavar="SECONDS", help="stream app logs for this long and exit")
    a = ap.parse_args()
    if a.status:
        return status()
    if a.logs:
        return logs(a.logs)
    if not sys.stdin.isatty():
        sys.exit("the menu needs a terminal; use --status or --logs N for non-interactive runs")
    out.print(f"[bold]comfy console[/]  app '{config.APP_NAME}', workspace from `modal profile current`")
    while True:
        choice = questionary.select("What next?", choices=list(ACTIONS)).ask()
        if choice in (None, "Quit"):
            break
        try:
            ACTIONS[choice]()
        except KeyboardInterrupt:
            out.print("[dim]back to the menu[/]")
        except subprocess.CalledProcessError as e:
            out.print(f"[red]{shlex.join(e.cmd)} failed:[/] {e.stderr or e.stdout}")


if __name__ == "__main__":
    main()
