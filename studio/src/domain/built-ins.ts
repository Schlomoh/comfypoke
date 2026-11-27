// The built-in presets in a catalog over time: seeded once, a release's new ones added and its changed ones revised
// where the person left them as they were, a row reset to them, and presets kept before the catalog brought in.
import { PRESETS } from "@/domain/presets";
import { GENDERS, type Gender } from "@/domain/presets/gender";
import { REVISIONS, type Revision } from "@/domain/presets/revisions";
import {
  addChunk,
  chunksOf,
  ensureSub,
  FIRST_SUB,
  has,
  next,
  onlyOf,
  readsAs,
  subNamed,
  subsOf,
  type Chunk,
  type Presets,
} from "@/domain/prompt-catalog";
import type { PresetRow } from "@/domain/rows";

/** A built-in preset, by the key a catalog remembers it by once it was seeded. */
type BuiltIn = { key: string; row: PresetRow; group: string; template: string; only?: Gender[] };

export const builtIns = (): BuiltIn[] =>
  (Object.entries(PRESETS) as [PresetRow, (typeof PRESETS)[PresetRow]][]).flatMap(([row, groups]) =>
    groups.flatMap((g) =>
      g.items.map((template) => ({
        key: `${row}/${g.name}/${template}`,
        row,
        group: g.name,
        template,
        ...(g.only ? { only: [...g.only] } : {}),
      })),
    ),
  );

const parts = (k: string) => {
  const [row, group, ...rest] = k.split("/");
  return { row: row as PresetRow, group, template: rest.join("/") };
};

/** The subcategory a built-in group's chunks are in here (renamed or not), leaving one chunk out. */
const homeOf = (cat: Presets, row: PresetRow, group: string, except?: string) =>
  cat.chunks.find((c) => c.id !== except && c.builtIn?.startsWith(`${row}/${group}/`))?.sub;

/** Into the subcategory where the rest of its group went (it may have been renamed), else one of its group's name. */
function seedOne(cat: Presets, b: BuiltIn): Presets {
  const home = homeOf(cat, b.row, b.group);
  return addChunk(cat, b.row, b.template, {
    ...(home ? { sub: home } : { name: b.group }),
    builtIn: b.key,
    ...(b.only ? { only: b.only } : {}),
  });
}

/**
 * The built-in presets not seeded yet: the first time all of them, after an update the new ones. One the person
 * removed was seen, so it stays gone. Returns the catalog and every key seen.
 */
export function sync(cat: Presets, seen: readonly string[]): [Presets, string[]] {
  const was = new Set(seen);
  const fresh = builtIns().filter((b) => !was.has(b.key));
  return [fresh.reduce(seedOne, cat), [...seen, ...fresh.map((b) => b.key)]];
}

/**
 * Built-in presets changed in a release, on a device that seeded them before. One the person left as it was (its
 * text and its key unchanged) follows: the new text, and the new group's subcategory when it still sat with the rest
 * of its old group; a dropped one goes. One they renamed or removed stays theirs. Either way its new key counts as
 * seen, so `sync` adds no second one. Returns the catalog and every key seen.
 */
export function revise(
  cat: Presets,
  seen: readonly string[],
  revisions: readonly Revision[] = REVISIONS,
): [Presets, string[]] {
  const known = new Set(seen);
  let out = cat;
  for (const { from, to } of revisions) {
    if (!known.has(from)) continue; // never seeded here: sync seeds what it became
    if (to) known.add(to);
    const was = parts(from);
    const c = out.chunks.find((x) => x.builtIn === from && x.text === was.template);
    if (!c) continue;
    const rest = { ...out, chunks: out.chunks.filter((x) => x.id !== c.id) };
    const now = to ? parts(to) : null;
    if (!to || !now || has(rest, c.row, now.template)) {
      out = rest;
      continue;
    }
    let sub = c.sub;
    const left = homeOf(out, c.row, was.group, c.id); // none: the rest of its group was removed
    const stayed = left ? c.sub === left : subNamed(out, c.row, was.group)?.id === c.sub;
    if (now.group !== was.group && stayed) {
      const there = homeOf(out, c.row, now.group);
      [out, sub] = there ? [out, there] : ensureSub(out, c.row, now.group);
    }
    const order = sub === c.sub ? c.order : next(chunksOf(out, sub));
    const changed = { ...c, text: now.template, builtIn: to, sub, order };
    out = { ...out, chunks: out.chunks.map((x) => (x.id === c.id ? changed : x)) };
  }
  return [out, [...known]];
}

/** A row as it was built in, with what the person typed kept, each in a subcategory of the name it had. */
export function resetRow(cat: Presets, row: PresetRow): Presets {
  const typed = subsOf(cat, row).flatMap((s) =>
    chunksOf(cat, s.id)
      .filter((c) => !c.builtIn)
      .map((c) => ({ c, name: s.name })),
  );
  let out: Presets = {
    subs: cat.subs.filter((s) => s.row !== row),
    chunks: cat.chunks.filter((c) => c.row !== row),
  };
  out = builtIns()
    .filter((b) => b.row === row)
    .reduce(seedOne, out);
  for (const { c, name } of typed)
    out = addChunk(out, row, c.text, { name, ...(c.only ? { only: c.only } : {}) });
  return out;
}

/** A preset as kept before the catalog: added to a subcategory by name (none: More), or a built-in one removed. */
export type LegacyPreset = { block: PresetRow; text: string; at: number; group?: string; hidden?: boolean };

/** The genders a built-in read as this text before a revision changed it: one removed before the catalog. */
const wasRead = (c: Chunk, text: string) =>
  REVISIONS.filter((r) => r.to === c.builtIn).flatMap((r) =>
    readsAs({ ...c, text: parts(r.from).template }, text),
  );

/** A built-in one removed before the catalog: it was removed as one gender read it, so it stays for the others. */
function hideLegacy(cat: Presets, p: LegacyPreset): Presets {
  const chunks = cat.chunks.flatMap((c) => {
    const gone = c.row === p.block && c.builtIn ? [...readsAs(c, p.text), ...wasRead(c, p.text)] : [];
    if (!gone.length) return [c];
    const left = (c.only ?? GENDERS).filter((g) => !gone.includes(g));
    const { only: _, ...rest } = c;
    return left.length ? [{ ...rest, ...onlyOf(left) }] : [];
  });
  return { ...cat, chunks };
}

/** Old presets into a catalog: each added where it was, and with `hide`, each removed built-in one taken out (a
 * backup only adds, so it passes false). */
export function fromLegacy(cat: Presets, presets: readonly LegacyPreset[], hide: boolean): Presets {
  let out = cat;
  for (const p of presets.toSorted((a, b) => a.at - b.at)) {
    if (!p.hidden) out = addChunk(out, p.block, p.text, { name: p.group ?? FIRST_SUB });
    else if (hide) out = hideLegacy(out, p);
  }
  return out;
}
