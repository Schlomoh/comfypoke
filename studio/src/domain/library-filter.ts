// What the library shows: images marked best, of one character, and carrying every picked tag. Best and character
// are per image; a tag reaches the whole stack (lineage.ts), so what was made from a tagged image comes along
// untagged.
import { stacks } from "@/domain/lineage";
import type { Render } from "@/domain/render";
import { hasTag, sameTag, vocabulary } from "@/domain/tags";

export type LibraryFilter = { best: boolean; character: string; tags: readonly string[] };
export const NO_FILTER: LibraryFilter = { best: false, character: "", tags: [] };

export const characterNames = (rs: readonly Render[]) => [
  ...new Set(rs.flatMap((r) => (r.characterName ? [r.characterName] : []))),
];

/** The filter as it applies to these images: a character or tag none of them has any more is dropped. */
export function inEffect(f: LibraryFilter, rs: readonly Render[]): LibraryFilter {
  const tags = vocabulary(rs).map((v) => v.tag);
  return {
    best: f.best,
    character: characterNames(rs).includes(f.character) ? f.character : "",
    tags: f.tags.filter((t) => tags.some((x) => sameTag(x, t))),
  };
}

/** The images the filter lets through, in their order. */
export function applyFilter(rs: readonly Render[], f: LibraryFilter): Render[] {
  let out = rs.filter((r) => !f.character || r.characterName === f.character);
  if (f.tags.length) {
    const kept = new Set(
      stacks(out)
        .filter((s) => f.tags.every((t) => s.members.some((m) => hasTag(m, t))))
        .flatMap((s) => s.members.map((m) => m.id)),
    );
    out = out.filter((r) => kept.has(r.id));
  }
  return f.best ? out.filter((r) => r.best) : out;
}

/** A tag picked, or no longer. */
export const toggleTag = (f: LibraryFilter, tag: string): LibraryFilter => ({
  ...f,
  tags: f.tags.some((t) => sameTag(t, tag)) ? f.tags.filter((t) => !sameTag(t, tag)) : [...f.tags, tag],
});
