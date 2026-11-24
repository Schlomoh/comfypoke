// This workspace's saved characters and scenes, with the shared presets, model setups and LoRA notes, as one JSON
// file: the backup, and how a library moves between devices.
import { unsealJson } from "@/data/crypto";
import { putSaved } from "@/data/db/saved";
import { db, STARTERS, type LoraNote, type Preset } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import { isRecord, isText, LEGACY_ROW } from "@/domain/parse";
import { PRESET_ROWS, type PresetRow } from "@/domain/rows";
import { toSaved, type Saved } from "@/domain/saved";
import { BUILT_IN, parseSetup, type Setup } from "@/domain/setup";

const savedOf = async (space: Space) => {
  const rows = await db.chars.where("ws").equals(space.id).toArray();
  const raw = await Promise.all(rows.map((r) => unsealJson<unknown>(space.key, r.sealed)));
  return raw.map(toSaved).filter((x): x is Saved => x !== null);
};

const faceless = (s: Saved): Saved => ({ ...s, face: undefined });

export async function exportLibrary(space: Space) {
  const data = {
    version: 2,
    saved: (await savedOf(space)).map(faceless), // face photos stay on the device they were added on
    loraNotes: await db.loraNotes.toArray(),
    presets: await db.presets.toArray(),
    setups: await db.setups.toArray(),
  };
  return new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rowIds = new Set<string>(PRESET_ROWS.map((r) => r.id));
const isRow = (v: string): v is PresetRow => rowIds.has(v);

function presetsIn(raw: unknown): Preset[] {
  const out: Preset[] = [];
  for (const p of list(raw)) {
    if (!isRecord(p) || !isText(p.id) || !isText(p.block) || !isText(p.text)) continue;
    const label = isText(p.label) ? p.label : undefined;
    if (!label && STARTERS[p.block]?.includes(p.text)) continue; // the old starter chips stay out, as in version 5
    const block = LEGACY_ROW[p.block] ?? p.block;
    if (isRow(block))
      out.push({
        id: p.id,
        block,
        text: p.text,
        label,
        at: Number(p.at) || 0,
        ...(isText(p.group) ? { group: p.group } : {}),
        ...(p.hidden === true ? { hidden: true } : {}),
      });
  }
  return out;
}

const notesIn = (raw: unknown): LoraNote[] =>
  list(raw)
    .filter(isRecord)
    .filter(
      (n): n is { name: string; trigger: string; family?: unknown } => isText(n.name) && isText(n.trigger),
    )
    .map((n) => ({ name: n.name, trigger: n.trigger, ...(isText(n.family) ? { family: n.family } : {}) }));

// a removed built-in one and one added with the same text are two presets
const presetKey = (p: Preset) => `${p.block}\u0000${p.hidden ? "hidden" : ""}\u0000${p.text.toLowerCase()}`;

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
    // a face id from another device or workspace points at nothing here; the one this entry has here stays
    const entry = { ...faceless(c), face: local?.face };
    await putSaved(space, taken.has(c.id) ? { ...entry, id: crypto.randomUUID() } : entry);
    added++;
  }
  // a note merges into what is here: an older backup, or one without a family, never erases one set on this device
  const here = await db.loraNotes.toArray();
  await db.loraNotes.bulkPut(
    notesIn(data.loraNotes).map((n) => {
      const old = here.find((h) => h.name === n.name);
      return { ...old, ...n, trigger: n.trigger || old?.trigger || "", family: n.family ?? old?.family };
    }),
  );
  await addPresets(presetsIn(data.presets));
  // a setup already here by that name stays as it is
  const names = new Set([...BUILT_IN, ...(await db.setups.toArray())].map((s) => s.name));
  const setups = list(data.setups)
    .map(parseSetup)
    .filter((s): s is Setup => s !== null && !names.has(s.name) && !!names.add(s.name));
  await db.setups.bulkPut(setups.map((s) => ({ ...s, id: crypto.randomUUID() })));
  const skipped = raw.length - saved.length;
  return `Imported ${added} of ${saved.length} saved characters and scenes${skipped ? `, skipped ${skipped} malformed` : ""}.`;
}
