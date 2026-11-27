// The library's filter as one line of chips that scrolls sideways: ★, then characters, then tags, what is picked
// first, and × to clear them. Everything picked must hold at once. Tags… manages the tags themselves. With any on, a
// line under it says how many of the workspace's images show.
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { NO_FILTER, toggleTag } from "@/domain/library-filter";
import { sameTag } from "@/domain/tags";
import { TagsSheet } from "@/features/tags/tags-sheet";
import {
  bestCountAtom,
  characterNamesAtom,
  filterAtom,
  libraryFilterAtom,
  rendersAtom,
  shownAtom,
  tagsAtom,
} from "@/state/studio";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { Note } from "@/ui/text";

type Item = { key: string; label: string; on: boolean; toggle: () => void };
const pickedFirst = (xs: Item[]) => [...xs.filter((x) => x.on), ...xs.filter((x) => !x.on)];

export function FilterBar() {
  const setFilter = useSetAtom(filterAtom);
  const f = useAtomValue(libraryFilterAtom);
  const names = useAtomValue(characterNamesAtom);
  const tags = useAtomValue(tagsAtom);
  const bestCount = useAtomValue(bestCountAtom);
  const [managing, setManaging] = useState(false);
  const shown = useAtomValue(shownAtom).length;
  const total = useAtomValue(rendersAtom)?.length ?? 0;
  const any = f.best || !!f.character || f.tags.length > 0;

  const items: Item[] = [
    { key: "best", label: `★ ${bestCount}`, on: f.best, toggle: () => setFilter({ ...f, best: !f.best }) },
    ...pickedFirst([
      ...names.map((n) => ({
        key: `c:${n}`,
        label: n,
        on: f.character === n,
        toggle: () => setFilter({ ...f, character: f.character === n ? "" : n }),
      })),
      ...tags.map(({ tag, count }) => ({
        key: `t:${tag}`,
        label: `#${tag} ${count}`,
        on: f.tags.some((t) => sameTag(t, tag)),
        toggle: () => setFilter(toggleTag(f, tag)),
      })),
    ]),
  ];

  return (
    <>
      <div className="-mx-4 flex [scrollbar-width:none] items-center gap-1.5 overflow-x-auto overscroll-x-contain px-4">
        {any && (
          <Chip
            tone="add"
            onClick={() => setFilter(NO_FILTER)}
            className="shrink-0"
            aria-label="Clear the filter"
          >
            ×
          </Chip>
        )}
        {items.map((x) => (
          <Chip
            key={x.key}
            tone={x.on ? "picked" : "quiet"}
            aria-pressed={x.on}
            onClick={x.toggle}
            className="shrink-0 whitespace-nowrap"
          >
            {x.label}
          </Chip>
        ))}
        <Button variant="link" size="inline" onClick={() => setManaging(true)}>
          Tags…
        </Button>
        <TagsSheet open={managing} onClose={() => setManaging(false)} />
      </div>
      {any && (
        <Note>
          {shown} of {total} shown
        </Note>
      )}
    </>
  );
}
