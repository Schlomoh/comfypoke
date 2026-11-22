// What the Edit tab remembers while the workspace is open: each image's mask, the brush, and the choices, which stay
// for the next image (editing a few in a row is the usual way). The brush size stays across visits.
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import type { Hold } from "@/domain/render";
import type { Op } from "@/features/edit/mask";

/** Each image's mask, by render id: going to another image and back finds it as it was left. */
export const masksAtom = atom<Readonly<Record<string, Op[]>>>({});

/** The brush's diameter in screen pixels, so it looks the same at any zoom: zoom in for fine work. */
export const BRUSH = { min: 4, max: 160 } as const;
export const brushAtom = atomWithStorage("studio.brush", 32, undefined, { getOnInit: true });
export const eraseAtom = atom(false);
/** The image whose fitted body the stage shows instead of it, to check what dressing will hold; null for none. */
export const showBodyAtom = atom<string | null>(null);

/** A pass runs with: the Model tab as it is ("tab"), the image's own model ("own"), or a saved setup's id. */
export type PassChoice = string;
export type EditChoice = {
  mode: "dress" | "repaint";
  person: string | null; // whose Wearing row dresses; null is the first person
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
  hold: "tight",
  dresser: "zimage-turbo",
  finish: "own",
  strength: 0.35,
  repaint: "",
  repaintWith: "own",
  face: "",
});
