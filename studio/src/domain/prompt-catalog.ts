// The prompt presets as a person keeps them: each row's subcategories in their order, each holding its chunks. The
// built-in ones (presets/) are seeded in once and are the person's from then on, to rename, reorder, move or
// remove like any they typed. Every edit is a function from one catalog to the next; the database writes the
// difference (data/db/prompt-catalog.ts), and the difference back is its Undo. Seeding, release changes and old
// presets are domain/built-ins.ts.
import { moved } from "@/domain/loras";
import { fill, GENDERS, isGendered, type Gender } from "@/domain/presets/gender";
import type { PresetRow } from "@/domain/rows";

export type Sub = { id: string; row: PresetRow; name: string; order: number };
/** `text` is a built-in one's template ("{their} hair"), filled per gender when shown; `only`: the genders it fits,
 * from its built-in group (one typed fits everyone); `builtIn`: its seed key. */
export type Chunk = {
  id: string;
  row: PresetRow;
  sub: string;
  text: string;
  order: number;
  only?: Gender[];
  builtIn?: string;
};
export type Presets = { subs: Sub[]; chunks: Chunk[] };
export type Change = { subs: Sub[]; chunks: Chunk[]; dropSubs: string[]; dropChunks: string[] };
export const NO_PRESETS: Presets = { subs: [], chunks: [] };

/** Where a typed preset goes in a row that has no subcategory yet (Extra), and old ones that had none. */
export const FIRST_SUB = "More";

const key = (t: string) => t.trim().replace(/\s+/g, " ").toLowerCase();
const byOrder = (a: { order: number }, b: { order: number }) => a.order - b.order;
const fits = (c: Chunk, g: Gender) => !c.only || c.only.includes(g);
export const next = (xs: readonly { order: number }[]) => Math.max(-1, ...xs.map((x) => x.order)) + 1;

export const subsOf = (cat: Presets, row: PresetRow) =>
  cat.subs.filter((s) => s.row === row).toSorted(byOrder);
export const chunksOf = (cat: Presets, sub: string) =>
  cat.chunks.filter((c) => c.sub === sub).toSorted(byOrder);

/** A subcategory and what it offers one gender, each chunk with its text as that gender reads it. */
export type Shelf = { sub: Sub; items: { chunk: Chunk; text: string }[] };

/**
 * A row's subcategories for one gender, in order. A text is offered once, where it comes first. A subcategory with
 * nothing for this gender is left out, unless it is empty for everyone: then it waits to be filled.
 */
export function view(cat: Presets, row: PresetRow, gender: Gender): Shelf[] {
  const seen = new Set<string>();
  const out: Shelf[] = [];
  for (const sub of subsOf(cat, row)) {
    const all = chunksOf(cat, sub.id);
    const items = all
      .filter((c) => fits(c, gender))
      .map((chunk) => ({ chunk, text: fill(chunk.text, gender) }))
      .filter(({ text }) => !seen.has(key(text)) && !!seen.add(key(text)));
    if (items.length || !all.length) out.push({ sub, items });
  }
  return out;
}

/** Every text a row offers this gender, in order. */
export const offered = (cat: Presets, row: PresetRow, gender: Gender) =>
  view(cat, row, gender).flatMap((s) => s.items.map((i) => i.text));

/** The genders a chunk offers this text to: "{their} hair" is "her hair" to a woman only. */
export const readsAs = (c: Chunk, text: string) =>
  (c.only ?? GENDERS).filter((g) => key(c.text) === key(text) || key(fill(c.text, g)) === key(text));

/** Whether a row offers this text already, to any gender. */
export const has = (cat: Presets, row: PresetRow, text: string) =>
  cat.chunks.some((c) => c.row === row && readsAs(c, text).length > 0);

/** `only` for these genders: none when that is everyone. */
export const onlyOf = (gs: readonly Gender[]) =>
  GENDERS.every((g) => gs.includes(g)) ? {} : { only: [...gs] };

/** A chunk offered to more genders. */
function widen(cat: Presets, c: Chunk, to: readonly Gender[]): Presets {
  const { only: _, ...rest } = c;
  const wider = {
    ...rest,
    ...onlyOf(GENDERS.filter((g) => !c.only || c.only.includes(g) || to.includes(g))),
  };
  return { ...cat, chunks: cat.chunks.map((x) => (x.id === c.id ? wider : x)) };
}

export const subNamed = (cat: Presets, row: PresetRow, name: string) =>
  cat.subs.find((s) => s.row === row && key(s.name) === key(name));

/** The subcategory of that name in the row, made at its end when there is none. */
export function ensureSub(cat: Presets, row: PresetRow, name: string): [Presets, string] {
  const found = subNamed(cat, row, name);
  if (found) return [cat, found.id];
  const sub: Sub = { id: crypto.randomUUID(), row, name: name.trim(), order: next(subsOf(cat, row)) };
  return [{ ...cat, subs: [...cat.subs, sub] }, sub.id];
}

/** Where a chunk goes: a subcategory by id, or by name (made if missing), else the row's first; with what it keeps. */
type Into = { sub?: string; name?: string } & Partial<Pick<Chunk, "only" | "builtIn">>;

/**
 * A chunk at the end of a subcategory; nothing when the row offers the text to every gender it is for already. When it
 * offers it to fewer (a built-in one for women only, typed for everyone), that one is widened instead, or for a
 * gendered one, which reads otherwise for the others, the typed text is added beside it.
 */
export function addChunk(cat: Presets, row: PresetRow, text: string, into: Into = {}): Presets {
  const { sub: at, name, ...more } = into;
  const t = text.trim();
  if (!t) return cat;
  const want = more.only ?? GENDERS;
  const same = cat.chunks.filter((c) => c.row === row && readsAs(c, t).length);
  const covered = new Set(same.flatMap((c) => readsAs(c, t)));
  if (want.every((g) => covered.has(g))) return cat;
  const plain = same.find((c) => !isGendered(c.text));
  if (plain) return widen(cat, plain, want);
  let sub = at && cat.subs.some((s) => s.id === at) ? at : undefined;
  if (!sub) [cat, sub] = ensureSub(cat, row, name ?? subsOf(cat, row)[0]?.name ?? FIRST_SUB);
  const chunk: Chunk = {
    id: crypto.randomUUID(),
    row,
    sub,
    text: t,
    order: next(chunksOf(cat, sub)),
    ...more,
  };
  return { ...cat, chunks: [...cat.chunks, chunk] };
}

/**
 * A chunk's text changed, keeping its place; nothing when another chunk of the row offers the new text. One written
 * for every gender ("{their} long hair") was renamed as one gender reads it, so the new text is that gender's only,
 * beside it, and the others keep the old one.
 */
export function renameChunk(cat: Presets, id: string, text: string, gender: Gender): Presets {
  const c = cat.chunks.find((x) => x.id === id);
  const t = text.trim();
  const others = { ...cat, chunks: cat.chunks.filter((x) => x.id !== id) };
  if (!c || !t || has(others, c.row, t)) return cat;
  if (!isGendered(c.text))
    return { ...cat, chunks: cat.chunks.map((x) => (x.id === id ? { ...x, text: t } : x)) };
  const { only: _, builtIn: __, ...rest } = c;
  const mine: Chunk = { ...rest, id: crypto.randomUUID(), text: t, only: [gender], order: c.order + 0.5 };
  const left = (c.only ?? GENDERS).filter((g) => g !== gender);
  const chunks = cat.chunks.flatMap((x) => {
    if (x.id !== id) return [x];
    const { only: ___, ...kept } = x;
    return left.length ? [{ ...kept, ...onlyOf(left) }, mine] : [mine];
  });
  return { ...cat, chunks };
}

export const removeChunks = (cat: Presets, ids: readonly string[]): Presets => ({
  ...cat,
  chunks: cat.chunks.filter((c) => !ids.includes(c.id)),
});

/** A chunk to the end of another subcategory of its row. */
export function moveChunk(cat: Presets, id: string, sub: string): Presets {
  const end = next(chunksOf(cat, sub));
  return {
    ...cat,
    chunks: cat.chunks.map((c) => (c.id === id && c.sub !== sub ? { ...c, sub, order: end } : c)),
  };
}

/** A new subcategory at the end of the row, or the one of that name. */
export const addSub = (cat: Presets, row: PresetRow, name: string) => ensureSub(cat, row, name);

/** Renamed; onto the name of another in the row, the two become one, the other keeping its place. */
export function renameSub(cat: Presets, id: string, name: string): Presets {
  const sub = cat.subs.find((s) => s.id === id);
  const n = name.trim();
  if (!sub || !n) return cat;
  const other = subNamed(cat, sub.row, n);
  if (!other || other.id === id)
    return { ...cat, subs: cat.subs.map((s) => (s.id === id ? { ...s, name: n } : s)) };
  let out = cat;
  for (const c of chunksOf(cat, id)) out = moveChunk(out, c.id, other.id);
  return { ...out, subs: out.subs.filter((s) => s.id !== id) };
}

/** A subcategory moved from one place in its row to another. */
export function reorderSubs(cat: Presets, row: PresetRow, from: number, to: number): Presets {
  const order = new Map(moved(subsOf(cat, row), from, to).map((s, i) => [s.id, i]));
  return {
    ...cat,
    subs: cat.subs.map((s) => (order.has(s.id) ? { ...s, order: order.get(s.id) as number } : s)),
  };
}

/** A subcategory and everything in it. */
export const deleteSub = (cat: Presets, id: string): Presets => ({
  subs: cat.subs.filter((s) => s.id !== id),
  chunks: cat.chunks.filter((c) => c.sub !== id),
});

/** Another device's catalog into this one: subcategories by name, chunks by text, only ever adding. */
export function merge(cat: Presets, incoming: Presets): Presets {
  let out = cat;
  for (const s of incoming.subs.toSorted(byOrder)) {
    const kids = chunksOf(incoming, s.id);
    if (!kids.length) [out] = ensureSub(out, s.row, s.name);
    // by name, so the subcategory is made only when something new goes into it
    for (const c of kids)
      out = addChunk(out, s.row, c.text, {
        name: s.name,
        ...(c.only ? { only: c.only } : {}),
        ...(c.builtIn ? { builtIn: c.builtIn } : {}),
      });
  }
  return out;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const byId = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));

/** What turns `from` into `to`: the records to put and the ids to drop. */
export function diff(from: Presets, to: Presets): Change {
  const subs = byId(from.subs);
  const chunks = byId(from.chunks);
  const now = { subs: new Set(to.subs.map((s) => s.id)), chunks: new Set(to.chunks.map((c) => c.id)) };
  return {
    subs: to.subs.filter((s) => !same(subs.get(s.id), s)),
    chunks: to.chunks.filter((c) => !same(chunks.get(c.id), c)),
    dropSubs: from.subs.filter((s) => !now.subs.has(s.id)).map((s) => s.id),
    dropChunks: from.chunks.filter((c) => !now.chunks.has(c.id)).map((c) => c.id),
  };
}

export const isEmpty = (c: Change) =>
  !c.subs.length && !c.chunks.length && !c.dropSubs.length && !c.dropChunks.length;
