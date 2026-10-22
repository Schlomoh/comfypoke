// What Generate sends: one render per combination of versions, once per seed, each its own job. With
// shared seeds the versions of one seed differ only by the phrases that vary.
import { compose } from "@/domain/compose";
import type { Recipe } from "@/domain/recipe";
import { axes, collapse, combos } from "@/domain/versions";

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

export type Planned = {
  prompt: string;
  seed: number | null;
  recipe: Recipe;
  changes: string[];
  seedLabel: string;
};

function seedLabel(r: Recipe, s: number, seed: number | null) {
  if (r.sameSeed) return r.count > 1 ? `seed ${s + 1} of ${r.count}` : "one seed";
  return seed == null ? "random seed" : `seed ${seed}`;
}

/** Seeds outermost, so the versions of one seed sit next to each other in the library. */
export function plan(r: Recipe, triggers: string[], base = r.seed ?? randomSeed()): Planned[] {
  const ax = axes(r);
  const out: Planned[] = [];
  for (let s = 0; s < r.count; s++)
    for (const choice of combos(r)) {
      let seed: number | null = r.seed == null ? null : r.seed + out.length;
      if (r.sameSeed) seed = base + s;
      out.push({
        prompt: compose(r, triggers, (p) => choice.get(p.id) ?? p.t),
        seed,
        recipe: { ...collapse(r, choice), seed, count: 1 }, // what Reuse brings back: this render exactly
        changes: ax.map((a) => `${a.owner} · ${a.row}: ${choice.get(a.phrase.id)}`),
        seedLabel: seedLabel(r, s, seed),
      });
    }
  return out;
}

/** How many renders Generate sends. */
export const runCount = (r: Recipe) => axes(r).reduce((m, a) => m * a.values.length, 1) * r.count;

/** "6 renders: 3 wearing × 2 shot", or null for a single render. */
export function summary(r: Recipe) {
  const n = runCount(r);
  if (n === 1) return null;
  const parts = [
    ...axes(r).map((a) => `${a.values.length} ${a.row.toLowerCase()}`),
    ...(r.count > 1 ? [`${r.count} seeds`] : []),
  ];
  return `${n} renders: ${parts.join(" × ")}`;
}
