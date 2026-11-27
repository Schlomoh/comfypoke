# Working on this repo

Notes for coding agents and for people who like a map. The README explains the setup; this file
explains where things are and how to change them without breaking the deployment.

## Shape

- Two Modal classes in one app: `UI` (CPU, `comfy_modal/ui.py`) and `Worker` (GPU,
  `comfy_modal/worker.py`). Both build from the image in `comfy_modal/image.py`. Adding a
  container role means a new module plus one import in `modal_app.py`.
- A third, lighter piece: the studio endpoint (`comfy_modal/studio.py`, `studio_api.py`), a
  FastAPI function on its own slim image that serves the phone app in `studio/` (React, Vite,
  TypeScript; `studio/dist` must be built before a deploy) and calls `Worker` directly with the
  graphs in `comfy_modal/graphs.py`. Jobs live in that one container's memory
  (`max_containers=1`) and stream as server-sent events that end after 100 s and resume with
  Last-Event-ID, because Modal cuts any HTTP response at 150 s. Images reach the phone through
  `SaveImageWebsocket` and are stored in the browser's IndexedDB; nothing is written to a volume.
  Every image crosses Modal sealed (`comfy_modal/seal.py`): the phone derives an AES-GCM transport
  key from the workspace key and the deploy's key id, and sends it with each request wrapped for the worker's RSA-OAEP key,
  which each deploy mints on the laptop (private half in the Worker's Secret only). `Worker.run`
  opens the prompt's images before ComfyUI sees them and seals every image frame before it leaves,
  so the studio holds ciphertext and no key. A new graph that carries an image must carry it in a
  `StudioImageBase64` node, the only one the worker opens, and output only through
  `SaveImageWebsocket`: the worker refuses a keyed graph with any other output node, and passes back
  only the message types the studio reads. The GUI's prompts carry no key and are not encrypted.
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
- Volumes: `comfypoke-models` at `/cache` (Hugging Face cache plus `extra/<folder>/` for uploads),
  `comfypoke-io` at `/io` (`input`, `output`, `temp`), `comfypoke-data` at `/data` (ComfyUI's user
  directory, UI only). The io volume is reloaded before each `executed` message and on each
  `/object_info` request so the GUI can serve new files. Hand-uploaded files on the models volume
  are symlinked into `models/<folder>/` from the mount before every request that lists or
  validates models (`/object_info`, the model sidebar, POST `/prompt`): a tab left open across a
  container restart never asks for `/object_info` again. A file uploaded after the
  container started needs a reload of the models volume first, and on a worker with a model loaded
  that reload fails, so only that file is copied in through the volume API. Never copy the whole
  `extra/` tree: it is over a hundred gigabytes. The data volume is reloaded on `/userdata` requests, which is how workflows
  uploaded with `tools/sync.sh workflows` appear in the running GUI.

## Changing things

- Models and node packs: `comfy_modal/catalog.py`, then deploy. Everything the image installs is pinned
  (`tests/test_pins.py` checks): a pack by registry version in `NODE_PACKS`, a model repo by commit in `REVISIONS`
  (never rename a repo there, its cache folder would download again), Python packages in
  `comfy_modal/requirements-image.txt`, which Dependabot watches. A bump is deliberate: read the pack's changes first.
  The image installs ComfyUI without ComfyUI-Manager. Files from Civitai or Hugging Face go straight
  into the models volume from Modal's side: `tools/sync.sh civitai|hf` (and the console) call `tools/fetch.py`,
  which runs `comfy_modal/fetch.py`. The token never reaches Modal: `tools/fetch.py` sends it only to its own host
  (`config.TOKEN_HOSTS`, https) and passes on the signed CDN link that host redirects to. Only `.safetensors` and
  `.gguf` are fetched or uploaded unless `--allow-pickle` (`ALLOW_PICKLE=1` for sync.sh). `--local` is the old way, through
  the laptop. Keep the model layer before the
  node-pack layer in `image.py`, so a pack change never re-downloads models.
- Tunables: `comfy_modal/config.py` only. Never hard-code a volume name, port or app name in a
  node or a tool; tools read them through `from comfy_modal import config`.
- Workflows: `tools/build_workflows.py` writes both the GUI JSON and the API prompt, for every
  numbered workflow except `08`, which was built in the GUI and has no API prompt. New node
  types need an entry in `SPEC` and `WIDGET_NAMES` in `tools/workflow_graph.py`: the input names
  in ComfyUI's order and the widget names in the order the node declares them. Read them from the
  running server with `GET /api/object_info/<NodeType>`. A wrong order does not error: the GUI shows
  the values under the wrong widgets and the API prompt sends them to the wrong inputs.
- Studio: its graphs are `comfy_modal/graphs.py`, built with `comfy_modal/graph.py`: `G.add` hands out node ids,
  so no id means anything. A node the studio watches carries a `stage` (what the phone shows while it runs) or a
  `role` (`sampler`, `dresser`, `swapper`, `upscaler`, `output`) in its `_meta`; the API and the mock read those
  back. A model family (encoder, VAE, sampling) is one entry in `FAMILIES`; a file tested with the studio goes in
  `VERIFIED` with its settings; a model file format is one entry in `LOADERS` plus its node pack.
- Tests: `uv run pytest -q tests` builds every graph (`tests/samples.py`) and checks it against ComfyUI's node
  definitions in `tests/object_info.json`; after adding a node type or pack, deploy and refresh that file with
  `uv run tools/object_info_snapshot.py`. `npm --prefix studio test` runs vitest on the pure domain code. CI runs both.
- Studio app layers, each importing only from the ones below it (lint enforces it): `src/ui` (the
  primitives: Button, Chip, Segmented, Checkbox, fields, Modal and Sheet, Popover and Tip on the native Popover
  API, Note; the only place a raw `<button>`, `<input>` or `<dialog>` may appear), `src/domain` (plain TypeScript: the recipe, its
  rows and presets in `rows.ts`, `compose.ts`, versions, `batch.ts` that turns versions and seeds into
  one job each, parsing of stored data), `src/data` (the API client, TanStack Query in `queries.ts`,
  IndexedDB in `db/`), `src/state` (Jotai atoms, one store per open workspace; the jobs runner;
  actions such as reuse, upscale, delete, step), then `src/features/*` (one folder per screen part)
  and `src/app` (the shell and layout; on a desktop a row's sheet opens over the editor's column instead of a modal,
  `ui/pane.tsx`, so the image stays in sight). Style comes from the primitives' variants; a new look is a new
  variant, not classes restated at the call site. `npm --prefix studio run check` is type-check,
  type-aware oxlint and oxfmt; `run fix` applies what can be fixed. The phone keeps everything in
  IndexedDB (`studio/src/data/db/schema.ts`); a schema change there is a new `db.version(n)`, never an edit of
  an old one, or existing phones lose their library. A workspace's records are sealed with its key
  (`studio/src/data/crypto.ts`): new per-workspace data goes through `sealJson`/`sealBlob` and carries
  `ws`, never in the clear or in localStorage. WebCrypto cannot run inside a Dexie upgrade, so
  moving data between tables is a function like `migrate()`, run before the start screen.
  Upscales are `graphs.upscale` (workflow 03's SeedVR2 chain, optional img2img retouch first); the
  image arrives in the prompt as base64 through `comfy_nodes/studio_image`. Edits happen in the Edit tab
  (`studio/src/features/edit`) on the image the stage shows. The mask is made from the bar under the stage
  (`mask-tools.tsx`: brush, eraser, tap, find…, invert and clear) and built on the phone as steps
  (`edit/mask.ts`, listed and removable in `mask-summary.tsx`): areas SAM 3.1 found through `/api/mask`
  (`graphs.mask`, white on black) by words (`use-find.ts`) or by tapped points (`use-taps.ts`), brush and eraser
  strokes, invert, clear; it is sent exactly as shown, so the server runs no SAM of its own for an edit. A
  People/Repaint choice (`editAtom.mode`) picks the chain. Repaint is `graphs.inpaint`: dressing's chain with no body,
  Z-Image's inpainting controlnet drawing the words (the person's Who, Look and Wearing after them) and a picked look
  finishing it lightly. No edit uses LanPaint: Krea 2 through it at full strength drew objects into plain skin, and a
  crop of 1.5x the mask let the whole picture's prompt be drawn into a small area, so the crop is 3x. People
  (`edit/people/`) works on everyone at once: `/api/faces` (`graphs.faces`, StudioFaceLabels) finds every face and
  guesses whose it is by face photo, then side (`comfy_nodes/studio_face/assign.py`), as one sealed label image the
  phone reads (`facesOf` in `domain/people.ts`); the faces are outlined on the stage in each person's color and each
  gets a card: who, a new outfit over a part ("all clothes" and the like), its face redrawn (off to start). Every mask is kept by a
  key (`maskKey` in `edit/state.ts`): the image's own for Repaint, `<render id>:<face>` for a person, and the bar's
  tools, taps, finds and the mask list edit whichever key is current (`use-mask-key.ts`: the selected person in
  People). The masks, the people found and their fitted bodies are kept on the phone per image (`edit/keep.ts`, Dexie
  table `edits`, sealed), read when the image first comes on the stage, and the tab's choices with the workspace; People
  looks for faces by itself only after that read. A dressed person's card has two steps, each run only when asked for and seen before it is used. Their area
  (required: Dress stays off without one) is found by "find area" (`/api/areas`, `graphs.areas`: SAM's find by words
  cut to their silhouette, SAM with their RT-DETR box and no words, `StudioPersonBox`; `use-areas.ts`) as the first
  step of their mask, to edit, or painted. Their body (optional) is fitted by "fit body" (`/api/body`, `graphs.body`:
  SAM 3D Body for their box, as depth, `use-body.ts`), kept in `bodiesAtom` and drawn under the masks. `/api/people`
  (`graphs.people`) sends it as one render: each dressed person over their mask as shown, held to their depth when
  sent, by workflow 08's chain (`_dressed`: the depth into Z-Image's Fun Controlnet at the hold, then optionally a
  plain light finish); the server finds and fits nothing for it. Then each face picked gets the face pass with its own
  words and LoRAs (`facePerson` in `domain/face.ts`).
  Outfits are a person's Wearing row of the Prompt tab (`domain/outfits.ts`); versions go side by side
  (`sideBySide`), one render per version, each `editAtom.takes` times with its own seed. Who and Look go into the
  prompt, never Doing (`portrait` in `compose.ts`, switch `editAtom.portrait`). The stage stays on the source:
  results land in its lineage (`edit/edit-lineage.tsx`, from `Job.source`; a tap on one edits it), a finished job never takes the stage,
  and an image without a mask can take its source's. "before"
  (or C held) shows the source under the mask (`peekAtom`). The passes are chips (`edit/passes.tsx`). `/api/mask`,
  `/api/faces`, `/api/areas` and `/api/body` (one person's fitted body) run outside stop-after; every look of that kind
  goes through `lookAt` and keeps its stage by a key in `state/preview.ts`, and every edit through `edit` in
  `state/jobs.ts`. Looks (`domain/setup.ts`, Dexie table `setups`; "setup" in code) are the
  Look tab (model, family, steps, CFG and the stack's own LoRAs) saved under a name, shared by all workspaces,
  managed from the Look tab's head (`model/look-sheet.tsx`) and picked per pass. A LoRA in the stack belongs to
  the look or to a saved character in the cast (`StackLora.from`, the character's `loras[family]`); its row's tag
  gives it to another in its place (`reassign` in `domain/loras.ts`, applied by `useCastLoras` once the
  characters are written). The library shows stacks, an image and everything made from it
  (`domain/lineage.ts`), grouped by the Generate that made them (a batch of several is a `Band` of its own). Swipes and arrows go
  through each stack's `trail`: depth first, or only its bests once any are marked. The dock's run line
  (`features/run/run-line.tsx`) opens one Run sheet with the look, size, draft, seeds and what runs after each
  render; a person's setup folds above their rows (`features/prompt/person-setup.tsx`, `ui/disclosure.tsx`), and on
  a phone the stage is a strip in the Prompt and Look tabs (`stripTab`). An empty workspace's stage offers an example
  recipe (`domain/example.ts`); a batch can be seen all at once on the stage to mark the best
  (`features/stage/compare.tsx`). Presets are a catalog the person owns (`domain/prompt-catalog.ts`, Dexie tables `subs`
  and `chunks`, shared and in the clear): the built-ins in `domain/presets/` are seeded once and new ones arrive through
  `syncBuiltIns` (a removed one is remembered in `meta` and stays gone; `domain/built-ins.ts`). A built-in changed in a
  release is a line in `domain/presets/revisions.ts`, never a bare edit of its text: devices that seeded it follow the
  change only where the person left it as it was; every edit is a pure function of the catalog,
  written as its difference by `editPresets`, which returns the Undo. The picker's "edit" moves or removes a preset;
  "arrange subcategories" reorders, renames (onto another's name merges), deletes, adds and resets a row. Image tags
  live in the sealed `Render.tags` (per workspace) and are how images are grouped: the library's filter strip
  (`domain/library-filter.ts`) combines ★, a character and tags, and a tag shows the whole stack. Keep outfit (a dressed image's ⋯) and Lookbook (the selection) are in
  `features/library`. A person's face photo (`data/db/faces.ts`, sealed) rides along as
  `reference` and a head swap pass runs after the render or repaint (`graphs._headswap`: the BFS LoRA
  through comfyui-krea2edit); one face per render, Krea 2 only. Try UI changes with
  `npm --prefix studio run dev:mock` (`tools/studio_mock.py`, a fake worker behind the real API); it
  keys off node classes and the roles in `_meta`.
  Images go to the studio once: `POST /api/images` returns a hash, and requests send `{"ref": hash}` instead of
  base64 (`studio/src/data/images.ts`); the studio keeps them in memory and answers 410 for one it lost, and the
  phone uploads it again (412 for an image key wrapped for an older deploy: the phone fetches the new public key). A render can have a finish pass: another setup over the whole image at a strength.
- Console: `tools/console.py` is a questionary menu; each entry is a function in the `ACTIONS` table that
  shells out to the other tools and prints the command it runs. Add an entry there, not a new script.
- Frontend: the badge is plain JS on ComfyUI's extension API (`app.registerExtension`,
  `app.extensionManager.registerSidebarTab`). No build step. The studio app is the exception:
  `npm --prefix studio run build`, which the console's Deploy runs, and CI runs its `check` too.

## Verifying

- `uv run tools/check.py --stop-stale` against the deployed URL is the acceptance test. Run it
  after every deploy and treat a failure as a bug in the change, not in the check, until proven
  otherwise. It renders a small image, so it costs a few cents and needs a warm or cold worker
  either way.
- `uv run tools/render.py api tools/<name>_api.json` renders a workflow headlessly; the builder
  writes those files. Look at the output image before judging a change to a workflow.
- `modal app logs comfypoke` streams both containers' logs; the GUI's logs panel shows the worker's
  lines prefixed with `[gpu]`.

## Conventions

- Small modules, one concern each, comments only where the reason is not obvious from the code.
- The deploy id gate: every deploy mints `DEPLOY_ID` on the laptop and ships it to both classes;
  a worker from an older deploy refuses new prompts and the relay retries once on a fresh container.
  Keep that in mind when adding worker methods: `ping` and `stop` are exempt on purpose.
- Never commit `.access_key`. Tokens for Civitai and Hugging Face are environment variables on
  the laptop, never in the repo or the image.
