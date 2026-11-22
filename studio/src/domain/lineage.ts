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

/** One idea in the library: an image and everything made from it, shown as one tile. `members`: the root first, then
 * the rest oldest first. `cover`: the newest marked best, else the newest. */
export type Stack = { root: Render; members: Render[]; cover: Render; latest: number };

const newest = (xs: Render[]) => xs.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));

/** The renders as stacks, the one with the newest member first. An image whose source is not among them starts a
 * stack of its own, so a filtered list still stacks what it holds. */
export function stacks(rs: Render[]): Stack[] {
  const byId = new Map(rs.map((r) => [r.id, r]));
  const rootOf = (r: Render) => {
    const seen = new Set<string>();
    let at = r;
    while (at.source && byId.has(at.source) && !seen.has(at.id)) {
      seen.add(at.id);
      at = byId.get(at.source) as Render;
    }
    return at;
  };
  const by = new Map<string, Render[]>();
  for (const r of rs) {
    const root = rootOf(r);
    by.set(root.id, [...(by.get(root.id) ?? []), r]);
  }
  return [...by.entries()]
    .map(([id, ms]) => {
      const root = byId.get(id) as Render;
      const members = [root, ...ms.filter((m) => m !== root).toSorted((a, b) => a.createdAt - b.createdAt)];
      const best = members.filter((m) => m.best);
      return {
        root,
        members,
        cover: newest(best.length ? best : members),
        latest: newest(members).createdAt,
      };
    })
    .toSorted((a, b) => b.latest - a.latest);
}

/** Stacks whose first images came from one Generate together (`batch`), in the order of their first stack; a stack
 * from no batch, or alone in one, is a group of one. */
export function groups(ss: Stack[]): { batch?: string; stacks: Stack[] }[] {
  const out: { batch?: string; stacks: Stack[] }[] = [];
  const at = new Map<string, number>();
  for (const s of ss) {
    const b = s.root.batch;
    const i = b === undefined ? undefined : at.get(b);
    if (i !== undefined) out[i].stacks.push(s);
    else {
      if (b !== undefined) at.set(b, out.length);
      out.push({ batch: b, stacks: [s] });
    }
  }
  return out;
}

/** Picked over in a Pick and not marked best since: folded away in its batch. */
export const pickedOver = (s: Stack) => !!s.cover.passed && !s.cover.best;

/** The stacks a library shows: in a batch of several, the picked-over ones fold away unless the batch is unfolded. */
export function visible(ss: Stack[], unfolded: ReadonlySet<string>) {
  return groups(ss).flatMap((g) =>
    g.batch !== undefined && g.stacks.length > 1 && !unfolded.has(g.batch)
      ? g.stacks.filter((s) => !pickedOver(s))
      : g.stacks,
  );
}
