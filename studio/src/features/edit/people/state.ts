// What People knows of each image while the workspace is open: the faces found on it and what is done to each, by
// render id like the masks. Going to another image and back finds them as they were left.
import { atom } from "jotai";

import { outfitPieces } from "@/domain/outfits";
import type { Found, Pick } from "@/domain/people";
import type { Person } from "@/domain/recipe";

/** One face found, or with `found` null the one person of a picture where no face was found, and what is done to them. */
export type PersonRow = { found: Found | null; pick: Pick };
export const peopleAtom = atom<Readonly<Record<string, PersonRow[]>>>({});

/** The person selected on an image (their face's place, left to right): whose area the bar under the stage edits. */
export const selectedAtom = atom<{ id: string; index: number } | null>(null);

/** Each person's color, by their face's place: their tag, their card's edge and their area on the stage. */
const COLORS = ["#ff3ea5", "#3ec5ff", "#ffd23e", "#7ee36a"] as const;
export const colorOf = (index: number) => COLORS[index % COLORS.length];

/** The clothes a person's outfit replaces, by the words SAM finds them by (features/edit/use-find's PARTS). */
export const DEFAULT_PART = "all clothes";
/** A person's area as found for them (use-areas.ts): the first step of their mask, replaced when found again. */
export const AREA_STEP = "area";
/** The areas asked for, as "<mask key>|<part>": each person's is found once a part, so taking it out of their mask
 * leaves it out, and nothing found is not asked again in a loop. Finding the faces again forgets an image's. */
export const askedAtom = atom<ReadonlySet<string>>(new Set<string>());

/** What a found face starts with: the person it was taken for, dressed when their Wearing row has something, and their
 * face redrawn when there is a face to redraw. */
export function startPick(person: Person | undefined, found: Found | null): Pick {
  return {
    who: person?.id ?? null,
    outfit: !!person && outfitPieces(person).length > 0,
    part: DEFAULT_PART,
    face: !!person && !!found,
  };
}
