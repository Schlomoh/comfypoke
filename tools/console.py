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
import tempfile
import webbrowser
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
ENV_FILE = REPO / ".env"  # git-ignored; tokens live here so they survive between shells
TOKENS = {
    "CIVITAI_TOKEN": "civitai.com/user/account > API Keys",
    "HF_TOKEN": "huggingface.co/settings/tokens (only needed for gated repos)",
}
out = Console()


def load_env():
    """Read .env into the environment. A real environment variable always wins."""
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text().splitlines():
        key, _, value = line.partition("=")
        if key.strip() and not os.environ.get(key.strip()):
            os.environ[key.strip()] = value.strip()


def save_env(values: dict):
    """Rewrite .env with these keys, dropping the ones set to empty.

    Written through a temp file that is owner-only from the moment it exists, then renamed over
    the target. Writing first and calling chmod after would leave the tokens world-readable for
    the time in between, and would lose them entirely if the write failed halfway."""
    current = {}
    if ENV_FILE.exists():
        for line in ENV_FILE.read_text().splitlines():
            key, _, value = line.partition("=")
            if key.strip():
                current[key.strip()] = value.strip()
    current.update(values)
    data = "".join(f"{k}={v}\n" for k, v in sorted(current.items()) if v)
    fd, tmp = tempfile.mkstemp(dir=str(REPO), prefix=".env.")  # mkstemp creates it 0600
    try:
        os.write(fd, data.encode())
    finally:
        os.close(fd)
    os.replace(tmp, ENV_FILE)


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
        webbrowser.open(f"{url}/?key={key_file.read_text().strip()}")
    else:
        out.print(f"[bold cyan]$ open {url}[/]")
        webbrowser.open(url)


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
        if ask(questionary.confirm("Pull to the sync folder first, then delete output/, temp/ and input/ (except KEEP_INPUTS in tools/pull.py) on the volume?", default=False)):
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
            out.print(f"[yellow]CIVITAI_TOKEN is not set.[/] {TOKENS['CIVITAI_TOKEN']}")
            if not ask(questionary.confirm("Set it now?", default=True)):
                return
            tokens_set("CIVITAI_TOKEN")
            if not os.environ.get("CIVITAI_TOKEN"):
                return
        ref = ask(questionary.text("Civitai model page URL, download URL or version id:"))
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


def tokens():
    t = Table("token", "status", "where to get one", title=f"tokens in {ENV_FILE.name}")
    for name, where in TOKENS.items():
        value = os.environ.get(name, "")
        t.add_row(name, f"set ({value[:4]}...{value[-2:]})" if value else "not set", where)
    out.print(t)
    name = ask(questionary.select("Set which token?", choices=[*TOKENS, "back"]))
    if name != "back":
        tokens_set(name)


def tokens_set(name: str):
    out.print(f"[dim]{TOKENS[name]}[/]")
    value = ask(questionary.password(f"{name} (empty clears it):")).strip()
    save_env({name: value})
    if value:
        os.environ[name] = value
        out.print(f"[green]{name} saved to {ENV_FILE.name}[/]; tools/sync.sh reads it too")
    else:
        os.environ.pop(name, None)
        out.print(f"{name} cleared")


def all_volumes() -> list[str]:
    r = subprocess.run([MODAL, "volume", "list", "--json"], cwd=REPO, capture_output=True, text=True)
    if r.returncode != 0 or not r.stdout.strip():
        return []
    return sorted(n for n in ((v.get("name") or v.get("Name")) for v in json.loads(r.stdout)) if n)


def pick_volume(prompt: str, exclude: str = "") -> str:
    """Every volume in the workspace, not just this deployment's three, so files can move
    between separate comfypoke setups. Ours are listed first and labelled."""
    names = [n for n in all_volumes() if n != exclude]
    if not names:
        out.print("[red]no volumes found[/] (is `modal profile current` the right workspace?)")
        return ""
    mine = {config.VOLUME_IO: "renders, previews, uploads",
            config.VOLUME_MODELS: "hand-uploaded models under extra/",
            config.VOLUME_DATA: "saved workflows and settings"}
    ordered = [n for n in names if n in mine] + [n for n in names if n not in mine]
    labels = [f"{n}  ({mine[n]})" if n in mine else n for n in ordered]
    return ordered[labels.index(ask(questionary.select(prompt, choices=labels)))]


def volume_entries(vol: str, path: str) -> list[dict]:
    r = subprocess.run([MODAL, "volume", "ls", vol, path, "--json"], cwd=REPO, capture_output=True, text=True)
    return json.loads(r.stdout) if r.returncode == 0 and r.stdout.strip() else []


def files():
    """Browse any volume and act on a file or a whole folder without downloading it."""
    vol = pick_volume("Browse which volume?")
    if not vol:
        return
    path = "/"
    while True:
        entries = sorted(volume_entries(vol, path), key=lambda e: (e["type"] != "dir", e["filename"]))
        rows = [f"{'[dir] ' if e['type'] == 'dir' else '[file]'} {Path(e['filename']).name}"
                + ("" if e["type"] == "dir" else f"  ({e['size']})") for e in entries]
        extras = ([".. up"] if path != "/" else [])
        tail = ([f"* act on this whole folder ({Path(path).name})"] if path != "/" else []) + ["done"]
        if not entries:
            out.print(f"{vol}:/{path.strip('/')} is empty")
            if path == "/":
                return
        picked = ask(questionary.select(f"{vol}:/{path.strip('/')}", choices=extras + rows + tail))
        if picked == "done":
            return
        if picked == ".. up":
            parent = str(Path(path).parent)
            path = "/" if parent in (".", "/") else parent
            continue
        if picked.startswith("* act on this whole folder"):
            if file_action(vol, path, is_dir=True):  # the folder may be gone now
                path = "/"
            continue
        e = entries[(extras + rows).index(picked) - len(extras)]
        if e["type"] == "dir":
            what = ask(questionary.select(Path(e["filename"]).name, choices=["open it", "act on the whole folder", "back"]))
            if what == "open it":
                path = e["filename"]
            elif what.startswith("act on"):
                file_action(vol, e["filename"], is_dir=True)
            continue
        file_action(vol, e["filename"], is_dir=False)


def file_action(vol: str, path: str, is_dir: bool) -> bool:
    """Returns True when the thing is no longer where it was, so the caller can back out."""
    name = Path(path).name
    what_it_is = "folder" if is_dir else "file"
    choices = [f"copy this {what_it_is} elsewhere on {vol}", f"move it elsewhere on {vol}",
               "send it to another volume", "delete it", "back"]
    if not is_dir and vol == config.VOLUME_IO and not path.startswith("input/"):
        choices.insert(0, "copy to input/ (use it in a workflow)")
    what = ask(questionary.select(f"{what_it_is}: {path}", choices=choices))
    if what == "back":
        return False
    if what.startswith("copy to input/"):
        run([SYNC, "cp", vol, path, f"input/{name}"])
    elif what == "delete it":
        if is_dir:  # show what is in there first: a folder may hold files you never put there
            run([SYNC, "ls", vol, path, "-r"])
            if not ask(questionary.confirm(f"Delete the folder {vol}:/{path} and everything listed above? "
                                           "Modal has no undelete.", default=False)):
                return False
            return run([SYNC, "rm", vol, path, "-r"]) == 0
        if not ask(questionary.confirm(f"Delete {vol}:/{path}? This cannot be undone.", default=False)):
            return False
        return run([SYNC, "rm", vol, path]) == 0
    elif what.startswith("send it"):
        target = pick_volume("Send it to which volume?", exclude=vol)
        if not target:
            return False
        dst = ask(questionary.text(f"Path on {target}:", default=path))
        move = ask(questionary.confirm(f"Delete it from {vol} afterwards (move rather than copy)?", default=False))
        code = run([sys.executable, "tools/transfer.py", vol, path, target, dst] + (["--move"] if move else []))
        return move and code == 0
    else:
        dst = ask(questionary.text("Destination path on this volume:", default=path))
        if dst == path:
            out.print("same path, nothing to do")
            return False
        move = what.startswith("move")
        return run([SYNC, "mv" if move else "cp", vol, path, dst]) == 0 and move
    return False


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
    "Files": files,
    "Models": models,
    "Tokens": tokens,
    "Check": check,
    "Logs": logs,
    "Quit": None,
}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--status", action="store_true", help="print the status and exit")
    ap.add_argument("--logs", type=int, metavar="SECONDS", help="stream app logs for this long and exit")
    a = ap.parse_args()
    load_env()
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
