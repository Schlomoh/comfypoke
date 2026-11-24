// The face match: how much the face in an image looks like a character's face photo, as InsightFace's buffalo_l scores
// it (comfy_nodes/studio_face). Its score is a cosine similarity; on photo benchmarks two people part at about 0.22, and
// the same person in another photo usually scores well above 0.4.
import { faceFor } from "@/domain/cast";
import type { FaceMatch, Render } from "@/domain/render";

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
