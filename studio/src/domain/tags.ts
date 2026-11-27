// The tags a person gives images, in the workspace they are in: free words, the same whatever their case or spacing,
// spelled as first written. Tags are how images are grouped: the library filters by them (library-filter.ts).
import type { Render } from "@/domain/render";

export const cleanTag = (t: string) => t.trim().replace(/\s+/g, " ");
export const sameTag = (a: string, b: string) => cleanTag(a).toLowerCase() === cleanTag(b).toLowerCase();
export const hasTag = (r: Render, tag: string) => !!r.tags?.some((t) => sameTag(t, tag));

/** Every tag in use, with how many images carry it: the most used first, then by name. */
export function vocabulary(rs: readonly Render[]): { tag: string; count: number }[] {
  const by = new Map<string, { tag: string; count: number }>();
  for (const r of rs)
    for (const t of new Set(r.tags?.map((x) => cleanTag(x).toLowerCase())))
      if (t) {
        const e = by.get(t) ?? { tag: cleanTag(r.tags?.find((x) => sameTag(x, t)) ?? t), count: 0 };
        e.count++;
        by.set(t, e);
      }
  return [...by.values()].toSorted((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** The image with tags added and others taken off; the same object when nothing changes, so it needs no write. */
export function retag(r: Render, add: readonly string[], remove: readonly string[] = []): Render {
  const kept = (r.tags ?? []).filter((t) => !remove.some((x) => sameTag(x, t)));
  const added = add
    .map(cleanTag)
    .filter((t, i, xs) => t && !kept.some((k) => sameTag(k, t)) && xs.findIndex((x) => sameTag(x, t)) === i);
  const tags = [...kept, ...added];
  if (tags.length === (r.tags ?? []).length && !added.length) return r;
  return { ...r, tags: tags.length ? tags : undefined };
}

/** Whether a tag is on all of these images, some, or none. */
export function tagState(rs: readonly Render[], tag: string): "all" | "some" | "none" {
  const n = rs.filter((r) => hasTag(r, tag)).length;
  if (!n) return "none";
  return n === rs.length ? "all" : "some";
}
