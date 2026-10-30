// The people in the picture and its scene: finding a row, changing it, and comparing a tab with the
// saved character (or scene) it is linked to. Every change takes the recipe as it is now and returns a
// new one, so it can run inside a state update and never works from a stale copy.
import { onto } from "@/domain/compose";
import type { Gender } from "@/domain/presets/gender";
import { regender } from "@/domain/presets/index";
import type { Interaction, Person, Phrase, Recipe, Scene } from "@/domain/recipe";
import { PERSON_ROWS, ROWS, SCENE_ROWS, type PersonRow, type RowId } from "@/domain/rows";
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

/** One list of phrases in the recipe, to read and change: a row, or what people do together. */
export type Lens<T extends Phrase = Phrase> = {
  get: (r: Recipe) => T[];
  edit: (r: Recipe, change: (xs: T[]) => T[]) => Recipe;
};
export const rowLens = (at: RowRef): Lens => ({
  get: (r) => phrasesOf(r, at),
  edit: (r, c) => editRow(r, at, c),
});

export const insertAt = <T>(xs: readonly T[], at: number, x: T) => [...xs.slice(0, at), x, ...xs.slice(at)];

/** A person as another gender: phrases taken from presets written for any gender follow ("her hair" becomes "his hair"). */
export const setGender = (r: Recipe, id: string, g: Gender) =>
  withPerson(r, id, (p) => {
    const fix = (row: PersonRow) => {
      const re = (t: string) => regender(row, t, p.gender, g);
      return p[row].map((x) => ({ ...x, t: re(x.t), versions: x.versions.map(re) }));
    };
    return { ...p, gender: g, who: fix("who"), look: fix("look"), wear: fix("wear"), doing: fix("doing") };
  });

/** The person whose face photo a render swaps in: the first one in the picture with a photo. The head swap takes one. */
export const faceFor = (r: Recipe) =>
  r.cast.find(
    (c) =>
      c.face &&
      (PERSON_ROWS.some((row) => c[row.id].some((p) => p.on && p.t.trim())) ||
        r.together.some((i) => i.on && i.t.trim() && involves(i, c.id))),
  );

// ---- what people do with each other

/** An interaction as the editor shows it: "Ava has an arm around Lena". */
export const sayTogether = (r: Recipe, i: Interaction, t = i.t) =>
  `${nameOf(r, i.from)} ${onto(t, nameOf(r, i.to))}`;

export const involves = (i: Interaction, id: string) => i.from === id || i.to === id;

export const togetherLens: Lens<Interaction> = {
  get: (r) => r.together,
  edit: (r, change) => ({ ...r, together: change(r.together) }),
};

/** The second person an interaction from `from` most likely means: the one after them, round. */
export function partnerOf(r: Recipe, from: string) {
  const at = r.cast.findIndex((c) => c.id === from);
  return r.cast[(at + 1) % r.cast.length].id;
}

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
  ...(isPerson(o) ? { gender: o.gender, ...(o.face ? { face: o.face } : {}) } : {}),
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
  const person = isPerson(o) ? { ...(s.gender ? { gender: s.gender } : {}), face: s.face ?? null } : {};
  return { ...o, ...freshRows(kind, s), ...person, name: s.name, savedId: s.id };
}

/** The saved entry a tab is linked to, and what differs from it. */
export function linkState(kind: Kind, o: Owner, saved: Saved[]) {
  const s = saved.find((x) => x.kind === kind && x.id === o.savedId);
  if (!s) return { s, diff: [], changed: false };
  const rows = defsOf(kind).filter((d) => snap(rowsOf(o)[d.id]) !== snap(s.rows[d.id]));
  const gender = isPerson(o) && s.gender && s.gender !== o.gender ? ["gender"] : [];
  const face = isPerson(o) && (s.face ?? null) !== o.face ? ["face"] : [];
  const diff = [
    ...(s.name === o.name ? [] : ["name"]),
    ...gender,
    ...face,
    ...rows.map((d) => d.label.toLowerCase()),
  ];
  return { s, diff, changed: diff.length > 0 };
}

export const isPlaceholder = (name: string) => !name.trim() || /^Person \d+$/.test(name.trim());

/** The next free "Person n". */
export function placeholderName(r: Recipe) {
  let k = 1;
  while (r.cast.some((c) => c.name === `Person ${k}`)) k++;
  return `Person ${k}`;
}
