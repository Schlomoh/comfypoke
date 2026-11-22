// Where an image came from and what was made from it, from each render's `source`: the chain back to the first
// render, the images made from this one, and the whole family (the first render and everything made from it).
import type { Render } from "@/domain/render";

/** What kind of step an image is in its family; null for a plain render. */
export function kindOf(r: Render) {
  if (r.uploaded) return "photo";
  if (r.edit) return r.edit.dress ? "outfit" : "edit";
  if (r.upscale) return "upscale";
  return r.draft ? "draft" : null;
}

/** The chain from the first image to `id` (oldest first), and what `id` was made into (oldest first). `cut`: the
 * chain starts at an image whose own source was deleted. */
export function lineage(all: Render[], id: string) {
  const byId = new Map(all.map((r) => [r.id, r]));
  const chain: Render[] = [];
  const seen = new Set<string>();
  for (let r = byId.get(id); r && !seen.has(r.id); r = r.source ? byId.get(r.source) : undefined) {
    seen.add(r.id);
    chain.unshift(r);
  }
  const children = all.filter((r) => r.source === id).toSorted((a, b) => a.createdAt - b.createdAt);
  return { chain, children, cut: !!chain[0]?.source };
}

/** The ids of `id`'s family: its first image and every image made from it, at any depth. */
export function family(all: Render[], id: string): Set<string> {
  const root = lineage(all, id).chain[0]?.id ?? id;
  const ids = new Set([root]);
  for (let grew = true; grew;) {
    grew = false;
    for (const r of all)
      if (r.source && ids.has(r.source) && !ids.has(r.id)) {
        ids.add(r.id);
        grew = true;
      }
  }
  return ids;
}

/** How many images were made from each image. */
export function childCounts(all: Render[]) {
  const counts = new Map<string, number>();
  for (const r of all) if (r.source) counts.set(r.source, (counts.get(r.source) ?? 0) + 1);
  return counts;
}
