// Keep outfit: what a dressed image wears becomes one of your Wearing presets, and goes into the closet of the saved
// character dressed: their Wearing row, switched off, to switch on another time.
import { addPreset } from "@/data/db/presets";
import { updateSaved } from "@/data/db/saved";
import { db } from "@/data/db/schema";
import type { Space } from "@/data/db/space";
import { isBuiltIn } from "@/domain/presets";
import { GENDERS } from "@/domain/presets/gender";
import { phrase, type Phrase } from "@/domain/recipe";
import type { Render } from "@/domain/render";
import { notify } from "@/ui/notify";

/** The outfit a dressed image wears, or null for anything else. */
export const outfitOf = (r: Render) => (r.edit?.dress && r.edit.prompt.trim()) || null;

/** Whether a Wearing row has every piece already, as a chip or one of its versions. */
const owns = (row: Phrase[], pieces: string[]) =>
  pieces.every((piece) => row.some((p) => [p.t, ...p.versions].some((t) => t.trim() === piece)));

export async function keepOutfit(space: Space, r: Render) {
  const outfit = outfitOf(r);
  if (!outfit) return;
  const offered =
    GENDERS.some((g) => isBuiltIn("wear", g, outfit)) ||
    (await db.presets
      .where("block")
      .equals("wear")
      .filter((p) => p.text === outfit)
      .count()) > 0;
  if (!offered) await addPreset("wear", outfit);
  const who = r.edit?.dress?.who; // recorded when it was dressed: the recipe may hold others
  const pieces = r.edit?.dress?.pieces ?? [outfit];
  const closet = { of: "" }; // whose, once written
  if (who) {
    const wrote = await updateSaved(space, who, (s) => {
      closet.of = s.name;
      const row = s.rows.wear ?? [];
      return owns(row, pieces)
        ? s
        : { ...s, rows: { ...s.rows, wear: [...row, { ...phrase(outfit), on: false }] } };
    });
    if (!wrote) closet.of = ""; // deleted since
  }
  notify(
    closet.of
      ? `Kept “${outfit}” in the Wearing presets and in ${closet.of}'s closet`
      : `Kept “${outfit}” in the Wearing presets`,
  );
}
