// The stage's compare view: every render of the shown one's batch at once, two to four across, so versions and seeds
// can be judged together. A tap marks one best (or not), "open" puts it on the stage alone; "pick" runs the
// two-at-a-time pick (features/pick) for close calls.
import { useAtomValue, useSetAtom } from "jotai";

import { toggleBest, useImage, useObjectUrl } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import type { Render } from "@/domain/render";
import { batchAtom, compareAtom, focusAtom, pickAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

/** Two across up to four, then about square, at most four across. */
const columns = (n: number) => Math.min(4, Math.max(2, Math.ceil(Math.sqrt(n))));

function Cell({ render, shown }: { render: Render; shown: boolean }) {
  const space = useSpace();
  const url = useObjectUrl(useImage(render.id));
  const setFocus = useSetAtom(focusAtom);
  const setCompare = useSetAtom(compareAtom);
  return (
    <div
      className={cn("relative min-h-0 min-w-0 border", render.best ? "border-accent" : "border-transparent")}
    >
      <Pressable
        onClick={() => void toggleBest(space, render)}
        aria-pressed={!!render.best}
        aria-label={render.best ? "Best; tap to unmark" : "Tap to mark best"}
        className="absolute inset-0"
      >
        {url && <img src={url} alt={render.prompt} className="size-full object-contain" />}
      </Pressable>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1 left-1.5 text-base [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]",
          render.best ? "text-accent" : "text-ink/70",
        )}
      >
        {render.best ? "★" : "☆"}
      </span>
      <Button
        variant="text"
        onClick={() => {
          setFocus(render.id);
          setCompare(null);
        }}
        className={cn(
          "absolute right-0 bottom-0 [text-shadow:0_1px_2px_rgb(0_0_0/0.8)]",
          shown && "text-ink",
        )}
        title="Show this one on the stage alone"
      >
        open
      </Button>
    </div>
  );
}

export function CompareGrid({ shown }: { shown: string }) {
  const renders = useAtomValue(batchAtom);
  const cols = columns(renders.length);
  return (
    <div
      className="grid size-full gap-1"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${Math.ceil(renders.length / cols)}, minmax(0, 1fr))`,
      }}
    >
      {renders.map((r) => (
        <Cell key={r.id} render={r} shown={r.id === shown} />
      ))}
    </div>
  );
}

/** The bar under it: how many, what a tap does, the pick, and back to one. */
export function CompareBar() {
  const renders = useAtomValue(batchAtom);
  const setCompare = useSetAtom(compareAtom);
  const setPick = useSetAtom(pickAtom);
  const best = renders.filter((r) => r.best).length;
  return (
    <>
      <span className="min-w-0 flex-1 truncate text-muted">
        {renders.length} from one Generate · {best ? `${best} ★` : "tap the best"}
      </span>
      <Button onClick={() => setPick(renders.map((r) => r.id))} title="Pick the best, two at a time">
        Pick
      </Button>
      <Button onClick={() => setCompare(null)}>Done</Button>
    </>
  );
}

/** Over the stage's corner: into the compare view, when the shown render has others from its Generate. */
export function CompareToggle() {
  const renders = useAtomValue(batchAtom);
  const setCompare = useSetAtom(compareAtom);
  const batch = renders[0]?.batch;
  if (!batch) return null;
  return (
    <Button
      variant="text"
      onClick={() => setCompare(batch)}
      title="See every render of this Generate at once"
    >
      compare {renders.length}
    </Button>
  );
}
