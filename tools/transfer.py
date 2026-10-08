"""Copy models between the volumes of two comfypoke deployments, without downloading them.

Modal has no server-side copy between two volumes, and a 2 GB LoRA does not want to travel
through your laptop twice to get from one deployment to another. This mounts both volumes on
one small CPU container inside Modal and copies there, so the file never leaves the cloud.

    uv run tools/transfer.py --list
    uv run tools/transfer.py <src-volume> <src-path> <dst-volume> [dst-path] [--move]

Paths are relative to the volume root, the same ones `tools/sync.sh ls` prints:

    uv run tools/transfer.py comfypoke-models extra/loras/mine.safetensors other-models
    uv run tools/transfer.py comfypoke-models extra/loras other-models extra/loras --move

Both volumes must be in the same Modal workspace and environment. Within one volume this is
the slow way round: use `tools/sync.sh cp` instead, which is instant.

This module is imported twice: once here, and once inside the container, where sys.argv belongs
to Modal's runner and not to you. So the command line is only read when modal.is_local(), and
the container learns the two volume names from a Secret instead. Parsing argv unconditionally
kills the container at import, and Modal answers that by retrying it.
"""
import argparse
import json
import os
import subprocess
import sys
from pathlib import Path

import modal

APP_NAME = "comfypoke-transfer"
MODAL = str(Path.home() / ".local" / "bin" / "modal")


def volume_names() -> list[str]:
    try:
        raw = subprocess.run([MODAL, "volume", "list", "--json"], capture_output=True, text=True, check=True).stdout
        return sorted(v.get("name") or v["Name"] for v in json.loads(raw))
    except Exception:
        return []


def parse(argv: list[str]):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("src_volume", nargs="?", help="volume to copy from")
    ap.add_argument("src_path", nargs="?", help="file or folder on it, e.g. extra/loras/mine.safetensors")
    ap.add_argument("dst_volume", nargs="?", help="volume to copy to")
    ap.add_argument("dst_path", nargs="?", help="destination path; defaults to the same path as the source")
    ap.add_argument("--move", action="store_true", help="delete the source after a successful copy")
    ap.add_argument("--list", action="store_true", help="list the volumes in this workspace and exit")
    a = ap.parse_args(argv)
    if a.list:
        names = volume_names()
        print("\n".join(names) if names else "no volumes found (is `modal profile current` the right workspace?)")
        sys.exit(0)
    if not (a.src_volume and a.src_path and a.dst_volume):
        ap.error("need <src-volume> <src-path> <dst-volume>, or --list")
    if a.src_volume == a.dst_volume:
        ap.error(f"both sides are {a.src_volume}; within one volume use: tools/sync.sh cp")
    a.dst_path = a.dst_path or a.src_path
    return a


args = parse(sys.argv[1:]) if modal.is_local() else None
SRC_NAME = args.src_volume if args else os.environ.get("XFER_SRC", "unset")
DST_NAME = args.dst_volume if args else os.environ.get("XFER_DST", "unset")

app = modal.App(APP_NAME)
SRC = modal.Volume.from_name(SRC_NAME)
DST = modal.Volume.from_name(DST_NAME)


@app.function(
    volumes={"/src": SRC, "/dst": DST},
    secrets=[modal.Secret.from_dict({"XFER_SRC": SRC_NAME, "XFER_DST": DST_NAME})],
    cpu=2.0,
    timeout=3600,
)
def transfer(src_path: str, dst_path: str, move: bool) -> str:
    import shutil

    src, dst = Path("/src", src_path), Path("/dst", dst_path)
    if not src.exists():
        return f"not on the source volume: {src_path}"
    if src.is_dir():
        files = [p for p in src.rglob("*") if p.is_file()]
        shutil.copytree(src, dst, dirs_exist_ok=True, copy_function=shutil.copy)
    else:
        files = [src]
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(src, dst)
    count, size = len(files), sum(p.stat().st_size for p in files)
    if move:
        shutil.rmtree(src) if src.is_dir() else src.unlink()
        SRC.commit()  # the source lost files; the destination is committed below
    DST.commit()
    return f"{'moved' if move else 'copied'} {count} file(s), {size / 1024 / 1024:.1f} MB"


if __name__ == "__main__":
    print(f"{args.src_volume}:/{args.src_path}  ->  {args.dst_volume}:/{args.dst_path}")
    with app.run():  # an ephemeral app: one container, alive only for the copy
        print(transfer.remote(args.src_path, args.dst_path, args.move))
    print("reload the GUI page on the destination deployment to see it in the dropdowns")
