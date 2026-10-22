// The people in the picture and its scene: finding a row, changing it, and comparing a tab with the
// saved character (or scene) it is linked to. Every change takes the recipe as it is now and returns a
// new one, so it can run inside a state update and never works from a stale copy.
import type { Person, Phrase, Recipe, Scene } from "@/domain/recipe";
import { PERSON_ROWS, PRESETS, ROWS, SCENE_ROWS, type RowId } from "@/domain/rows";
import type { Saved } from "@/domain/saved";

export type Key = string; // a person's id, or "scene"
export type Kind = "person" | "scene";
/** One row of one tab. */
export type RowRef = { key: Key; row: RowId };
type Owner = Person | Scene;
type Rows = Partial<Record<RowId, Phrase[]>>;

export const kindOf = (key: Key): Kind => (key === "scene" ? "scene" : "person");
export const defsOf = (kind: Kind) => (kind === "scene" ? SCENE_ROWS : PERSON_ROWS);
export function rowDef(id: RowId) {
  const def = ROWS.find((r) => r.id === id);
  if (!def) throw new Error(`no row ${id}`);
  return def;
}

const rowsOf = (o: Owner): Rows => o;
export const isPerson = (o: Owner): o is Person => "side" in o;
export const ownerOf = (r: Recipe, key: Key): Owner | undefined =>
  key === "scene" ? r.scene : r.cast.find((c) => c.id === key);
export const nameOf = (r: Recipe, key: Key) => (key === "scene" ? "Scene" : (ownerOf(r, key)?.name ?? ""));
export const phrasesOf = (r: Recipe, { key, row }: RowRef): Phrase[] => {
  const o = ownerOf(r, key);
  return (o && rowsOf(o)[row]) ?? [];
};

export function withPerson(r: Recipe, id: string, change: (p: Person) => Person): Recipe {
  return { ...r, cast: r.cast.map((c) => (c.id === id ? change(c) : c)) };
}

/** Puts back a whole person or scene, as it was: Undo of a switch or a discard. */
export function replaceOwner(r: Recipe, key: Key, o: Owner): Recipe {
  if (key === "scene") return isPerson(o) ? r : { ...r, scene: o };
  return isPerson(o) ? withPerson(r, key, () => o) : r;
}

/** Renames a person or the scene; the name never goes into the prompt. */
export function renameOwner(r: Recipe, key: Key, name: string, savedId?: string | null): Recipe {
  const link = savedId === undefined ? {} : { savedId };
  if (key === "scene") return { ...r, scene: { ...r.scene, name, ...link } };
  return withPerson(r, key, (p) => ({ ...p, name, ...link }));
}

export function editRow(r: Recipe, { key, row }: RowRef, change: (ps: Phrase[]) => Phrase[]): Recipe {
  const apply = <T extends Owner>(o: T): T => ({ ...o, [row]: change(rowsOf(o)[row] ?? []) });
  if (key === "scene") return { ...r, scene: apply(r.scene) };
  return withPerson(r, key, apply);
}

export const editPhrase = (r: Recipe, at: RowRef & { id: string }, change: (p: Phrase) => Phrase) =>
  editRow(r, at, (ps) => ps.map((p) => (p.id === at.id ? change(p) : p)));

export const insertAt = <T>(xs: readonly T[], at: number, x: T) => [...xs.slice(0, at), x, ...xs.slice(at)];

// ---- presets

/** The subcategories offered in a row: your own first, as Yours, then the built-in ones. */
export function presetGroups(row: RowId, mine: string[]): [string, string[]][] {
  return [...(mine.length ? [["Yours", mine] as [string, string[]]] : []), ...Object.entries(PRESETS[row])];
}
export const isBuiltIn = (row: RowId, text: string) =>
  Object.values(PRESETS[row]).some((xs) => xs.includes(text));
/** The built-in subcategory a phrase came from, if it came from one. */
export const homeGroup = (row: RowId, text: string) =>
  Object.entries(PRESETS[row]).find(([, xs]) => xs.includes(text))?.[0];

// ---- the link to a saved character or scene

const snap = (ps: Phrase[] | undefined) =>
  JSON.stringify((ps ?? []).filter((p) => p.t.trim()).map(({ t, on, versions }) => [t, on, versions]));

/** What a save keeps: the rows of its kind, without empty phrases. */
export const rowsToSave = (kind: Kind, o: Owner): Rows =>
  Object.fromEntries(defsOf(kind).map((d) => [d.id, (rowsOf(o)[d.id] ?? []).filter((p) => p.t.trim())]));

/** A tab as a saved entry: a new one, or (with `s`) the update of the one it is linked to. */
export const toEntry = (kind: Kind, o: Owner, s?: Saved): Saved => ({
  id: s?.id ?? crypto.randomUUID(),
  name: o.name,
  kind,
  rows: rowsToSave(kind, o),
  updatedAt: Date.now(),
});

/** A saved entry's rows as new phrases, with ids of their own so two tabs never share one. */
export const freshRows = (kind: Kind, s: Saved) =>
  Object.fromEntries(
    defsOf(kind).map((d) => [
      d.id,
      (s.rows[d.id] ?? []).map((p) => Object.assign({}, p, { id: crypto.randomUUID() })),
    ]),
  );

/** A person or scene made into a saved entry: name and rows, nothing of where it stands in this picture. */
export function adoptSaved<T extends Owner>(o: T, kind: Kind, s: Saved): T {
  return { ...o, ...freshRows(kind, s), name: s.name, savedId: s.id };
}

/** The saved entry a tab is linked to, and what differs from it. */
export function linkState(kind: Kind, o: Owner, saved: Saved[]) {
  const s = saved.find((x) => x.kind === kind && x.id === o.savedId);
  if (!s) return { s, diff: [], changed: false };
  const rows = defsOf(kind).filter((d) => snap(rowsOf(o)[d.id]) !== snap(s.rows[d.id]));
  const diff = [...(s.name === o.name ? [] : ["name"]), ...rows.map((d) => d.label.toLowerCase())];
  return { s, diff, changed: diff.length > 0 };
}

export const isPlaceholder = (name: string) => !name.trim() || /^Person \d+$/.test(name.trim());

/** The next free "Person n". */
export function placeholderName(r: Recipe) {
  let k = 1;
  while (r.cast.some((c) => c.name === `Person ${k}`)) k++;
  return `Person ${k}`;
}
