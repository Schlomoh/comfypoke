// What a person's Wearing row dresses them in: one outfit per combination of its phrases' versions, the way
// Generate makes one render per version. Switched-on phrases are worn together.
import type { Person } from "@/domain/recipe";

/** Each outfit as its pieces, in the row's order: one outfit, one render. */
export function outfitPieces(p: Person): string[][] {
  let out: string[][] = [[]];
  for (const phrase of p.wear.filter((x) => x.on && x.t.trim())) {
    const values = [phrase.t, ...phrase.versions].map((t) => t.trim()).filter(Boolean);
    out = out.flatMap((o) => values.map((v) => [...o, v]));
  }
  return out.filter((o) => o.length);
}

/** Each outfit as the words the prompt gets. */
export const outfits = (p: Person): string[] => outfitPieces(p).map((o) => o.join(", "));
