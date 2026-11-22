// What a person's Wearing row dresses them in: one outfit per combination of its phrases' versions, the way
// Generate makes one render per version.
import type { Person } from "@/domain/recipe";

export function outfits(p: Person): string[] {
  let out = [""];
  for (const phrase of p.wear.filter((x) => x.on && x.t.trim())) {
    const values = [phrase.t, ...phrase.versions].map((t) => t.trim()).filter(Boolean);
    out = out.flatMap((o) => values.map((v) => (o ? `${o}, ${v}` : v)));
  }
  return out.filter(Boolean);
}
