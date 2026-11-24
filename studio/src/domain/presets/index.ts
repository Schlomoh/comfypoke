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

/** A preset someone added to a subcategory, or a built-in one they removed (`hidden`). */
export type Own = { text: string; group?: string; hidden?: boolean };
/** Where presets added before subcategories took them are, and those of a row without any (Extra). */
export const MORE = "More";

/**
 * The subcategories offered in a row, for this gender: the built-in ones less what was removed from them, each with
 * what was added to it at its end. A subcategory not built in (More, Outfits) comes after them.
 */
export function presetGroups(row: PresetRow, gender: Gender, mine: readonly Own[]): [string, string[]][] {
  const hidden = new Set(mine.filter((p) => p.hidden).map((p) => p.text));
  const groups = new Map<string, string[]>();
  for (const g of PRESETS[row].filter((x) => fits(x, gender)))
    groups.set(g.name, [
      ...(groups.get(g.name) ?? []),
      ...g.items.map((t) => fill(t, gender)).filter((t) => !hidden.has(t)),
    ]);
  for (const p of mine.filter((x) => !x.hidden)) {
    if ([...groups.values()].some((items) => items.includes(p.text))) continue; // offered once, where it is first
    const g = p.group ?? MORE;
    groups.set(g, [...(groups.get(g) ?? []), p.text]);
  }
  return [...groups];
}

/** Whether a row offers this text already, in any subcategory. */
export const isOffered = (row: PresetRow, gender: Gender, text: string, mine: readonly Own[]) =>
  presetGroups(row, gender, mine).some(([, items]) => items.includes(text));

export const isBuiltIn = (row: PresetRow, gender: Gender, text: string) =>
  PRESETS[row].some((g) => fits(g, gender) && g.items.some((t) => fill(t, gender) === text));

/** A phrase as it reads for another gender, when it came from a preset written for any: "her hair" becomes "his hair". */
export function regender(row: PresetRow, text: string, from: Gender, to: Gender) {
  for (const g of PRESETS[row])
    for (const t of g.items) if (isGendered(t) && fill(t, from) === text) return fill(t, to);
  return text;
}
