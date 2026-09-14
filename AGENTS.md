# Working on this repo

Notes for coding agents and for people who like a map. The README explains the setup; this file
explains where things are and how to change them without breaking the deployment.

## Shape

- Two Modal classes in one app: `UI` (CPU, `comfy_modal/ui.py`) and `Worker` (GPU,
  `comfy_modal/worker.py`). Both build from the image in `comfy_modal/image.py`. Adding a
  container role means a new module plus one import in `modal_app.py`.
- Custom nodes in `comfy_nodes/` run inside ComfyUI in the containers. They cannot import
  `comfy_modal`, so everything they need arrives through environment variables. The contract is
  `CONTAINER_ENV` in `comfy_modal/config.py`: the nodes read exactly those names and fail at
  start when one is missing.
- The relay (`comfy_nodes/gpu_relay/__init__.py`) is an aiohttp middleware on the UI's server. It
  intercepts POST `/prompt`, `/interrupt`, `/queue` and the job cancel routes, and registers
  `/gpu/*` routes for the badge. `js/gpu_status.js` is the frontend half.
- The worker's `run` is an async generator; the relay consumes it with `remote_gen`. Messages are
  `(kind, payload)` tuples: `json` (a ComfyUI websocket message), `bytes` (a preview), `log` (lines
  from the worker's ComfyUI log), `history` (the final history entry).
- Volumes: `comfy-models` at `/cache` (Hugging Face cache plus `extra/<folder>/` for uploads),
  `comfy-io` at `/io` (`input`, `output`, `temp`), `comfy-data` at `/data` (ComfyUI's user
  directory, UI only). The io volume is reloaded before each `executed` message and on each
  `/object_info` request so the GUI can serve new files. Hand-uploaded files on the models volume
  are copied in, not reloaded, on `/object_info`, because ComfyUI keeps loaded model files open and
  a reload would fail. The data volume is reloaded on `/userdata` requests, which is how workflows
  uploaded with `tools/sync.sh workflows` appear in the running GUI.

## Changing things

- Models and node packs: `comfy_modal/catalog.py`, then deploy. Keep the model layer before the
  node-pack layer in `image.py`, so a pack change never re-downloads models.
- Tunables: `comfy_modal/config.py` only. Never hard-code a volume name, port or app name in a
  node or a tool; tools read them through `from comfy_modal import config`.
- Workflows: `tools/build_workflows.py` writes both the GUI JSON and the API prompt. New node
  types need an entry in `SPEC` and `WIDGET_NAMES` in `tools/workflow_graph.py`: the input names
  in ComfyUI's order and the widget names in the order the node declares them. Read them from the
  running server with `GET /api/object_info/<NodeType>`. A wrong order does not error: the GUI shows
  the values under the wrong widgets and the API prompt sends them to the wrong inputs.
- Console: `tools/console.py` is a questionary menu; each entry is a function in the `ACTIONS` table that
  shells out to the other tools and prints the command it runs. Add an entry there, not a new script.
- Frontend: the badge is plain JS on ComfyUI's extension API (`app.registerExtension`,
  `app.extensionManager.registerSidebarTab`). No build step.

## Verifying

- `uv run tools/check.py --stop-stale` against the deployed URL is the acceptance test. Run it
  after every deploy and treat a failure as a bug in the change, not in the check, until proven
  otherwise. It renders a small image, so it costs a few cents and needs a warm or cold worker
  either way.
- `uv run tools/render.py api tools/<name>_api.json` renders a workflow headlessly; the builder
  writes those files. Look at the output image before judging a change to a workflow.
- `modal app logs comfy` streams both containers' logs; the GUI's logs panel shows the worker's
  lines prefixed with `[gpu]`.

## Conventions

- Small modules, one concern each, comments only where the reason is not obvious from the code.
- The deploy id gate: every deploy mints `DEPLOY_ID` on the laptop and ships it to both classes;
  a worker from an older deploy refuses new prompts and the relay retries once on a fresh container.
  Keep that in mind when adding worker methods: `ping` and `stop` are exempt on purpose.
- Never commit `.access_key`. Tokens for Civitai and Hugging Face are environment variables on
  the laptop, never in the repo or the image.
