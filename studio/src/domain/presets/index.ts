// Every row's presets, as offered to a person of one gender.
import { DOING } from "@/domain/presets/doing";
import { fill, isGendered, type Gender, type Group } from "@/domain/presets/gender";
import { SHOT, STYLE, WHERE } from "@/domain/presets/scene";
import { TOGETHER } from "@/domain/presets/together";
import { WEAR } from "@/domain/presets/wear";
import { LOOK, WHO } from "@/domain/presets/who";
import type { PresetRow } from "@/domain/rows";

const PRESETS: Record<PresetRow, readonly Group[]> = {
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

const fits = (g: Group, gender: Gender) => !g.only || g.only.includes(gender);

/** The subcategories offered in a row: your own first, as Yours, then the built-in ones for this gender. */
export function presetGroups(row: PresetRow, gender: Gender, mine: string[]): [string, string[]][] {
  const groups = new Map<string, string[]>(mine.length ? [["Yours", mine]] : []);
  for (const g of PRESETS[row].filter((x) => fits(x, gender)))
    groups.set(g.name, [...(groups.get(g.name) ?? []), ...g.items.map((t) => fill(t, gender))]);
  return [...groups];
}

export const isBuiltIn = (row: PresetRow, gender: Gender, text: string) =>
  PRESETS[row].some((g) => fits(g, gender) && g.items.some((t) => fill(t, gender) === text));

/** A phrase as it reads for another gender, when it came from a preset written for any: "her hair" becomes "his hair". */
export function regender(row: PresetRow, text: string, from: Gender, to: Gender) {
  for (const g of PRESETS[row])
    for (const t of g.items) if (isGendered(t) && fill(t, from) === text) return fill(t, to);
  return text;
}
