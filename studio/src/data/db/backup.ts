// This workspace's saved characters and scenes, with the shared presets and LoRA notes, as one JSON
// file: the backup, and how a library moves between devices.
import { unsealJson } from "@/data/crypto";
import { putSaved } from "@/data/db/saved";
import { db, STARTERS, type LoraNote, type Preset } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import { isRecord, isText, LEGACY_ROW } from "@/domain/parse";
import { ROWS, type RowId } from "@/domain/rows";
import { toSaved, type Saved } from "@/domain/saved";

const savedOf = async (space: Space) => {
  const rows = await db.chars.where("ws").equals(space.id).toArray();
  const raw = await Promise.all(rows.map((r) => unsealJson<unknown>(space.key, r.sealed)));
  return raw.map(toSaved).filter((x): x is Saved => x !== null);
};

export async function exportLibrary(space: Space) {
  const data = {
    version: 2,
    saved: await savedOf(space),
    loraNotes: await db.loraNotes.toArray(),
    presets: await db.presets.toArray(),
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rowIds = new Set<string>(ROWS.map((r) => r.id));
const isRow = (v: string): v is RowId => rowIds.has(v);

function presetsIn(raw: unknown): Preset[] {
  const out: Preset[] = [];
  for (const p of list(raw)) {
    if (!isRecord(p) || !isText(p.id) || !isText(p.block) || !isText(p.text)) continue;
    const label = isText(p.label) ? p.label : undefined;
    if (!label && STARTERS[p.block]?.includes(p.text)) continue; // the old starter chips stay out, as in version 5
    const block = LEGACY_ROW[p.block] ?? p.block;
    if (isRow(block)) out.push({ id: p.id, block, text: p.text, label, at: Number(p.at) || 0 });
  }
  return out;
}

const notesIn = (raw: unknown): LoraNote[] =>
  list(raw)
    .filter(isRecord)
    .filter((n): n is { name: string; trigger: string } => isText(n.name) && isText(n.trigger))
    .map((n) => ({ name: n.name, trigger: n.trigger }));

const presetKey = (p: Preset) => `${p.block}\u0000${p.text.toLowerCase()}`;

/** Same text in the same row is the same preset, whatever its id, and an id already used here is never overwritten: a backup only adds presets. */
async function addPresets(presets: Preset[]) {
  await db.transaction("rw", db.presets, async () => {
    const local = await db.presets.toArray();
    const have = new Set(local.map(presetKey));
    const ids = new Set(local.map((p) => p.id));
    const fresh = presets.filter((p) => !have.has(presetKey(p)) && have.add(presetKey(p)));
    await db.presets.bulkAdd(fresh.map((p) => (ids.has(p.id) ? { ...p, id: crypto.randomUUID() } : p)));
  });
}

/** Merges a backup into this workspace: malformed entries are skipped, and an entry edited here since the backup keeps its newer version. */
export async function importLibrary(space: Space, file: File) {
  const data: unknown = JSON.parse(await file.text());
  if (!isRecord(data) || (data.version !== 1 && data.version !== 2))
    throw new Error("not a studio library file");
  const raw = list(data.version === 1 ? data.characters : data.saved); // version 1 had characters only, in blocks
  const saved = raw.map(toSaved).filter((x): x is Saved => x !== null);
  const mine = new Map((await savedOf(space)).map((c) => [c.id, c]));
  const taken = new Set((await db.chars.toCollection().primaryKeys()).filter((id) => !mine.has(id)));
  let added = 0;
  for (const c of saved) {
    const local = mine.get(c.id);
    if (local && local.updatedAt >= c.updatedAt) continue;
    // the same backup imported into a second workspace makes copies there, not moves
    await putSaved(space, taken.has(c.id) ? { ...c, id: crypto.randomUUID() } : c);
    added++;
  }
  await db.loraNotes.bulkPut(notesIn(data.loraNotes));
  await addPresets(presetsIn(data.presets));
  const skipped = raw.length - saved.length;
  return `Imported ${added} of ${saved.length} saved characters and scenes${skipped ? `, skipped ${skipped} malformed` : ""}.`;
}
