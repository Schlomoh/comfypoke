# comfypoke

![comfypoke-banner](assets/github-comfypoke-banner.webp)

ComfyUI on Modal: a GUI that is always up and a GPU you poke awake, which naps when you are done.

ComfyUI split across two [Modal](https://modal.com) containers. A CPU container runs the full GUI
around the clock, at CPU pricing. A GPU container starts when a prompt is queued, renders it, and
stops itself after 5 idle minutes. Models, workflows and output files persist across restarts on
three Modal volumes.

The GUI shows the GPU worker's state, an idle countdown and a running cost estimate, with buttons
to wake it early, keep it warm for a set time, or stop it. Three workflows ship by default:
Z-Image-Turbo and FLUX.2 klein for text to image, and a SeedVR2 upscale.

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
modal deploy modal_app.py     # the first run downloads about 45 GB of models to a volume
tools/sync.sh workflows       # upload the workflows in workflows/
```

The `.access_key` step is not optional: without a key the container starts with no login gate
and the GUI is public.

Open the URL the deploy prints. The browser asks for a name and password: enter anything as the
name and the contents of `.access_key` as the password. A cookie keeps you signed in for 30 days.
Tools and scripts can use `?key=<key>` in the URL instead.

Run `uv run tools/check.py --stop-stale` after a deploy. It stops leftover containers from the
previous version and runs the acceptance test: authentication, the websocket, model listing, a
small render, queue and history state, cancel and interrupt, two browsers at once, and a LoRA
upload rendered on the warm worker. About a minute, a few cents.

## Daily use

- Press `w` in the GUI for the workflows. `01` renders with Z-Image-Turbo in about ten seconds
  once the worker is warm, `02` with FLUX.2 klein, `03` upscales an image with SeedVR2 to the size
  set in megapixels; upload the image with the node's button before queueing it.
- The GPU badge sits in the sidebar (the chip icon) and as a small pill you can drag anywhere or
  close. Cold means nothing is billed. Wake boots the worker before you need it; measured on an L40S,
  that took about 100 seconds cold and 30 seconds when Modal still had the image cached. Keep warm pings it inside the idle window for
  the chosen time. Stop shuts it down now.
- LoRAs: `tools/sync.sh civitai <version id or page url>` (needs `CIVITAI_TOKEN`, an API key from
  civitai.com/user/account), `tools/sync.sh hf <owner/repo> <file>` (`HF_TOKEN` only for gated
  repos), or `tools/sync.sh lora <file>` for a file on disk. Each shows up in the LoRA dropdown on
  the next page load; put a LoraLoaderModelOnly node between the model and the sampler to use it.
  Add a folder as the last argument for other kinds of files, for example `upscale_models`.
- `tools/sync.sh pull` copies new renders to your sync folder (`SYNC_DIR`, default
  `~/comfy-renders`), each file once. `tools/sync.sh clear` pulls, then empties output, previews and
  uploads on the volume. `tools/sync.sh push <file or folder>` uploads images to the input folder.
- `uv run tools/console.py` is an arrow-key menu over all of the above plus status, deploy, the
  acceptance check and logs.
- `uv run tools/render.py turbo "a prompt"` renders without the GUI; `tools/render.py api
<prompt.json>` submits any API-format prompt, which the GUI exports under Workflow, Export (API).

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
| `tools/`                      | Console, sync, render, acceptance check, workflow builder                            |
| `workflows/`                  | The default workflows                                                                |

## Costs

Modal bills per second while a container runs. The GUI runs on a small CPU container that sleeps
after ten idle minutes; the worker is an L40S by default at about $1.95 per hour list price and
sleeps five minutes after its last render. Estimates from measured times, list prices, no
storage:

| Session | GPU time billed | About |
|---|---|---|
| Twenty renders spread over an hour (Z-Image-Turbo, 10 s each, worker awake between them for a while) | about 15 min | $0.50 plus a few cents of CPU |
| An afternoon of steady iteration, three hours, worker kept awake | 3 h | $6 |
| A month of occasional use, ten one-hour sessions | about 2.5 h | $5 plus volume storage for about 45 GB of models |

A cold boot costs its 100 seconds like any other GPU time, about five cents. Volumes are billed
by stored size at Modal's storage rate.

## Workflow packs

The three workflows here cover text to image and upscaling. Packs with more involved pipelines,
masked outfit changes with the body pinned, head swaps for consistent characters, clean-up and
restore, editing inside a mask, are sold separately and drop into the same `workflows/` folder:
they upload with the same `tools/sync.sh workflows` command. Link to follow.

## License

MIT. The models have their own licenses; the three included here are Apache 2.0.
