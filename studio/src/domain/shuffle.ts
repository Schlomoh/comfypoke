// Shuffling from the presets: a die on a row adds one of its presets as a version (another render), and Surprise me
// makes renders that each change one row to a preset, leaving the pinned rows alone.
import { presetGroups } from "@/domain/presets";
import type { Gender } from "@/domain/presets/gender";
import { phrase, type Phrase, type Recipe } from "@/domain/recipe";
import { PERSON_ROWS, SCENE_ROWS, type RowId } from "@/domain/rows";

/** A row of the recipe: a person's (by id) or the scene's. */
export const rowKey = (owner: string, row: RowId) => `${owner}:${row}`;
export const SCENE = "scene";

/** Your own presets for the row, then the built-in ones for this gender: everything its picker offers. */
export const offered = (row: RowId, gender: Gender, mine: { block: string; text: string }[]) =>
  presetGroups(
    row,
    gender,
    mine.filter((p) => p.block === row).map((p) => p.text),
  ).flatMap(([, items]) => items);

/** The presets a row could still take: not already one of its phrases or versions. */
export function fresh(phrases: Phrase[], presets: string[]): string[] {
  const used = new Set(phrases.flatMap((p) => [p.t, ...p.versions].map((t) => t.trim())));
  return [...new Set(presets.map((t) => t.trim()))].filter((t) => t && !used.has(t));
}

/** The row with `text` as another version of its first switched-on phrase, or as its first phrase when it has none. */
export function withVersion(phrases: Phrase[], text: string): Phrase[] {
  const at = phrases.findIndex((p) => p.on && p.t.trim());
  if (at === -1) return [...phrases, phrase(text)];
  return phrases.map((p, i) => (i === at ? { ...p, versions: [...p.versions, text] } : p));
}

/** A copy in random order, each order as likely (Fisher-Yates). */
export function shuffled<T>(xs: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

type Slot = { owner: string; row: RowId; label: string; phrases: Phrase[]; options: string[] };

/** The recipe with one row's phrases set, a person's or the scene's. */
function setRow(r: Recipe, owner: string, row: RowId, phrases: Phrase[]): Recipe {
  if (owner === SCENE) return { ...r, scene: { ...r.scene, [row]: phrases } };
  return { ...r, cast: r.cast.map((p) => (p.id === owner ? { ...p, [row]: phrases } : p)) };
}

const unvaried = (ps: Phrase[]) => ps.map((p) => (p.versions.length ? { ...p, versions: [] } : p));

/** Every phrase as it reads now, without versions: a surprise is one render. */
const plain = (r: Recipe): Recipe => {
  let out = { ...r, together: unvaried(r.together) as Recipe["together"] };
  for (const p of r.cast) for (const row of PERSON_ROWS) out = setRow(out, p.id, row.id, unvaried(p[row.id]));
  for (const row of SCENE_ROWS) out = setRow(out, SCENE, row.id, unvaried(r.scene[row.id]));
  return out;
};

/**
 * Up to `n` renders, each with one row not pinned changed to one of its presets, said in its label: each row once
 * before any twice, no change twice. None when no row has a preset to offer.
 */
export function surprises(
  r: Recipe,
  presets: { block: string; text: string }[],
  n: number,
  rand: () => number = Math.random,
): { recipe: Recipe; label: string }[] {
  const slots: Slot[] = [
    ...r.cast.flatMap((p) =>
      PERSON_ROWS.map((row) => ({
        owner: p.id,
        row: row.id,
        label: `${p.name || "them"} · ${row.label.toLowerCase()}`,
        phrases: p[row.id],
        options: fresh(p[row.id], offered(row.id, p.gender, presets)),
      })),
    ),
    ...SCENE_ROWS.map((row) => ({
      owner: SCENE,
      row: row.id,
      label: row.label.toLowerCase(),
      phrases: r.scene[row.id],
      options: fresh(r.scene[row.id], offered(row.id, "person", presets)),
    })),
  ].filter((s) => !r.pinned.includes(rowKey(s.owner, s.row)) && s.options.length);
  if (!slots.length) return [];
  // every row once before any row twice, and never the same change twice: fewer when that runs out
  const order = shuffled(slots, rand).map((s) => ({ ...s, options: shuffled(s.options, rand) }));
  const most = Math.max(...order.map((s) => s.options.length));
  const pairs = Array.from({ length: most }, (_, k) =>
    order.flatMap((s) => (k < s.options.length ? [{ s, text: s.options[k] }] : [])),
  ).flat();
  const base = plain(r);
  return pairs.slice(0, n).map(({ s, text }) => ({
    recipe: { ...setRow(base, s.owner, s.row, [phrase(text)]), count: 1 },
    label: `${s.label}: ${text}`,
  }));
}
