#!/bin/zsh
# Move files between the Modal volumes and this Mac.
#   tools/sync.sh pull              copy new renders to $SYNC_DIR/output (default ~/comfy-renders; each file once, deleted ones stay deleted)
#   tools/sync.sh push <path>       upload an image or folder to Modal's input dir
#   tools/sync.sh lora <file> [folder]           upload a model file (default folder: loras)
#   tools/sync.sh civitai <version-id|url> [folder]   download from Civitai (needs CIVITAI_TOKEN), then upload
#   tools/sync.sh hf <repo> <path-in-repo> [folder]   download from Hugging Face (HF_TOKEN for gated repos), then upload
#   tools/sync.sh workflows         upload workflows/ to the UI's saved workflows; numbered ones (NN-*.json) no
#                                   longer in workflows/ are removed there, workflows you saved in the GUI are kept
#   tools/sync.sh clear             pull, then delete every render (output/), preview (temp/) and upload (input/,
#                                   except KEEP_INPUTS in tools/pull.py) from the volume; resets $SYNC_DIR/output/.pulled
# Uploaded files are in the GUI dropdowns on the next page load (workflows: next open of the sidebar), no restart.
set -e
MODAL=${MODAL:-$HOME/.local/bin/modal}
SYNC_DIR=${SYNC_DIR:-$HOME/comfy-renders}  # local sync folder: renders are pulled here (an SD card, a Dropbox folder, anything)
REPO=$(cd "$(dirname "$0")/.." && pwd)
read -r V_MODELS V_DATA V_IO <<< "$(cd "$REPO" && uv run python -c 'from comfy_modal import config as c; print(c.VOLUME_MODELS, c.VOLUME_DATA, c.VOLUME_IO)')"
upload_model() {  # <local file> <models subfolder>
  [[ -f "$1" ]] || { echo "not a file: $1"; exit 1; }
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
    [[ -n "$2" ]] || { echo "usage: tools/sync.sh civitai <version-id or model page url> [folder]"; exit 1; }
    [[ -n "$CIVITAI_TOKEN" ]] || { echo "set CIVITAI_TOKEN (civitai.com/user/account > API Keys)"; exit 1; }
    # accept a bare version id, ...?modelVersionId=NNN, or .../api/download/models/NNN
    ID=$(echo "$2" | grep -oE 'modelVersionId=[0-9]+|download/models/[0-9]+|^[0-9]+$' | grep -oE '[0-9]+$')
    [[ -n "$ID" ]] || { echo "no version id found in: $2"; exit 1; }
    STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
    # -J -O keeps the filename Civitai sends; --fail turns a login page into an error
    (cd "$STAGE" && curl -sSL --fail -J -O "https://civitai.com/api/download/models/$ID?token=$CIVITAI_TOKEN")
    upload_model "$STAGE"/* "${3:-loras}"
    ;;
  hf)
    [[ -n "$3" ]] || { echo "usage: tools/sync.sh hf <owner/repo> <path/in/repo.safetensors> [folder]"; exit 1; }
    STAGE=$(mktemp -d); trap 'rm -rf "$STAGE"' EXIT
    AUTH=(); [[ -n "$HF_TOKEN" ]] && AUTH=(-H "Authorization: Bearer $HF_TOKEN")
    curl -sSL --fail "${AUTH[@]}" -o "$STAGE/$(basename "$3")" "https://huggingface.co/$2/resolve/main/$3"
    upload_model "$STAGE/$(basename "$3")" "${4:-loras}"
    ;;
  workflows)
    $MODAL volume put --force "$V_DATA" "$REPO/workflows" user/default/workflows
    $MODAL volume ls "$V_DATA" user/default/workflows --json | python3 -c 'import json,sys,os; [print(os.path.basename(e["filename"])) for e in json.load(sys.stdin)]' |
      grep -E '^[0-9]{2}[a-z]?-.*\.json$' | while read -r f; do
        [[ -f "$REPO/workflows/$f" ]] || { echo "removing $f"; $MODAL volume rm "$V_DATA" "user/default/workflows/$f"; }
      done
    ;;
  clear)
    [[ -d "$SYNC_DIR" ]] || { echo "sync folder not found: $SYNC_DIR; clearing without a pull would lose renders"; exit 1; }
    (cd "$REPO" && uv run tools/pull.py "$SYNC_DIR/output" --clear)  # pull, then delete through one SDK connection
    ;;
  *) echo "usage: tools/sync.sh pull | push <path> | lora <file> [folder] | civitai <id|url> [folder] | hf <repo> <path> [folder] | workflows | clear"; exit 1;;
esac
