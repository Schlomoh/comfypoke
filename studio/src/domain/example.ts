// A first recipe in one tap: the first person's Who and Look and the scene's Where and Shot, each one preset from its
// row's first subcategory (an age, a haircut, a room, a framing), so every row shows what it is for.
import type { Gender } from "@/domain/presets/gender";
import { view, type Presets } from "@/domain/prompt-catalog";
import { phrase, type Recipe } from "@/domain/recipe";
import type { PresetRow } from "@/domain/rows";

const random = (n: number) => Math.floor(Math.random() * n);

/** Whether an example would replace nothing: the four rows it fills are empty, switched-off phrases included. */
export const blank = (r: Recipe) =>
  ![r.cast[0].who, r.cast[0].look, r.scene.where, r.scene.shot].some((xs) => xs.length);

export function example(r: Recipe, presets: Presets, pick = random): Recipe {
  const one = (row: PresetRow, gender: Gender) => {
    const items = view(presets, row, gender).find((s) => s.items.length)?.items ?? [];
    return items.length ? [phrase(items[pick(items.length)].text)] : [];
  };
  const [first, ...rest] = r.cast;
  return {
    ...r,
    cast: [{ ...first, who: one("who", first.gender), look: one("look", first.gender) }, ...rest],
    scene: { ...r.scene, where: one("where", "person"), shot: one("shot", "person") },
  };
}
