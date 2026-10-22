import type { Phrase, Recipe } from "@/domain/recipe";
// Every phrase with versions is one axis; the renders are every combination.
import { PERSON_ROWS, SCENE_ROWS } from "@/domain/rows";

export type Axis = { owner: string; row: string; phrase: Phrase; values: string[] };
export function axes(r: Recipe): Axis[] {
  const out: Axis[] = [];
  // a phrase emptied while its sheet is open is not in the prompt, so it varies nothing
  const add = (owner: string, row: string, p: Phrase) => {
    if (p.on && p.t.trim() && p.versions.length)
      out.push({ owner, row, phrase: p, values: [p.t, ...p.versions] });
  };
  for (const c of r.cast) for (const row of PERSON_ROWS) for (const p of c[row.id]) add(c.name, row.label, p);
  for (const row of SCENE_ROWS) for (const p of r.scene[row.id]) add("Scene", row.label, p);
  return out;
}
/** One map of phrase id to text per render, before seeds. */
export function combos(r: Recipe) {
  let acc = [new Map<string, string>()];
  for (const a of axes(r)) acc = acc.flatMap((m) => a.values.map((v) => new Map([...m, [a.phrase.id, v]])));
  return acc;
}
/** The recipe one render was made with: each phrase as the version it used, with no versions left. Reuse gets exactly that. */
export function collapse(r: Recipe, choice: Map<string, string>): Recipe {
  const fix = (ps: Phrase[]) => ps.map((p) => ({ ...p, t: choice.get(p.id) ?? p.t, versions: [] }));
  return {
    ...r,
    cast: r.cast.map((c) => ({
      ...c,
      who: fix(c.who),
      look: fix(c.look),
      wear: fix(c.wear),
      doing: fix(c.doing),
    })),
    scene: {
      ...r.scene,
      where: fix(r.scene.where),
      shot: fix(r.scene.shot),
      style: fix(r.scene.style),
      extra: fix(r.scene.extra),
    },
  };
}
