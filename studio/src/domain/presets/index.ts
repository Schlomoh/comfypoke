// Every row's built-in presets, as written in code, and how a phrase from one reads for another gender.
import { DOING } from "@/domain/presets/doing";
import { fill, isGendered, type Gender, type Group } from "@/domain/presets/gender";
import { REVISIONS } from "@/domain/presets/revisions";
import { SHOT, STYLE, WHERE } from "@/domain/presets/scene";
import { TOGETHER } from "@/domain/presets/together";
import { WEAR } from "@/domain/presets/wear";
import { LOOK, WHO } from "@/domain/presets/who";
import type { PresetRow } from "@/domain/rows";

/** The built-in presets: the seed of every catalog (domain/catalog.ts). */
export const PRESETS: Record<PresetRow, readonly Group[]> = {
  who: WHO,
  look: LOOK,
  wear: WEAR,
  doing: DOING,
  where: WHERE,
  shot: SHOT,
  style: STYLE,
  extra: [],
  together: TOGETHER,
};

/** A built-in's template, from its seed key (`row/group/template`). */
const template = (key: string) => key.split("/").slice(2).join("/");

/** A phrase as it reads for another gender, when it came from a preset written for any: "her hair" becomes "his hair". */
export function regender(row: PresetRow, text: string, from: Gender, to: Gender) {
  for (const g of PRESETS[row])
    for (const t of g.items) if (isGendered(t) && fill(t, from) === text) return fill(t, to);
  // a phrase from a built-in a release has changed since: as the new one reads
  for (const { from: was, to: now } of REVISIONS)
    if (now && was.startsWith(`${row}/`) && fill(template(was), from) === text)
      return fill(template(now), to);
  return text;
}
