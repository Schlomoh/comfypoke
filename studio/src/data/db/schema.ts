// The device's database. A workspace's renders, characters, draft and pending jobs are sealed with its
// key (crypto.ts), so one workspace never shows another's and a locked one is ciphertext. Section
// presets and LoRA trigger words are tools rather than work, shared by all workspaces and stored in the
// clear. A schema change is a new db.version(n), never an edit of an old one: phones keep their data.
import { Dexie, type EntityTable } from "dexie";

import type { Lock, Sealed } from "@/data/crypto";
import { LEGACY_ROW } from "@/domain/parse";
import type { Render } from "@/domain/render";
import type { RowId } from "@/domain/rows";

export type LoraNote = { name: string; trigger: string };
export type Preset = { id: string; block: RowId; text: string; label?: string; at: number }; // block: the row it is offered in
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

export type Row = { id: string; ws: string; sealed: Sealed };
type Shot = Row & { createdAt: number };
type Bytes = { id: string; sealed: Sealed };
export type Legacy = Omit<Render, "best"> & { image: Blob; thumb: Blob };

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
export const STARTERS: Record<string, string[]> = {
  subject: [
    "young adult woman",
    "middle-aged man",
    "elderly person",
    "athletic build",
    "slender build",
    "freckled skin",
  ],
  face: [
    "short undercut hair",
    "long wavy auburn hair",
    "braided silver hair",
    "green eyes",
    "scar across the left eyebrow",
    "light stubble",
  ],
  outfit: [
    "worn leather armor",
    "tailored charcoal suit",
    "oversized knit sweater",
    "techwear jacket with straps",
    "flowing linen robe",
  ],
  pose: [
    "neutral expression",
    "slight smile",
    "determined look",
    "looking over the shoulder",
    "arms crossed",
    "walking toward the camera",
  ],
  setting: [
    "plain grey studio backdrop",
    "rain-soaked neon street at night",
    "misty pine forest",
    "sunlit kitchen",
    "desert ruins at dusk",
  ],
  camera: [
    "close-up portrait",
    "medium shot",
    "full body shot",
    "three-quarter view",
    "85mm lens, shallow depth of field",
    "soft overcast light",
    "hard rim light",
    "golden hour",
  ],
  style: [
    "film photo, natural grain",
    "editorial photography",
    "digital painting",
    "anime illustration",
    "character turnaround sheet, white background",
  ],
};
const starterPresets = () =>
  Object.entries(STARTERS).flatMap(([block, chips], i) =>
    chips.map((text, j) => ({ id: crypto.randomUUID(), block, text, at: i * 100 + j })),
  );

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
// Presets move to the rows of the people-and-scene prompt; the starter chips go.
db.version(5)
  .stores({})
  .upgrade((tx) =>
    tx
      .table("presets")
      .toCollection()
      .modify((p: Preset & { block: string }, ref: { value?: Preset }) => {
        if (!p.label && STARTERS[p.block]?.includes(p.text)) return void delete ref.value;
        p.block = LEGACY_ROW[p.block] ?? p.block;
      }),
  );
// Another tab purged everything (deleted the database): this one must not quietly recreate it
// with its own draft or jobs. Reloading drops all of its state.
db.on("versionchange", () => {
  db.close();
  location.reload();
  return false;
});
