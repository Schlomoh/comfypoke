"""List, copy, move and delete files on the Modal volumes without a round trip through this Mac.

A render you want to upscale is already on the io volume; copying it from output/ to input/
through your laptop downloads and re-uploads it for nothing. Copies here are server-side, so
they are instant whatever the file weighs. Moves are a copy followed by a delete.

    tools/sync.sh ls  [io|models|data|<volume name>] [path] [-r]
    tools/sync.sh cp  <volume> <src> <dst>
    tools/sync.sh mv  <volume> <src> <dst>
    tools/sync.sh rm  <volume> <path>

Paths are relative to the volume root: output/ComfyUI_00012_.png, extra/loras/mine.safetensors.
Modal cannot copy between two volumes server-side, so that is not offered here; tools/transfer.py
does it from a small container that mounts both.
"""
import sys
from pathlib import Path

import modal
from modal.volume import FileEntryType

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from comfy_modal import config  # noqa: E402

ALIASES = {"io": config.VOLUME_IO, "models": config.VOLUME_MODELS, "data": config.VOLUME_DATA}


def name_of(alias: str) -> str:
    """io/models/data name this deployment's own volumes; anything else is a volume name as-is,
    so the same commands reach another deployment's storage."""
    return ALIASES.get(alias, alias)


def volume(alias: str):
    try:
        return modal.Volume.from_name(name_of(alias))
    except Exception:
        sys.exit(f"no volume named '{name_of(alias)}'; `uv run tools/transfer.py --list` shows them all")


def human(size: float) -> str:
    for unit in ("B", "K", "M", "G"):
        if size < 1024 or unit == "G":
            return f"{size:.0f}{unit}" if unit == "B" else f"{size:.1f}{unit}"
        size /= 1024


def entry(vol, path: str):
    """The listing entry for one path, by listing its parent. None when it is not there."""
    parent = str(Path(path).parent)
    for e in vol.listdir("/" if parent == "." else parent):
        if e.path.strip("/") == path.strip("/"):
            return e
    return None


def is_dir(vol, path: str) -> bool:
    e = entry(vol, path)
    if e is None:
        sys.exit(f"not on the volume: {path}")
    return e.type == FileEntryType.DIRECTORY


def ls(alias: str, path: str = "/", recursive: bool = False):
    vol = volume(alias)
    try:
        entries = sorted(vol.listdir(path, recursive=recursive), key=lambda e: e.path)
    except Exception:  # modal raises a grpc error, not FileNotFoundError, for a missing dir
        sys.exit(f"not on {name_of(alias)}: {path}")
    if not entries:
        print(f"{path} is empty")
        return
    for e in entries:
        kind = "dir" if e.type == FileEntryType.DIRECTORY else "file"
        size = "" if e.type == FileEntryType.DIRECTORY else human(e.size)
        print(f"{kind:4} {size:>8}  {e.path}")
    files = [e for e in entries if e.type == FileEntryType.FILE]
    print(f"{len(files)} file(s), {human(sum(e.size for e in files))}")


def cp(alias: str, src: str, dst: str, then_remove: bool = False):
    vol = volume(alias)
    recursive = is_dir(vol, src)
    vol.copy_files([src], dst, recursive=recursive)
    if then_remove:
        vol.remove_file(src, recursive=recursive)
    print(f"{'moved' if then_remove else 'copied'} {src} -> {dst} on {name_of(alias)}")
    print("reload the GUI page to see it in the dropdowns")


def rm(alias: str, path: str, recursive: bool = False):
    """A folder needs -r, and says what it holds first. Deleting a folder by name takes
    everything in it, including files you did not put there and cannot get back: Modal volumes
    have no snapshot or undelete."""
    vol = volume(alias)
    if is_dir(vol, path):
        inside = [e for e in vol.listdir(path, recursive=True) if e.type == FileEntryType.FILE]
        if not recursive:
            print(f"{path} is a folder holding {len(inside)} file(s), {human(sum(e.size for e in inside))}:")
            for e in inside[:10]:
                print(f"  {e.path}")
            if len(inside) > 10:
                print(f"  ... and {len(inside) - 10} more")
            sys.exit("pass -r to delete the folder and everything in it")
        print(f"deleting {len(inside)} file(s), {human(sum(e.size for e in inside))}")
    vol.remove_file(path, recursive=recursive)
    print(f"removed {path} from {name_of(alias)}")


def main(argv: list[str]):
    flags = {a for a in argv if a.startswith("-")}
    args = [a for a in argv if not a.startswith("-")]
    if not args:
        sys.exit(__doc__)
    action, rest = args[0], args[1:]
    if action == "ls":
        ls(rest[0] if rest else "io", rest[1] if len(rest) > 1 else "/", bool(flags & {"-r", "--recursive"}))
    elif action in ("cp", "mv"):
        if len(rest) != 3:
            sys.exit(f"usage: tools/sync.sh {action} <volume> <src> <dst>")
        cp(*rest, then_remove=action == "mv")
    elif action == "rm":
        if len(rest) != 2:
            sys.exit("usage: tools/sync.sh rm <volume> <path> [-r]")
        rm(*rest, recursive=bool(flags & {"-r", "--recursive"}))
    else:
        sys.exit(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
