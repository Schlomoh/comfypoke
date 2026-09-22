#!/usr/bin/env bash
# Move files between the Modal volumes and this Mac.
#   tools/sync.sh pull              copy new renders to $SYNC_DIR/output (default ~/comfy-renders; each file once, deleted ones stay deleted)
#   tools/sync.sh push <path>       upload an image or folder to Modal's input dir
#   tools/sync.sh lora <file> [folder]           upload a model file (default folder: loras)
#   tools/sync.sh civitai <id|model page url> [folder]   download from Civitai (needs CIVITAI_TOKEN), then upload
#   tools/sync.sh hf <repo> <path-in-repo> [folder]   download from Hugging Face (HF_TOKEN for gated repos), then upload
#   tools/sync.sh workflows         upload workflows/ to the UI's saved workflows; numbered ones (NN-*.json) no
#                                   longer in workflows/ are removed there, workflows you saved in the GUI are kept
#   tools/sync.sh workflows-save [message]   commit and push workflows/private/ (your own git checkout, private repo)
#   tools/sync.sh clear             pull, then delete every render (output/), preview (temp/) and upload (input/,
#                                   except KEEP_INPUTS in tools/pull.py) from the volume; resets $SYNC_DIR/output/.pulled
#   tools/sync.sh ls [vol] [path]   list files on a volume (io, models or data; default io)
#   tools/sync.sh cp <vol> <src> <dst>   copy on the volume, server-side, no download
#   tools/sync.sh mv <vol> <src> <dst>   move on the volume (copy then delete)
#   tools/sync.sh rm <vol> <path>        delete from the volume
# Uploaded files are in the GUI dropdowns on the next page load (workflows: next open of the sidebar), no restart.
set -e
MODAL=${MODAL:-$HOME/.local/bin/modal}
SYNC_DIR=${SYNC_DIR:-$HOME/comfy-renders}  # local sync folder: renders are pulled here (an SD card, a Dropbox folder, anything)
REPO=$(cd "$(dirname "$0")/.." && pwd)
# Tokens live in .env (git-ignored) so they survive between shells; the console writes it. Real
# environment variables win, so CIVITAI_TOKEN=... tools/sync.sh ... still overrides the file.
if [[ -f "$REPO/.env" ]]; then
  while IFS='=' read -r k v; do
    [[ "$k" =~ ^[A-Z_]+$ ]] && [[ -z "${!k}" ]] && export "$k=$v"
  done < "$REPO/.env"
fi
read -r V_MODELS V_DATA V_IO <<< "$(cd "$REPO" && uv run python -c 'from comfy_modal import config as c; print(c.VOLUME_MODELS, c.VOLUME_DATA, c.VOLUME_IO)')"
# A bar on a terminal, quiet when piped: curl's bar writes carriage returns that flood a log.
if [[ -t 2 ]]; then PROGRESS=(--progress-bar); else PROGRESS=(-sS); fi

# CIVITAI_TOKEN is appended to whatever download URL you paste, so the host has to be one you
# mean to hand your API key to. A link with /api/download/models/ in it is not proof of who is
# serving it. civitai.com is trusted by default; add a mirror you use on purpose with
# CIVITAI_HOSTS=civitai.red (in .env or in front of the command).
trusted_host() {  # <url>
  python3 - "$1" "${CIVITAI_HOSTS:-}" <<'PY'
import sys, urllib.parse
url, extra = sys.argv[1], sys.argv[2]
u = urllib.parse.urlparse(url)
allowed = {"civitai.com"} | {h.strip().lower() for h in extra.replace(" ", ",").split(",") if h.strip()}
host = (u.hostname or "").lower()
sys.exit(0 if u.scheme == "https" and any(host == a or host.endswith("." + a) for a in allowed) else 1)
PY
}

upload_model() {  # <local file> <models subfolder>
  [[ -f "$1" ]] || { echo "not a file: $1"; exit 1; }
  echo "uploading $(basename "$1") ($(du -h "$1" | cut -f1)) to $2 on $V_MODELS..."
  $MODAL volume put --force "$V_MODELS" "$1" "extra/$2/$(basename "$1")"
  echo "uploaded $(basename "$1") to $2; reload the GUI and it is in the dropdown"
}

case "$1" in
  pull)
    [[ -d "$SYNC_DIR" ]] || { echo "sync folder not found: $SYNC_DIR (set SYNC_DIR=... or create it)"; exit 1; }
    (cd "$REPO" && uv run tools/pull.py "$SYNC_DIR/output")  # each file once, see tools/pull.py
    ;;
  push)
    [[ -e "$2" ]] || { echo "usage: tools/sync.sh push <file-or-folder>"; exit 1; }
    NAME=$(basename "$2")
    $MODAL volume ls "$V_IO" "input/$NAME" >/dev/null 2>&1 && echo "warning: overwriting existing input/$NAME"
    $MODAL volume put --force "$V_IO" "$2" "input/$NAME"
    ;;
  lora)
    [[ -f "$2" ]] || { echo "usage: tools/sync.sh lora <file.safetensors> [folder]"; exit 1; }
    upload_model "$2" "${3:-loras}"
    ;;
  civitai)
    [[ -n "$2" ]] || { echo "usage: tools/sync.sh civitai <version id, model page url or download url> [folder]"; exit 1; }
    [[ -n "$CIVITAI_TOKEN" ]] || { echo "set CIVITAI_TOKEN (civitai.com/user/account > API Keys), or add it in the console under Tokens"; exit 1; }
    # A pasted download link is used exactly as it is: its query string carries fileId, type and
    # format, which choose *which* file of the version, and rebuilding the URL loses them. Only
    # the other forms, which carry no file choice, are turned into a civitai.com download URL.
    if [[ "$2" == *"/api/download/models/"* ]]; then
      URL="$2"
      trusted_host "$URL" || {
        echo "refusing to send CIVITAI_TOKEN to $(python3 -c 'import sys,urllib.parse; print(urllib.parse.urlparse(sys.argv[1]).hostname or "?")' "$URL")"
        echo "only https://civitai.com is trusted with the token by default."
        echo "if that mirror is one you trust, add it once:  echo CIVITAI_HOSTS=<host> >> .env"
        exit 1
      }
      [[ "$URL" == *"token="* ]] || URL+="$([[ "$URL" == *"?"* ]] && echo "&" || echo "?")token=$CIVITAI_TOKEN"
    elif [[ "$2" =~ modelVersionId=([0-9]+) ]]; then URL="https://civitai.com/api/download/models/${BASH_REMATCH[1]}?token=$CIVITAI_TOKEN"
    elif [[ "$2" =~ ^[0-9]+$ ]]; then URL="https://civitai.com/api/download/models/$2?token=$CIVITAI_TOKEN"
    elif [[ "$2" =~ /models/([0-9]+) ]]; then
      echo "model page, looking up its newest version..."
      ID=$(curl -sS --fail "https://civitai.com/api/v1/models/${BASH_REMATCH[1]}" |
        python3 -c 'import json,sys; m=json.load(sys.stdin); v=m["modelVersions"][0]; print(v["id"], "-", m["name"], v["name"], file=sys.stderr); print(v["id"])') ||
        { echo "could not read that model from the Civitai API"; exit 1; }
      URL="https://civitai.com/api/download/models/$ID?token=$CIVITAI_TOKEN"
    else
      echo "no model or version id found in: $2"
      echo "paste the model page URL (civitai.com/models/NNN), the Download button's link, or a bare version id"
      exit 1
    fi
    STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
    # Download to a fixed name so --retry can resume with -C - after a reset mid-transfer;
    # the real filename comes from the Content-Disposition header curl saves alongside it.
    curl -L --fail "${PROGRESS[@]}" --retry 5 --retry-delay 2 -C - \
      -D "$STAGE/.headers" -o "$STAGE/.download" "$URL" ||
      { echo "download failed; re-running is safe"; exit 1; }
    NAME=$(sed -nE 's/.*[Ff]ilename="?([^";]+)"?.*/\1/p' "$STAGE/.headers" | tail -1 | tr -d '\r')
    [[ -n "$NAME" ]] || NAME="civitai-${URL##*/models/}"; NAME="${NAME%%\?*}"
    mv "$STAGE/.download" "$STAGE/$NAME"
    upload_model "$STAGE/$NAME" "${3:-loras}"
    ;;
  hf)
    [[ -n "$3" ]] || { echo "usage: tools/sync.sh hf <owner/repo> <path/in/repo.safetensors> [folder]"; exit 1; }
    STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
    AUTH=(); [[ -n "$HF_TOKEN" ]] && AUTH=(-H "Authorization: Bearer $HF_TOKEN")
    curl -L --fail "${PROGRESS[@]}" --retry 5 --retry-delay 2 -C - \
      "${AUTH[@]}" -o "$STAGE/$(basename "$3")" "https://huggingface.co/$2/resolve/main/$3" ||
      { echo "download failed; re-running is safe"; exit 1; }
    upload_model "$STAGE/$(basename "$3")" "${4:-loras}"
    ;;
  ls|cp|mv|rm)
    (cd "$REPO" && uv run tools/files.py "$@")
    ;;
  workflows-save)
    PRIV="$REPO/workflows/private"
    [[ -d "$PRIV/.git" ]] || { echo "no git checkout at workflows/private (see the README's Private workflows section)"; exit 1; }
    git -C "$PRIV" add -A
    git -C "$PRIV" diff --cached --quiet && { echo "nothing to save"; exit 0; }
    git -C "$PRIV" commit -m "${2:-workflow work}"
    git -C "$PRIV" push
    ;;
  workflows)
    # Staged first, because workflows/private is its own git checkout and `modal volume put`
    # takes a directory whole: without this its .git would be uploaded object by object.
    STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
    (cd "$REPO/workflows" && find . -name .git -prune -o -type f -print0 |
      while IFS= read -r -d "" f; do mkdir -p "$STAGE/$(dirname "$f")"; cp "$f" "$STAGE/$f"; done)
    $MODAL volume put --force "$V_DATA" "$STAGE" user/default/workflows
    $MODAL volume ls "$V_DATA" user/default/workflows --json | python3 -c 'import json,sys,os; [print(os.path.basename(e["filename"])) for e in json.load(sys.stdin)]' |
      grep -E '^[0-9]{2}[a-z]?-.*\.json$' | while read -r f; do
        [[ -f "$REPO/workflows/$f" ]] || { echo "removing $f"; $MODAL volume rm "$V_DATA" "user/default/workflows/$f"; }
      done
    ;;
  clear)
    [[ -d "$SYNC_DIR" ]] || { echo "sync folder not found: $SYNC_DIR; clearing without a pull would lose renders"; exit 1; }
    (cd "$REPO" && uv run tools/pull.py "$SYNC_DIR/output" --clear)  # pull, then delete through one SDK connection
    ;;
  *) echo "usage: tools/sync.sh pull | push <path> | lora <file> [folder] | civitai <id|url> [folder] | hf <repo> <path> [folder] | workflows | workflows-save [msg] | clear"
     echo "                    ls [vol] [path] | cp <vol> <src> <dst> | mv <vol> <src> <dst> | rm <vol> <path>"; exit 1;;
esac
