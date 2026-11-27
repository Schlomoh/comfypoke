// This workspace's saved characters and scenes, with the shared prompt catalog, model setups and LoRA notes, as one JSON
// file: the backup, and how a library moves between devices. With a password the file is version 4: version 3's JSON
// sealed with it (crypto.sealWithPassword), so a protected workspace's characters do not leave the seal.
import { openWithPassword, sealWithPassword, unsealJson, type PasswordSealed } from "@/data/crypto";
import { editPresets } from "@/data/db/prompt-catalog";
import { putSaved } from "@/data/db/saved";
import { db, STARTERS, type LoraNote } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import { fromLegacy, type LegacyPreset } from "@/domain/built-ins";
import { isRecord, isText, LEGACY_ROW } from "@/domain/parse";
import { MIN_PASSWORD } from "@/domain/password";
import { GENDERS, type Gender } from "@/domain/presets/gender";
import { NO_PRESETS, merge, type Presets, type Chunk, type Sub } from "@/domain/prompt-catalog";
import { PRESET_ROWS, type PresetRow } from "@/domain/rows";
import { toSaved, type Saved } from "@/domain/saved";
import { BUILT_IN, parseSetup, type Setup } from "@/domain/setup";

const savedOf = async (space: Space) => {
  const rows = await db.chars.where("ws").equals(space.id).toArray();
  const raw = await Promise.all(rows.map((r) => unsealJson<unknown>(space.key, r.sealed)));
  return raw.map(toSaved).filter((x): x is Saved => x !== null);
};

const faceless = (s: Saved): Saved => ({ ...s, face: undefined });

/** Throws for a protected workspace without a password of MIN_PASSWORD characters: its characters stay sealed. */
export async function exportLibrary(space: Space, password = "") {
  if ((await db.workspaces.get(space.id))?.lock && password.length < MIN_PASSWORD)
    throw new Error(
      `This workspace is protected: give the file a password of at least ${MIN_PASSWORD} characters.`,
    );
  const data = {
    version: 3,
    saved: (await savedOf(space)).map(faceless), // face photos stay on the device they were added on
    loraNotes: await db.loraNotes.toArray(),
    catalog: { subs: await db.subs.toArray(), chunks: await db.chunks.toArray() },
    setups: await db.setups.toArray(),
  };
  const file = password ? { version: 4, ...(await sealWithPassword(data, password)) } : data;
  return new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
}

/** A version 4 file's sealed part; its iterations are bounded, as a file from elsewhere could ask for any number. */
export function sealedIn(v: Record<string, unknown>): PasswordSealed | null {
  const { salt, iterations, iv, data } = v;
  if (!isText(salt) || !isText(iv) || !isText(data) || typeof iterations !== "number") return null;
  return iterations >= 100_000 && iterations <= 10_000_000 ? { salt, iterations, iv, data } : null;
}

/** Whether a library file is sealed with a password, so the import has to ask for it. */
export async function needsPassword(file: File) {
  try {
    const v: unknown = JSON.parse(await file.text());
    return isRecord(v) && v.version === 4;
  } catch {
    return false;
  }
}

const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rowIds = new Set<string>(PRESET_ROWS.map((r) => r.id));
const isRow = (v: string): v is PresetRow => rowIds.has(v);

/** The presets of a version 1 or 2 backup, from before the catalog. */
function presetsIn(raw: unknown): LegacyPreset[] {
  const out: LegacyPreset[] = [];
  for (const p of list(raw)) {
    if (!isRecord(p) || !isText(p.block) || !isText(p.text)) continue;
    if (!isText(p.label) && STARTERS[p.block]?.includes(p.text)) continue; // the old starter chips stay out, as in version 5
    const block = LEGACY_ROW[p.block] ?? p.block;
    if (isRow(block))
      out.push({
        block,
        text: p.text,
        at: Number(p.at) || 0,
        ...(isText(p.group) ? { group: p.group } : {}),
        ...(p.hidden === true ? { hidden: true } : {}),
      });
  }
  return out;
}

const genders = new Set<string>(GENDERS);

/** The catalog of a version 3 backup; ids are only matched within it, so any text will do. */
function catalogIn(raw: unknown): Presets {
  if (!isRecord(raw)) return NO_PRESETS;
  const subs: Sub[] = list(raw.subs).flatMap((s) =>
    isRecord(s) && isText(s.id) && isText(s.row) && isRow(s.row) && isText(s.name)
      ? [{ id: s.id, row: s.row, name: s.name, order: Number(s.order) || 0 }]
      : [],
  );
  const chunks: Chunk[] = list(raw.chunks).flatMap((c) => {
    if (!isRecord(c) || !isText(c.id) || !isText(c.row) || !isRow(c.row) || !isText(c.sub) || !isText(c.text))
      return [];
    const only = list(c.only).filter((g): g is Gender => isText(g) && genders.has(g));
    return [
      {
        id: c.id,
        row: c.row,
        sub: c.sub,
        text: c.text,
        order: Number(c.order) || 0,
        ...(only.length ? { only } : {}),
        ...(isText(c.builtIn) ? { builtIn: c.builtIn } : {}),
      },
    ];
  });
  return { subs, chunks };
}

const notesIn = (raw: unknown): LoraNote[] =>
  list(raw)
    .filter(isRecord)
    .filter(
      (n): n is { name: string; trigger: string; family?: unknown } => isText(n.name) && isText(n.trigger),
    )
    .map((n) => ({ name: n.name, trigger: n.trigger, ...(isText(n.family) ? { family: n.family } : {}) }));

/** Merges a backup into this workspace: malformed entries are skipped, and an entry edited here since the backup keeps its newer version. */
export async function importLibrary(space: Space, file: File, password = "") {
  const outer: unknown = JSON.parse(await file.text());
  let data = outer;
  if (isRecord(outer) && outer.version === 4) {
    const sealed = sealedIn(outer);
    if (!sealed) throw new Error("not a studio library file");
    data = await openWithPassword(sealed, password);
  }
  if (!isRecord(data) || ![1, 2, 3].includes(data.version as number))
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
  // the catalog only gains: subcategories by name, presets by text
  const theirs = data.version === 3 ? catalogIn(data.catalog) : undefined;
  await editPresets((c) => (theirs ? merge(c, theirs) : fromLegacy(c, presetsIn(data.presets), false)));
  // a setup already here by that name stays as it is
  const names = new Set([...BUILT_IN, ...(await db.setups.toArray())].map((s) => s.name));
  const setups = list(data.setups)
    .map(parseSetup)
    .filter((s): s is Setup => s !== null && !names.has(s.name) && !!names.add(s.name));
  await db.setups.bulkPut(setups.map((s) => ({ ...s, id: crypto.randomUUID() })));
  const skipped = raw.length - saved.length;
  return `Imported ${added} of ${saved.length} saved characters and scenes${skipped ? `, skipped ${skipped} malformed` : ""}.`;
}
