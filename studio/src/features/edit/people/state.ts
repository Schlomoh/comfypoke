// What People knows of each image while the workspace is open: the faces found on it and what is done to each, by
// render id like the masks. Going to another image and back finds them as they were left.
import { atom } from "jotai";

import { outfitPieces } from "@/domain/outfits";
import type { Found, Pick } from "@/domain/people";
import type { Person } from "@/domain/recipe";

/** One face found, or with `found` null the one person of a picture where no face was found, and what is done to them. */
export type PersonRow = { found: Found | null; pick: Pick };
export const peopleAtom = atom<Readonly<Record<string, PersonRow[]>>>({});

/** The images whose faces are being found right now, each with its stage. */
export const findingAtom = atom<Readonly<Record<string, string>>>({});

/** The row a tap on a face's tag points at, briefly marked in the panel. */
export const pointedAtom = atom<number | null>(null);

/** The clothes a person's outfit replaces: the words SAM finds them by (as features/edit/use-find's PARTS), or the
 * mask as it is painted. */
export const DEFAULT_PART = "all clothes";
export const MASK_PART = "the mask";

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
