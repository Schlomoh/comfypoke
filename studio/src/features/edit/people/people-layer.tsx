// The faces People found, outlined on the stage with whose each is: a tap on the name points at that face's card in
// the panel. Drawn in fractions of the image, so it stays on the faces at any zoom.
import { useAtomValue, useSetAtom } from "jotai";

import type { Render } from "@/domain/render";
import { peopleAtom, pointedAtom } from "@/features/edit/people/state";
import { recipeAtom } from "@/state/studio";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

const pct = (v: number, of: number) => `${(100 * v) / of}%`;

export function PeopleLayer({ render }: { render: Render }) {
  const rows = useAtomValue(peopleAtom)[render.id];
  const cast = useAtomValue(recipeAtom).cast;
  const setPointed = useSetAtom(pointedAtom);
  const { width: w, height: h } = render;
  return rows?.map((row, i) => {
    if (!row.found) return null;
    const [x0, y0, x1, y1] = row.found.box;
    const who = cast.find((p) => p.id === row.pick.who);
    return (
      <div
        // oxlint-disable-next-line react/no-array-index-key -- the faces are numbered left to right
        key={i}
        className={cn(
          "pointer-events-none absolute border-2",
          who ? "border-mask" : "border-dashed border-ink/60",
        )}
        style={{ left: pct(x0, w), top: pct(y0, h), width: pct(x1 - x0, w), height: pct(y1 - y0, h) }}
      >
        <Pressable
          className={cn(
            "pointer-events-auto absolute bottom-full left-[-2px] min-h-6 px-1.5 text-[11px] whitespace-nowrap",
            who ? "bg-mask text-bg" : "bg-bg/80 text-ink",
          )}
          // the stage paints on a press; a press on the name only points at the card
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setPointed(i);
            document.getElementById(`person-${i}`)?.scrollIntoView({ block: "nearest", behavior: "smooth" });
          }}
        >
          {who ? who.name || "unnamed" : `${i + 1} · leave`}
        </Pressable>
      </div>
    );
  });
}
