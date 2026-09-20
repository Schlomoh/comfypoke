# comfypoke

![comfypoke-banner](assets/github-comfypoke-banner.webp)

ComfyUI on Modal. The GPU sleeps while you build the graph, and nothing about the box is locked
down: any node pack from the registry, your own LoRAs, your own models, your own Modal account.

A GUI that is always up and a GPU you poke awake, which naps when you are done.

ComfyUI split across two [Modal](https://modal.com) containers. A CPU container runs the full GUI
around the clock, at CPU pricing. A GPU container starts when a prompt is queued, renders it, and
stops itself after 5 idle minutes. Models, workflows and output files persist across restarts on
three Modal volumes.

The GUI shows the GPU worker's state, an idle countdown and a running cost estimate, with buttons
to wake it early, keep it warm for a set time, or stop it. Five workflows ship by default:
Z-Image-Turbo, FLUX.2 klein and Krea 2 (Turbo and RAW) for text to image, and a SeedVR2 upscale.

## How it works

```
browser ── https ──▶ UI container (CPU, ComfyUI GUI)
                        │  relays each prompt
                        ▼
                     Worker container (GPU, headless ComfyUI)
                        │  streams progress, previews, results back
        volumes:  models (downloads + your LoRAs)   io (input, output, previews)   data (saved workflows, settings)
```

The UI container runs ComfyUI in CPU mode and a custom node, `gpu_relay`, that intercepts every
prompt. It validates the graph locally, so node errors show in the GUI, registers the job in its
own queue, and streams the worker's websocket messages to your browser. The worker boots ComfyUI
with the GPU, renders, writes to the shared io volume, and stays alive for five minutes after its
last job. A GPU badge in the GUI shows its state, an idle countdown and a cost estimate, and lets
you wake it, keep it warm for a chosen time, or stop it now.

## Setup

You need Python 3.12 or newer, [uv](https://docs.astral.sh/uv/), and a Modal account.

```bash
uv sync                       # local tools only; the app runs on Modal
uv tool install modal && modal setup
python3 -c "import secrets; print(secrets.token_urlsafe(24))" > .access_key
modal deploy modal_app.py     # the first run downloads about 80 GB of models to a volume
tools/sync.sh workflows       # upload the workflows in workflows/
```

The `.access_key` step is not optional: without a key the container starts with no login gate
and the GUI is public.

Open the URL the deploy prints. A login page asks for the key: paste the contents of
`.access_key`. A cookie keeps you signed in for 30 days. Tools and scripts can use `?key=<key>`
in the URL instead, or send the key as the password in an Authorization header.

Run `uv run tools/check.py --stop-stale` after a deploy. It stops leftover containers from the
previous version and runs the acceptance test: authentication, the websocket, model listing, a
small render, queue and history state, cancel and interrupt, two browsers at once, and a LoRA
upload rendered on the warm worker. About a minute, a few cents.

## Daily use

### The console

```bash
uv run tools/console.py
```

This is the front door. An arrow-key menu over everything in this section, so you do not have
to remember any of the commands below. Every action prints the command it runs before running
it, so it doubles as a way to learn them.

| Menu | What it does |
| --- | --- |
| Status | the UI URL, which containers are running, which models you uploaded |
| Open GUI | opens the browser, with or without the key in the URL |
| Wake worker | one small render, so the GPU is warm before you start |
| Sync | pull renders, push a file, push `workflows/`, or clear the volume |
| Files | browse the volumes; copy, move, delete, or send a file to another deployment |
| Models | list, add from disk, Civitai or Hugging Face, remove |
| Tokens | store `CIVITAI_TOKEN` and `HF_TOKEN` so every later session has them |
| Deploy | deploy, then offer to run the acceptance check |
| Check | the acceptance check on its own |
| Stop | stop the running containers, or take the whole app offline |
| Logs | stream the app log for N seconds |

`uv run tools/console.py --status` and `--logs 30` work without a terminal, for scripts.

### In the GUI

- Press `w` for the workflows. `01` renders with Z-Image-Turbo in about ten seconds once the
  worker is warm, `02` with FLUX.2 klein, `04` with Krea 2 Turbo (12B, 8 steps, the best-looking
  of the three and the slowest), `03` upscales an image with SeedVR2 to the size set in
  megapixels; upload the image with the node's button before queueing it.
- `05` is Krea 2 RAW, the same model undistilled: 52 steps at CFG 3.5 instead of 8 at CFG 1, so a
  minute or two per image rather than seconds. It takes a real negative prompt, which Turbo cannot,
  and it is the checkpoint to train a LoRA on. For everyday renders, use `04`.
- The GPU badge sits in the sidebar (the chip icon) and as a small pill you can drag anywhere or
  close. Cold means nothing is billed. Wake boots the worker before you need it; measured on an
  L40S, that took about 100 seconds cold and 30 seconds when Modal still had the image cached.
  Keep warm pings it inside the idle window for the chosen time. Stop shuts it down now.

### From the terminal

- **Tokens.** Civitai downloads need `CIVITAI_TOKEN` (an API key from civitai.com/user/account);
  Hugging Face needs `HF_TOKEN` only for gated repos. The console's Tokens menu writes them to
  `.env`, which is git-ignored and which `tools/sync.sh` reads, so you set them once. A real
  environment variable still wins over the file. `modal deploy` reads `HF_TOKEN` the same way
  and ships it to the image build, so a gated model in `comfy_modal/catalog.py` needs nothing
  else; a Modal secret named `huggingface-secret` also works and takes precedence.
- **LoRAs and other models.** `tools/sync.sh civitai <url>` takes the model page URL, the
  Download button's link, or a bare version id; a model page resolves to its newest version. A
  download link is used exactly as pasted, host and all, because its query string chooses which
  file of the version you get. Interrupted downloads retry and resume. The token is only ever
  sent to `civitai.com`; a link on any other host is refused until you name it in
  `CIVITAI_HOSTS` (in `.env`), because `/api/download/models/` in a URL is not proof of who is
  serving it.
  `tools/sync.sh hf <owner/repo> <file>` and `tools/sync.sh lora <file>` cover Hugging Face and a
  file on disk. Each shows up in the dropdown on the next page load; put a LoraLoaderModelOnly
  node between the model and the sampler to use it. Add a folder as the last argument for other
  kinds of files, for example `upscale_models`.
- **Files on the volumes.** `tools/sync.sh ls [io|models|data|<volume name>] [path]` lists, and
  `cp`, `mv` and `rm` act on a volume without a round trip through this Mac. Any volume in the
  workspace works by name, not just this deployment's three. `rm` on a folder lists what is
  inside and refuses without `-r`, because Modal volumes have no undelete. Copies are
  server-side, so moving a render into `input/` to upscale it is instant however big it is:
  `tools/sync.sh cp io output/ComfyUI_00012_.png input/ComfyUI_00012_.png`.
- **Between two deployments.** `uv run tools/transfer.py --list` shows the volumes in the
  workspace, and `uv run tools/transfer.py <src-volume> <path> <dst-volume> [path] [--move]`
  copies between any two of them, so a LoRA can go from one comfypoke setup to another:
  `uv run tools/transfer.py comfypoke-models extra/loras/mine.safetensors other-models`.
  Modal cannot copy across volumes by itself, so this runs a small CPU container with both
  mounted and copies there; the file never travels through this Mac. Both volumes have to be in
  the same Modal workspace. The console does the same thing from Files, under a chosen file.
- **Renders in and out.** `tools/sync.sh pull` copies new renders to your sync folder
  (`SYNC_DIR`, default `~/comfy-renders`), each file once. `tools/sync.sh clear` pulls, then
  empties output, previews and uploads on the volume. `tools/sync.sh push <file or folder>`
  uploads images from this Mac to the input folder.
- **Headless renders.** `uv run tools/render.py turbo "a prompt"` renders without the GUI;
  `tools/render.py api <prompt.json>` submits any API-format prompt, which the GUI exports under
  Workflow, Export (API).

## Adding things

- **A model**: one line in `comfy_modal/catalog.py` (Hugging Face repo, file, ComfyUI models
  folder), then `modal deploy modal_app.py`. The download layer is cached, so a new file downloads
  once and the rest is untouched. Files you upload by hand go to `extra/<folder>/` on the models
  volume through `tools/sync.sh` and need no deploy.
- **A custom node pack**: its registry id in `NODE_PACKS` in the same file, then deploy. Packs are
  installed in a layer after the models, so adding one does not re-download anything.
- **A workflow**: build it in the GUI and save it, which stores it on the data volume, or add a
  function to `tools/build_workflows.py`, which writes the GUI JSON and an API-format prompt for
  headless rendering. `tools/sync.sh workflows` uploads `workflows/` and removes numbered
  workflows you have deleted; workflows saved from the GUI are left alone.
- **Another GPU**: `MODAL_GPU=H100 modal deploy modal_app.py`. Every other tunable, idle windows,
  ports, volume names, the rate shown in the badge, sits in `comfy_modal/config.py`.

## Layout

| Path                          | What it is                                                                           |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| `modal_app.py`                | Deploy entry point; imports the two container classes                                |
| `comfy_modal/config.py`       | Every tunable and the env-var contract with the custom nodes                         |
| `comfy_modal/catalog.py`      | Models and node packs to install                                                     |
| `comfy_modal/image.py`        | The container image: ComfyUI, node packs, model downloads                            |
| `comfy_modal/ui.py`           | The CPU class that serves the GUI                                                    |
| `comfy_modal/worker.py`       | The GPU class: runs prompts, streams progress and logs back, publishes its heartbeat |
| `comfy_modal/comfy.py`        | Starts ComfyUI inside a container                                                    |
| `comfy_nodes/gpu_relay`       | Custom node in the UI container: relays prompts, serves the GPU badge                |
| `comfy_nodes/access_key`      | Custom node: the login gate                                                          |
| `comfy_nodes/extra_models`    | Custom node: makes hand-uploaded models visible without a restart                    |
| `comfy_nodes/modal_proxy_fix` | Custom node: keeps the websocket alive behind Modal's proxy                          |
| `tools/`                      | Console, sync, volume files, cross-deployment transfer, render, check, workflows     |
| `workflows/`                  | The default workflows                                                                |

## Costs

Modal bills per second while a container runs. The GUI runs on a small CPU container that sleeps
after ten idle minutes; the worker is an L40S by default at about $1.95 per hour list price and
sleeps five minutes after its last render. Estimates from measured times at list prices,
compute only:

| Session | GPU time billed | About |
|---|---|---|
| Twenty renders spread over an hour (Z-Image-Turbo, 10 s each, worker awake between them for a while) | about 15 min | $0.50 plus a few cents of CPU |
| An afternoon of steady iteration, three hours, worker kept awake | 3 h | $6 |
| A month of occasional use, ten one-hour sessions | about 2.5 h | $5 |

A cold boot costs its 100 seconds like any other GPU time, about five cents.

Storage for the models is free in practice: Modal's volume pricing includes 1 TiB per month at
no charge, and the default models are about 80 GB. Modal's Starter plan is also $0 per
month with $30 of compute included, so the occasional-use row above sits inside the free tier.
Check [modal.com/pricing](https://modal.com/pricing) for current rates.

## Why not something else

Worth being straight about, because the answer is not always this.

- **[Comfy Cloud](https://comfy.org/pricing)** is Comfy Org's own hosted ComfyUI and it also
  does not bill you while you edit a graph. It is the better choice if you want zero setup.
  The trade is a fixed set of custom nodes, your own LoRAs on the higher tiers, and a cap on
  how long one workflow may run. comfypoke has no node allowlist and no run ceiling, and costs
  a `modal deploy` to get there.
- **Hourly hosts** like RunComfy and ThinkDiffusion bill the GPU for every minute the machine
  is up, including the time you spend wiring nodes. Their auto-stop timers cap the damage but
  do not stop the meter.
- **Renting a pod** on RunPod or Vast.ai is cheaper per GPU hour than Modal, plainly. It is
  the better deal if you render for hours at a stretch. This is for bursty work, where the
  bill is mostly idle time and here idle time is five minutes and then nothing.
- **Your own GPU** wins if you use it daily. 48 GB of VRAM is the reason not to buy one.

## Workflow packs

The three workflows here cover text to image and upscaling. Packs with more involved pipelines,
masked outfit changes with the body pinned, head swaps for consistent characters, clean-up and
restore, editing inside a mask, are sold separately and drop into the same `workflows/` folder:
they upload with the same `tools/sync.sh workflows` command. Link to follow.

## License

MIT. The models have their own licenses. Z-Image-Turbo, FLUX.2 klein 4B and SeedVR2 are
Apache 2.0. FLUX.2 klein 9B is under Black Forest Labs' own licence and is gated on Hugging
Face: accept it at huggingface.co/black-forest-labs/FLUX.2-klein-9B and have `HF_TOKEN` set
when you deploy, or remove those two lines from `comfy_modal/catalog.py`. Krea 2 Turbo is under
the Krea 2 Community License (huggingface.co/Comfy-Org/Krea-2), which is not an open-source
licence: read it before you use its output commercially.
