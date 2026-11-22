// The bar under the stage in the Edit tab: brush, eraser or tap, and what each needs at hand. Brush and eraser have
// their size; tap says how it works (or what SAM is doing) and keeps the found area with Done. Undo takes back the
// last step, or in tap mode the last point. The mask's other steps (find by words, invert, clear, the body) are in
// the Edit tab itself.
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import {
  BRUSH,
  brushAtom,
  masksAtom,
  tapsAtom,
  tapStageAtom,
  toolAtom,
  type Tool,
} from "@/features/edit/state";
import { Button } from "@/ui/button";
import { Segmented } from "@/ui/segmented";
import { Slider } from "@/ui/slider";

const TOOLS: { value: Tool; label: string }[] = [
  { value: "brush", label: "brush" },
  { value: "eraser", label: "eraser" },
  { value: "tap", label: "tap" },
];

function hint(stage: string | null, points: number) {
  if (stage) return `finding · ${stage}`;
  if (points) return `${points} point${points === 1 ? "" : "s"} · tap more, hold to take away`;
  return "tap on it · hold (or Alt) to take away";
}

export function MaskTools({ id, steps }: { id: string; steps: number }) {
  const [tool, setTool] = useAtom(toolAtom);
  const [brush, setBrush] = useAtom(brushAtom);
  const [allTaps, setTaps] = useAtom(tapsAtom);
  const running = useAtomValue(tapStageAtom);
  const setMasks = useSetAtom(masksAtom);
  const points = allTaps[id]?.points ?? [];
  /** The tapped area stays as a step of the mask; its points are done with. */
  const keep = () => setTaps((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== id)));
  const undo = () => {
    if (tool === "tap" && points.length)
      setTaps((all) => ({ ...all, [id]: { ...all[id], points: all[id].points.slice(0, -1) } }));
    else setMasks((m) => ({ ...m, [id]: (m[id] ?? []).slice(0, -1) }));
  };
  return (
    <>
      <Segmented
        className="w-44 shrink-0"
        value={tool}
        options={TOOLS}
        onChange={(t) => {
          if (t !== "tap") keep();
          setTool(t);
        }}
      />
      {tool === "tap" ? (
        <>
          <span className="min-w-0 flex-1 truncate text-faint" aria-live="polite">
            {hint(running?.id === id ? running.stage : null, points.length)}
          </span>
          {points.length > 0 && <Button onClick={keep}>Done</Button>}
        </>
      ) : (
        <label className="flex min-w-0 flex-1 items-center gap-2" title="Brush size on screen ([ and ])">
          <span className="sr-only">Brush size</span>
          <Slider min={BRUSH.min} max={BRUSH.max} value={brush} onValue={setBrush} />
          {/* the brush itself, up to the bar's height */}
          <span className="grid size-10 shrink-0 place-items-center" aria-hidden>
            <span
              className="block rounded-full border border-ink"
              style={{ width: Math.min(40, brush), height: Math.min(40, brush) }}
            />
          </span>
        </label>
      )}
      <Button disabled={!steps && !points.length} title="Undo the last step (⌘Z)" onClick={undo}>
        Undo
      </Button>
    </>
  );
}
