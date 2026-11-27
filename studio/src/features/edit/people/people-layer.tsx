// The faces People found, outlined on the stage in each person's color with whose each is: a tap on the name selects
// them, so the bar under the stage edits their area. Drawn in fractions of the image, so it stays on the faces at any
// zoom.
import { useAtom, useAtomValue } from "jotai";

import type { Render } from "@/domain/render";
import { colorOf, peopleAtom, selectedAtom } from "@/features/edit/people/state";
import { recipeAtom } from "@/state/studio";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

const pct = (v: number, of: number) => `${(100 * v) / of}%`;

export function PeopleLayer({ render }: { render: Render }) {
  const rows = useAtomValue(peopleAtom)[render.id];
  const cast = useAtomValue(recipeAtom).cast;
  const [selected, setSelected] = useAtom(selectedAtom);
  const { width: w, height: h } = render;
  return rows?.map((row, i) => {
    if (!row.found) return null;
    const [x0, y0, x1, y1] = row.found.box;
    const who = cast.find((p) => p.id === row.pick.who);
    const on = selected?.id === render.id && selected.index === i;
    const color = who ? colorOf(i) : undefined;
    return (
      <div
        // oxlint-disable-next-line react/no-array-index-key -- the faces are numbered left to right
        key={i}
        className={cn(
          "pointer-events-none absolute",
          on ? "border-[3px]" : "border-2",
          !who && "border-dashed border-ink/60",
        )}
        style={{
          left: pct(x0, w),
          top: pct(y0, h),
          width: pct(x1 - x0, w),
          height: pct(y1 - y0, h),
          borderColor: color,
        }}
      >
        <Pressable
          aria-pressed={on}
          className={cn(
            "pointer-events-auto absolute bottom-full left-[-2px] min-h-6 px-1.5 text-[11px] whitespace-nowrap",
            who ? "text-bg" : "bg-bg/80 text-ink",
            on && "font-semibold",
          )}
          style={{ background: color }}
          // the stage paints on a press; a press on the name only selects them
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => {
            setSelected(on ? null : { id: render.id, index: i }); // the stage stays in view: painting comes next
          }}
        >
          {who ? who.name || "unnamed" : `${i + 1} · leave`}
        </Pressable>
      </div>
    );
  });
}
