// The face match: how much the face in an image looks like a character's face photo, as InsightFace's buffalo_l scores
// it (comfy_nodes/studio_face). Its score is a cosine similarity; on photo benchmarks two people part at about 0.22, and
// the same person in another photo usually scores well above 0.4.
import { faceFor, inPicture } from "@/domain/cast";
import { portrait } from "@/domain/compose";
import type { Triggers } from "@/domain/loras";
import { noun } from "@/domain/presets/gender";
import type { Person, Recipe } from "@/domain/recipe";
import type { FaceMatch, Lora, Render } from "@/domain/render";

/** The face photo an image is compared with: the one of the person in the recipe it was made from. */
export const faceToMatch = (r: Render) => (r.recipe ? (faceFor(r.recipe)?.face ?? null) : null);

/** The match kept on the image, if it was made against that photo; a changed photo asks again. */
export const keptMatch = (r: Render, face: string): FaceMatch | undefined =>
  r.faceMatch?.face === face ? r.faceMatch : undefined;

const BANDS: [number, string][] = [
  [0.6, "very close"],
  [0.4, "likely the same person"],
  [0.22, "some likeness"],
];

/** The score in words. */
export function matchLabel(score: number | null) {
  if (score === null) return "no face found in one of them";
  return BANDS.find(([min]) => score >= min)?.[1] ?? "looks like someone else";
}

/** A person as the face pass redraws them in a picture of several: their description with their LoRAs' trigger words,
 * the LoRAs that are theirs or the stack's, where they stand, and their face photo's id, by which they are told apart. */
export type FacePerson = { text: string; loras: Lora[]; side: string; face: string | null };
export const FACE_PEOPLE = 4; // graphs.FACE_PEOPLE

/** The people of a picture for the face pass, or null when there is one (the pass then takes the largest face) or
 * more than it tells apart. `loras` gives the LoRAs a person's face is redrawn with, by their saved character. */
export function facePeople(
  r: Recipe,
  triggers: Triggers,
  loras: (savedId: string | null) => Lora[],
): FacePerson[] | null {
  const people = inPicture(r);
  if (people.length < 2 || people.length > FACE_PEOPLE) return null;
  return people.map((p) => facePerson(p, triggers, loras));
}

/** One person as a face pass redraws them, in a render or an edit (the Edit tab's People). */
export function facePerson(
  p: Person,
  triggers: Triggers,
  loras: (savedId: string | null) => Lora[],
): FacePerson {
  // someone only in what the people do together has no words of their own: still a woman, a man, a person
  const own =
    portrait(p, undefined, p.savedId ? (triggers.of[p.savedId] ?? []) : []) || `A ${noun(p.gender)}.`;
  return {
    text: [...triggers.lead, own].join(", "), // the stack's trigger words lead, as in the prompt
    loras: loras(p.savedId),
    side: sideOf(p),
    face: p.face ?? null,
  };
}

/** Whose head the face photo goes on, in a picture of several: their place among everyone's sides, as the face pass
 * tells people apart (comfy_nodes/studio_face/assign.py). Null for one person, or more than it tells apart. */
export function referenceAt(r: Recipe) {
  const people = inPicture(r);
  const slot = people.findIndex((p) => p.face);
  if (people.length < 2 || people.length > FACE_PEOPLE || slot < 0) return null;
  return { slot, sides: people.map(sideOf) };
}

/** Where a person stands, as the face finder takes it: across is the middle. */
export const sideOf = (p: Person) => (p.side.length > 1 ? "center" : (p.side[0] ?? ""));
