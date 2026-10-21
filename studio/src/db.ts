// Everything the app keeps lives here, on the device. The server forgets a render once it is saved.
// A workspace's renders, characters, draft and pending jobs are sealed with its key (crypto.ts), so
// one workspace never shows another's and a locked one is ciphertext. Section presets and LoRA
// trigger words are tools rather than work, shared by all workspaces and stored in the clear.
import Dexie, { type EntityTable } from "dexie";
import { useLiveQuery } from "dexie-react-hooks";
import { createContext, useContext, useEffect, useState } from "react";
import type { Params } from "./api";
import { exportKey, importKey, lock, newKey, sealBlob, sealJson, unlock, unsealBlob, unsealJson, type Lock, type Sealed } from "./crypto";
import { cleanRows, fromBlocks, LEGACY_ROW, parseRecipe, PERSON_ROWS, SCENE_ROWS, type Phrase, type Recipe, type RowId } from "./recipe";

export type Render = Params & {
  id: string;
  createdAt: number;
  seconds: number;
  recipe?: Recipe; // what the UI looked like when it was sent, for Reuse
  model?: string; // renders from before unet/family: "turbo", "raw" or "krea2-turbo"
  characterName?: string;
  best?: boolean;
  // yours to edit in the inspector; the fields above are the record of how it was made
  title?: string;
  notes?: string;
  tags?: string[];
  source?: string; // an upscale: the render it was made from
  upscale?: Upscale;
};
export type Upscale = { megapixels: number; prompt: string; denoise: number }; // prompt "" means no retouch
// A saved character or scene: the rows of phrases it keeps, versions included. Both live in the chars table.
export type Saved = { id: string; name: string; kind: "person" | "scene"; rows: Partial<Record<RowId, Phrase[]>>; updatedAt: number };
export type LoraNote = { name: string; trigger: string };
export type Preset = { id: string; block: RowId; text: string; label?: string; at: number }; // block: the row it is offered in
// What the server does not know about a job: the recipe behind a render, the render behind an upscale,
// and whether a render should be upscaled as soon as it is stored.
export type JobMeta = { recipe?: Recipe; characterName?: string; upscaleOf?: Render; upscale?: Upscale; then?: Upscale };
// Names are in the clear so the start screen can list them; `key` is the raw data key of a workspace without a password.
export type Workspace = {
  id: string;
  name: string;
  createdAt: number;
  opened: number;
  lock?: Lock;
  key?: ArrayBuffer;
  folder?: FileSystemDirectoryHandle; // where Save and Download write, in browsers that can (folder.ts)
};
export type Space = { id: string; key: CryptoKey }; // an open workspace

type Row = { id: string; ws: string; sealed: Sealed };
type Shot = Row & { createdAt: number };
type Bytes = { id: string; sealed: Sealed };
type Legacy = Omit<Render, "best"> & { image: Blob; thumb: Blob };

export const db = new Dexie("studio") as Dexie & {
  renders: EntityTable<Legacy, "id">; // before workspaces; emptied by migrate()
  characters: EntityTable<{ id: string }, "id">; // the same
  loraNotes: EntityTable<LoraNote, "name">;
  presets: EntityTable<Preset, "id">;
  workspaces: EntityTable<Workspace, "id">;
  shots: EntityTable<Shot, "id">; // a render's settings; its pixels are in thumbs and images, read one at a time
  thumbs: EntityTable<Bytes, "id">;
  images: EntityTable<Bytes, "id">;
  chars: EntityTable<Row, "id">;
  drafts: EntityTable<{ ws: string; sealed: Sealed }, "ws">;
  pending: EntityTable<Row, "id">;
};

// The chips a device used to start with, by the block ids of the time. Version 5 takes them out again:
// the built-in presets are in recipe.ts now, and only presets someone added stay in the table.
const STARTERS: Record<string, string[]> = {
  subject: ["young adult woman", "middle-aged man", "elderly person", "athletic build", "slender build", "freckled skin"],
  face: ["short undercut hair", "long wavy auburn hair", "braided silver hair", "green eyes", "scar across the left eyebrow", "light stubble"],
  outfit: ["worn leather armor", "tailored charcoal suit", "oversized knit sweater", "techwear jacket with straps", "flowing linen robe"],
  pose: ["neutral expression", "slight smile", "determined look", "looking over the shoulder", "arms crossed", "walking toward the camera"],
  setting: ["plain grey studio backdrop", "rain-soaked neon street at night", "misty pine forest", "sunlit kitchen", "desert ruins at dusk"],
  camera: ["close-up portrait", "medium shot", "full body shot", "three-quarter view", "85mm lens, shallow depth of field", "soft overcast light", "hard rim light", "golden hour"],
  style: ["film photo, natural grain", "editorial photography", "digital painting", "anime illustration", "character turnaround sheet, white background"],
};
const starterPresets = () =>
  Object.entries(STARTERS).flatMap(([block, chips], i) => chips.map((text, j) => ({ id: crypto.randomUUID(), block, text, at: i * 100 + j })));

db.version(1).stores({ renders: "id, createdAt" });
db.version(2).stores({ renders: "id, createdAt", characters: "id, name", loraNotes: "name" });
db.version(3)
  .stores({ renders: "id, createdAt", characters: "id, name", loraNotes: "name", presets: "id, block, at" })
  .upgrade((tx) => tx.table("presets").bulkAdd(starterPresets())); // a device that had the built-in chips keeps them
// WebCrypto cannot run inside an upgrade transaction, so moving the old tables in is migrate()'s job.
db.version(4).stores({
  workspaces: "id",
  shots: "id, ws, [ws+createdAt]",
  thumbs: "id",
  images: "id",
  chars: "id, ws",
  drafts: "ws",
  pending: "id, ws",
});
// Another tab purged everything (deleted the database): this one must not quietly recreate it
// with its own draft or jobs. Reloading drops all of its state.
// Presets move to the rows of the people-and-scene prompt; the starter chips go.
db.version(5).stores({}).upgrade((tx) =>
  tx.table("presets").toCollection().modify((p: Preset & { block: string }, ref: { value?: Preset }) => {
    if (!p.label && STARTERS[p.block]?.includes(p.text)) return void delete ref.value;
    p.block = LEGACY_ROW[p.block] ?? p.block;
  }),
);
db.on("versionchange", () => {
  db.close();
  location.reload();
  return false;
});

export const SpaceContext = createContext<Space>(null!);
export const useSpace = () => useContext(SpaceContext);

// --- workspaces

const guard = async (key: CryptoKey, password: string) =>
  password ? { lock: await lock(key, password), key: undefined } : { key: await exportKey(key), lock: undefined };

export async function createWorkspace(name: string, password: string): Promise<Space> {
  const key = await newKey();
  const id = crypto.randomUUID();
  await db.workspaces.add({ id, name, createdAt: Date.now(), opened: Date.now(), ...(await guard(key, password)) });
  return { id, key };
}

/** Throws WrongPassword for a protected workspace and the wrong password. */
export async function openWorkspace(w: Workspace, password = ""): Promise<Space> {
  const key = w.lock ? await unlock(w.lock, password) : await importKey(w.key!);
  await db.workspaces.update(w.id, { opened: Date.now() });
  return { id: w.id, key };
}

/** Sets, changes or (with "") removes the password. The data key stays, so nothing is re-encrypted. */
export const setPassword = async (space: Space, password: string) => db.workspaces.update(space.id, await guard(space.key, password));
export const renameWorkspace = (id: string, name: string) => db.workspaces.update(id, { name });

/** The deep purge. Without inputs: every generated image in every workspace (protected ones too:
 *  deleting needs no key) and every job in flight. With inputs: the whole database and the app's
 *  settings, so the next load starts as a new device. Returns the ids of the jobs that were in
 *  flight, for the server to drop. The browser frees the space; it is not a secure erase. */
export async function purge(inputs: boolean) {
  const jobs = (await db.pending.toCollection().primaryKeys()) as string[];
  closeSpace();
  if (inputs) {
    db.close();
    await Dexie.delete("studio");
    try {
      Object.keys(localStorage).filter((k) => k.startsWith("studio.")).forEach((k) => localStorage.removeItem(k));
    } catch {
      // storage blocked: nothing of ours is in it then
    }
  } else {
    await db.transaction("rw", [db.shots, db.thumbs, db.images, db.pending, db.renders], () =>
      Promise.all([db.shots.clear(), db.thumbs.clear(), db.images.clear(), db.pending.clear(), db.renders.clear()]),
    );
    window.dispatchEvent(new Event("studio-purged")); // job cards still holding an image let go of it
  }
  return jobs;
}

export async function deleteWorkspace(id: string) {
  await db.transaction("rw", [db.workspaces, db.shots, db.thumbs, db.images, db.chars, db.drafts, db.pending], async () => {
    const shots = await db.shots.where("ws").equals(id).primaryKeys();
    await Promise.all([db.thumbs.bulkDelete(shots), db.images.bulkDelete(shots), db.shots.bulkDelete(shots)]);
    await Promise.all([db.chars.where("ws").equals(id).delete(), db.pending.where("ws").equals(id).delete()]);
    await Promise.all([db.drafts.delete(id), db.workspaces.delete(id)]);
  });
}

/** Forgets what was decrypted, so a closed workspace leaves nothing readable in memory. */
export function closeSpace() {
  generation++;
  unsealed.clear();
  images.clear();
  thumbs.forEach((p) => p.then((url) => URL.revokeObjectURL(url), () => {}));
  thumbs.clear();
}

// Bumped by closeSpace: a decrypt that finishes after the workspace closed must not refill the caches.
let generation = 0;

// --- sealed rows, decrypted once per version of each row

const unsealed = new Map<string, { iv: string; value: unknown }>();
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");

function useUnsealed<T>(rows: Row[] | undefined): T[] | undefined {
  const space = useSpace();
  const [out, setOut] = useState<T[]>();
  useEffect(() => {
    if (!rows) return;
    let live = true;
    Promise.all(
      rows.map(async (row) => {
        const iv = hex(row.sealed.iv); // every write seals with a new iv
        const hit = unsealed.get(row.id);
        if (hit?.iv === iv) return hit.value as T;
        const gen = generation;
        const value = await unsealJson<T>(space.key, row.sealed);
        if (gen === generation) unsealed.set(row.id, { iv, value });
        return value;
      }),
    ).then((v) => live && setOut(v));
    return () => {
      live = false;
    };
  }, [rows, space]);
  return out;
}

/** This workspace's renders, newest first; undefined while they are read. */
export function useRenders() {
  const space = useSpace();
  const rows = useLiveQuery(
    () => db.shots.where("[ws+createdAt]").between([space.id, Dexie.minKey], [space.id, Dexie.maxKey]).reverse().toArray(),
    [space.id],
  );
  return useUnsealed<Render>(rows);
}

/** A saved entry as stored now. Characters from before people and versions kept free-text blocks and their own LoRAs; the blocks become rows, the LoRAs stay with the Model tab. */
export function toSaved(raw: any): Saved | null {
  if (!raw || typeof raw.id !== "string" || typeof raw.name !== "string") return null;
  const kind = raw.kind === "scene" ? "scene" : "person";
  const rows = raw.blocks && !raw.rows ? fromBlocks(raw.blocks) : raw.rows;
  return { id: raw.id, name: raw.name, kind, rows: cleanRows(rows, kind === "scene" ? SCENE_ROWS : PERSON_ROWS), updatedAt: Number(raw.updatedAt) || 0 };
}

/** This workspace's saved characters and scenes, by name. */
export function useSaved() {
  const space = useSpace();
  const rows = useLiveQuery(() => db.chars.where("ws").equals(space.id).toArray(), [space.id]);
  return useUnsealed<unknown>(rows)?.map(toSaved).filter((x): x is Saved => !!x).sort((a, b) => a.name.localeCompare(b.name));
}

export const putSaved = async (space: Space, c: Saved) => db.chars.put({ id: c.id, ws: space.id, sealed: await sealJson(space.key, c) });
export const deleteSaved = (id: string) => db.chars.delete(id);

/** Your presets, shared by all workspaces, with the row each is offered in. */
export const usePresets = () => useLiveQuery(() => db.presets.orderBy("at").toArray(), []);

export async function loadDraft(space: Space) {
  const row = await db.drafts.get(space.id);
  return parseRecipe(row ? await unsealJson(space.key, row.sealed) : {});
}

export const saveDraft = async (space: Space, r: Recipe) => db.drafts.put({ ws: space.id, sealed: await sealJson(space.key, r) });

// --- renders

async function putShot(space: Space, r: Render, image: Blob, thumb: Blob) {
  const [sealed, t, i] = await Promise.all([sealJson(space.key, r), sealBlob(space.key, thumb), sealBlob(space.key, image)]);
  await db.transaction("rw", [db.workspaces, db.shots, db.thumbs, db.images], async () => {
    if (!(await db.workspaces.get(space.id))) return; // deleted while this render was finishing
    await db.shots.put({ id: r.id, ws: space.id, createdAt: r.createdAt, sealed });
    await db.thumbs.put({ id: r.id, sealed: t });
    await db.images.put({ id: r.id, sealed: i });
  });
}

export async function saveRender(space: Space, r: Render, image: Blob) {
  await putShot(space, r, image, await thumbnail(image));
  // Safari clears site storage after seven days without a visit unless it grants persistence,
  // which it does for Home Screen apps; asking costs nothing elsewhere.
  navigator.storage?.persist?.().catch(() => {});
}

let updates = Promise.resolve();

/** Changes a stored render. Changes run one after another, each from the stored version, so two quick ★ taps cancel out. */
export function updateRender(space: Space, id: string, change: (r: Render) => Render) {
  return (updates = updates.then(async () => {
    const row = await db.shots.get(id);
    if (row) await db.shots.update(id, { sealed: await sealJson(space.key, change(await unsealJson<Render>(space.key, row.sealed))) });
  }).catch(() => {}));
}

export async function removeRender(id: string) {
  await db.transaction("rw", db.shots, db.thumbs, db.images, () => Promise.all([db.shots.delete(id), db.thumbs.delete(id), db.images.delete(id)]));
}

async function thumbnail(blob: Blob, short = 360): Promise<Blob> {
  const bmp = await createImageBitmap(blob);
  const scale = Math.min(1, short / Math.min(bmp.width, bmp.height));
  const canvas = new OffscreenCanvas(Math.round(bmp.width * scale), Math.round(bmp.height * scale));
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return canvas.convertToBlob({ type: "image/jpeg", quality: 0.82 });
}

// The last few full images stay decrypted: the stage and the viewer show the same one, and
// browsing back and forth should not wait on IndexedDB each time.
const images = new Map<string, Blob>();

export async function loadImage(space: Space, id: string) {
  let blob = images.get(id);
  if (!blob) {
    const gen = generation;
    const row = await db.images.get(id);
    if (!row) throw new Error("This image is no longer on this device.");
    blob = await unsealBlob(space.key, row.sealed, "image/png");
    if (gen !== generation) return blob;
  }
  images.delete(id);
  images.set(id, blob);
  if (images.size > 8) images.delete(images.keys().next().value!);
  return blob;
}

/** A render's full image, keeping the previous one on screen while the next is decrypted. */
export function useImage(id?: string) {
  const space = useSpace();
  const [img, setImg] = useState<Blob>();
  useEffect(() => {
    if (!id) return setImg(undefined);
    let live = true;
    loadImage(space, id).then((b) => live && setImg(b), () => {}); // deleted while it loaded
    return () => {
      live = false;
    };
  }, [space, id]);
  return id ? img : undefined;
}

// Object URLs, kept while the workspace is open: the grid remounts often, and the phone tab and
// the desktop column both show every thumbnail. The promise is cached so each is decrypted once.
const thumbs = new Map<string, Promise<string>>();

async function thumbUrl(space: Space, id: string) {
  const gen = generation;
  const row = await db.thumbs.get(id);
  if (!row) throw new Error("gone");
  const url = URL.createObjectURL(await unsealBlob(space.key, row.sealed, "image/jpeg"));
  if (gen !== generation) URL.revokeObjectURL(url); // closed meanwhile; closeSpace already let go of this promise
  return url;
}

export function useThumb(id: string) {
  const space = useSpace();
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let live = true;
    let p = thumbs.get(id);
    if (!p) {
      p = thumbUrl(space, id);
      thumbs.set(id, p);
      p.catch(() => thumbs.delete(id)); // deleted while it loaded
    }
    p.then((u) => live && setUrl(u), () => {});
    return () => {
      live = false;
    };
  }, [space, id]);
  return url;
}

// --- jobs in flight: their ids outlive a reload, and the recipe behind each is sealed

export const addPending = async (space: Space, id: string, meta: JobMeta) => db.pending.put({ id, ws: space.id, sealed: await sealJson(space.key, meta) });
export const pendingIds = (space: Space) => db.pending.where("ws").equals(space.id).primaryKeys();
export const dropPending = (id: string) => db.pending.delete(id);

/** null when the job is no longer wanted here: purged, or its workspace deleted, while it ran. */
export async function pendingMeta(space: Space, id: string) {
  const row = await db.pending.get(id);
  return row ? unsealJson<JobMeta>(space.key, row.sealed) : null;
}

let migrating: Promise<void> | undefined;

/** Renders, characters, the draft and pending jobs from before workspaces move into one called Default.
 *  Once per page: two runs at the same time would each create a Default. */
export const migrate = () =>
  (migrating ??= (navigator.locks ? navigator.locks.request("studio-migrate", moveLegacy) : moveLegacy()).catch((e) => {
    migrating = undefined; // a reload tries again
    throw e;
  }));

async function moveLegacy() {
  const draft = localStorage.getItem("studio.recipe");
  const jobs = localStorage.getItem("studio.jobs");
  if (!draft && !jobs && !(await db.renders.count()) && !(await db.characters.count())) return;
  const old = (await db.workspaces.toArray()).find((w) => w.name === "Default" && w.key); // an earlier run that stopped halfway
  const space = old ? { id: old.id, key: await importKey(old.key!) } : await createWorkspace("Default", "");
  // One render at a time, each moved in its own transaction: a library can be larger than memory, and an interrupted run resumes.
  for (const id of await db.renders.toCollection().primaryKeys()) {
    const legacy = await db.renders.get(id);
    if (!legacy) continue;
    const { image, thumb, ...r } = legacy;
    await putShot(space, r, image, thumb);
    await db.renders.delete(id);
  }
  for (const c of await db.characters.toArray()) {
    const saved = toSaved(c);
    if (saved) await putSaved(space, saved);
    await db.characters.delete(c.id);
  }
  if (draft) {
    await saveDraft(space, parseRecipe(JSON.parse(draft)));
    localStorage.removeItem("studio.recipe");
  }
  if (jobs) {
    for (const e of JSON.parse(jobs) as (string | ({ id: string } & JobMeta))[]) {
      const { id, ...meta } = typeof e === "string" ? { id: e } : e;
      await addPending(space, id, meta);
    }
    localStorage.removeItem("studio.jobs");
  }
}

/** This workspace's saved characters and scenes and the shared presets and LoRA notes as one JSON file: the backup, and how a library moves between devices. */
export async function exportLibrary(space: Space) {
  const rows = await db.chars.where("ws").equals(space.id).toArray();
  const data = {
    version: 2,
    saved: (await Promise.all(rows.map((r) => unsealJson(space.key, r.sealed)))).map(toSaved).filter(Boolean),
    loraNotes: await db.loraNotes.toArray(),
    presets: await db.presets.toArray(),
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

/** Merges a backup into this workspace: malformed entries are skipped, and an entry edited here since the backup keeps its newer version. */
export async function importLibrary(space: Space, file: File) {
  const data = JSON.parse(await file.text());
  if (data?.version !== 1 && data?.version !== 2) throw new Error("not a studio library file");
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  const raw = list(data.version === 1 ? data.characters : data.saved); // version 1 had characters only, in blocks
  const saved = raw.map(toSaved).filter((x): x is Saved => !!x);
  const notes: LoraNote[] = list(data.loraNotes)
    .filter((n) => n && typeof n.name === "string" && typeof n.trigger === "string")
    .map((n) => ({ name: n.name, trigger: n.trigger }));
  const rowIds: string[] = [...PERSON_ROWS, ...SCENE_ROWS].map((r) => r.id);
  const presets: Preset[] = list(data.presets)
    .filter((p) => p && typeof p.block === "string" && !(!p.label && STARTERS[p.block]?.includes(p.text))) // the old starter chips stay out, as in version 5
    .map((p) => ({ ...p, block: LEGACY_ROW[p.block] ?? p.block }))
    .filter((p) => typeof p.id === "string" && rowIds.includes(p.block) && typeof p.text === "string")
    .map((p) => ({ id: p.id, block: p.block, text: p.text, label: typeof p.label === "string" ? p.label : undefined, at: Number(p.at) || 0 }));
  let added = 0;
  const here = await db.chars.where("ws").equals(space.id).toArray();
  const mine = new Map((await Promise.all(here.map((r) => unsealJson(space.key, r.sealed)))).map(toSaved).filter((x): x is Saved => !!x).map((c) => [c.id, c]));
  const taken = new Set((await db.chars.toCollection().primaryKeys()).filter((id) => !mine.has(id)));
  for (const c of saved) {
    const local = mine.get(c.id);
    if (local && local.updatedAt >= c.updatedAt) continue;
    // the same backup imported into a second workspace makes copies there, not moves
    await putSaved(space, taken.has(c.id) ? { ...c, id: crypto.randomUUID() } : c);
    added++;
  }
  await db.loraNotes.bulkPut(notes);
  await db.transaction("rw", db.presets, async () => {
    // Same text in the same row is the same preset, whatever its id, and an id already used
    // here is never overwritten: a backup only adds presets.
    const local = await db.presets.toArray();
    const have = new Set(local.map((p) => `${p.block}\u0000${p.text.toLowerCase()}`));
    const ids = new Set(local.map((p) => p.id));
    const fresh = presets.filter((p) => {
      const key = `${p.block}\u0000${p.text.toLowerCase()}`;
      if (have.has(key)) return false;
      have.add(key);
      return true;
    });
    await db.presets.bulkAdd(fresh.map((p) => (ids.has(p.id) ? { ...p, id: crypto.randomUUID() } : p)));
  });
  const skipped = raw.length - saved.length;
  return `Imported ${added} of ${saved.length} saved characters and scenes${skipped ? `, skipped ${skipped} malformed` : ""}.`;
}
