// What the Edit tab remembers while the workspace is open: each image's mask, the brush, and the choices, which stay
// for the next image (editing a few in a row is the usual way). The brush size stays across visits.
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import type { Hold } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import type { At } from "@/features/stage/zoom-view";

/** Each image's mask, by render id: going to another image and back finds it as it was left. */
export const masksAtom = atom<Readonly<Record<string, Op[]>>>({});

/** The brush's diameter in screen pixels, so it looks the same at any zoom: zoom in for fine work. */
export const BRUSH = { min: 4, max: 160 } as const;
export const brushAtom = atomWithStorage("studio.brush", 32, undefined, { getOnInit: true });
/** What a finger on the stage does: paint, erase, or tap to have SAM find what is there. */
export type Tool = "brush" | "eraser" | "tap";
export const toolAtom = atom<Tool>("brush");

/** Points tapped on an image, in fractions of it, while their area is still open to change: `op` is the id of the
 * mask step the found area is (features/edit/use-taps.ts). Done, or another tool, keeps the area and clears these. */
export type Tap = { at: At; not: boolean }; // not: a "not this" point, from a hold or Alt
export type Taps = { op: string; points: Tap[] };
export const tapsAtom = atom<Readonly<Record<string, Taps>>>({});
/** The image whose tapped area is being found right now, with its stage; null when nothing runs. */
export const tapStageAtom = atom<{ id: string; stage: string } | null>(null);
/** The image whose fitted body the stage shows instead of it, to check what dressing will hold; null for none. */
export const showBodyAtom = atom<string | null>(null);

/** A pass runs with: the Model tab as it is ("tab"), the image's own model ("own"), or a saved setup's id. */
export type PassChoice = string;
export type EditChoice = {
  mode: "dress" | "repaint";
  person: string | null; // who is edited: whose Wearing row dresses, whose rows describe them; null is the first
  portrait: boolean; // the person's Who, Look and Wearing go into the prompt (compose.ts portrait)
  hold: Hold;
  dresser: PassChoice;
  finish: PassChoice; // or "off": no finish
  strength: number;
  repaint: string; // what goes inside the mask
  repaintWith: PassChoice;
  face: string; // a face photo's id, "" for none
};

export const editAtom = atom<EditChoice>({
  mode: "dress",
  person: null,
  portrait: true,
  hold: "tight",
  dresser: "zimage-turbo",
  finish: "own",
  strength: 0.35,
  repaint: "",
  repaintWith: "own",
  face: "",
});
