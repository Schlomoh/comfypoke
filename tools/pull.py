"""Copy new renders from the io volume to the local sync folder, each file once; optionally clear the volume after.

$SYNC_DIR/output/.pulled (tools/sync.sh) lists every volume path already copied, so a file you delete
locally is not copied again and nothing is downloaded twice. The first run seeds the list with files
already in the folder. check/ (acceptance test renders) is skipped. Downloads run 8 at a time.
--clear then deletes output/, temp/ and every upload in input/ except KEEP_INPUTS, through one SDK connection, and resets .pulled (ComfyUI numbers from 00001 again).
Usage: tools/sync.sh pull | clear  (or: uv run tools/pull.py <sync output dir> [--clear])
"""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import modal
from modal.volume import FileEntryType

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from comfy_modal import config  # noqa: E402

SKIP = ("output/check/",)
KEEP_INPUTS = set()  # input files that survive `sync.sh clear`, e.g. images your saved workflows load by default


def pull(vol, out: Path) -> set:
    out.mkdir(parents=True, exist_ok=True)
    manifest = out / ".pulled"
    pulled = set(manifest.read_text().split("\n")) if manifest.exists() else {f"output/{p.relative_to(out)}" for p in out.rglob("*") if p.is_file() and p.name != ".pulled"}
    entries = [e for e in vol.listdir("output", recursive=True) if e.type == FileEntryType.FILE]
    new = [e.path for e in entries if e.path not in pulled and not e.path.startswith(SKIP)]

    def fetch(path):
        dst = out / Path(path).relative_to("output")
        n = 1
        while dst.exists():  # a new render reusing an old name after the volume was cleared: keep both
            n += 1
            dst = dst.with_name(f"{Path(path).stem}-{n}{dst.suffix}")
        dst.parent.mkdir(parents=True, exist_ok=True)
        with open(dst, "wb") as f:
            for chunk in vol.read_file(path):
                f.write(chunk)
        return path + (f" -> {dst.name}" if n > 1 else "")

    with ThreadPoolExecutor(8) as pool:
        for i, line in enumerate(pool.map(fetch, new), 1):
            print(f"[{i}/{len(new)}] {line}")
    pulled |= set(new)
    manifest.write_text("\n".join(sorted(p for p in pulled if p)))
    print(f"{len(new)} new file(s); renders are in {out}/<subfolder>/")
    return pulled


def clear(vol, out: Path):
    for d in ("output", "temp"):  # empty the folders, never remove them: a running worker could not recreate output/ mid-render
        try:
            for e in vol.listdir(d):
                vol.remove_file(e.path, recursive=True)
                print(f"removed {e.path}")
        except FileNotFoundError:
            pass
    for e in vol.listdir("input"):
        if Path(e.path).name not in KEEP_INPUTS:
            vol.remove_file(e.path, recursive=True)
            print(f"removed {e.path}")
    (out / ".pulled").write_text("")
    print("volume cleared; the GUI's assets sidebar shows the old entries until you reload the page")


def main(out: Path, do_clear: bool):
    vol = modal.Volume.from_name(config.VOLUME_IO)
    pull(vol, out)
    if do_clear:
        clear(vol, out)


if __name__ == "__main__":
    main(Path(sys.argv[1]), "--clear" in sys.argv[2:])
