// Tags written to many images at once (each image is sealed on its own), saying what was done, with Undo.
import { updateRender } from "@/data/db/renders";
import type { Space } from "@/data/db/space";
import type { Render } from "@/domain/render";
import { hasTag, retag } from "@/domain/tags";
import { notify } from "@/ui/notify";

async function retagAll(space: Space, rs: readonly Render[], change: (r: Render) => Render, said: string) {
  const touched = rs.filter((r) => change(r) !== r);
  if (!touched.length) return;
  const before = new Map(touched.map((r) => [r.id, r.tags]));
  for (const r of touched) await updateRender(space, r.id, change);
  notify(said, {
    action: {
      label: "Undo",
      run: () => {
        for (const [id, tags] of before) void updateRender(space, id, (r) => ({ ...r, tags }));
      },
    },
  });
}

const plural = (n: number) => (n === 1 ? "1 image" : `${n} images`);

/** A tag on all of these, or taken off all of them. */
export const setTag = (space: Space, rs: readonly Render[], tag: string, on: boolean) =>
  retagAll(
    space,
    rs,
    (r) => (on ? retag(r, [tag]) : retag(r, [], [tag])),
    // the filter shows a tagged image with everything made from it: said, so "1 image" is not a surprise
    on
      ? `Tagged ${plural(rs.length)} “${tag}”, shown with ${rs.length === 1 ? "its" : "their"} stacks`
      : `Took “${tag}” off ${plural(rs.length)}`,
  );

/** Renamed on every image that has it; onto another tag's name, the two become one. */
export const renameTag = (space: Space, rs: readonly Render[], from: string, to: string) =>
  retagAll(
    space,
    rs.filter((r) => hasTag(r, from)),
    (r) => retag(r, [to], [from]),
    `Renamed “${from}” to “${to}”`,
  );

export const deleteTag = (space: Space, rs: readonly Render[], tag: string) =>
  retagAll(
    space,
    rs.filter((r) => hasTag(r, tag)),
    (r) => retag(r, [], [tag]),
    `Removed the tag “${tag}”`,
  );
