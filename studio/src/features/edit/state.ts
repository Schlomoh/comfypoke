// What the Edit tab remembers while the workspace is open: each image's mask, the brush, and the choices, which stay
// for the next image (editing a few in a row is the usual way). The brush size stays across visits.
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import type { Hold } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import type { At } from "@/features/stage/zoom-view";

/** Each mask, by its key (maskKey): an image's own, for a repaint, or one person's on it, in People. Going to another
 * image and back finds them as they were left. */
export const masksAtom = atom<Readonly<Record<string, Op[]>>>({});

/** Whose mask: the image's own, or the person of People at face `person` (left to right) on it. */
export const maskKey = (renderId: string, person?: number | null) =>
  person === undefined || person === null ? renderId : `${renderId}:${person}`;
/** The keys of every person's mask on an image. */
export const isPersonKey = (key: string, renderId: string) => key.startsWith(`${renderId}:`);

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
export const tapsAtom = atom<Readonly<Record<string, Taps>>>({}); // by mask key
/** While held (the "before" button, or C), the image held on: the stage shows the image it was made from, under its
 * mask. Only that image: one left behind while held never opens on its source. */
export const peekAtom = atom<string | null>(null);

/** A pass runs with: the Model tab as it is ("tab"), the image's own model ("own"), or a saved setup's id. */
export type PassChoice = string;
export type EditChoice = {
  mode: "people" | "repaint"; // everyone on the image (features/edit/people), or an area by its mask
  person: string | null; // who a repaint keeps as written; null is the first
  portrait: boolean; // the person's Who, Look and Wearing go into the prompt (compose.ts portrait)
  hold: Hold;
  dresser: PassChoice;
  finish: PassChoice; // or "off": no finish; over new clothes, or over a repaint
  strength: number;
  repaint: string; // what goes inside the mask
  face: string; // a face photo's id, "" for none
  faceWith: PassChoice; // People: what faces are redrawn with, each with their own words and LoRAs
  faceStrength: number;
  takes: number; // each outfit, or the repaint, this many times, each with its own seed
};

export const editAtom = atom<EditChoice>({
  mode: "repaint", // works with only a mask and words; People finds faces first
  person: null,
  portrait: true,
  hold: "tight",
  dresser: "zimage-turbo",
  finish: "own",
  strength: 0.35,
  repaint: "",
  face: "",
  faceWith: "own",
  faceStrength: 0.35,
  takes: 1,
});
export const TAKES = [1, 2, 3, 4, 6, 8] as const;

/** Whether the Edit tab's folded parts are open: the options (hold, who is kept, takes) and the outfits spelled out. */
export const optionsOpenAtom = atom(false);
export const rendersOpenAtom = atom(false);
