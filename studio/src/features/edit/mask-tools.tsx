// The bar under the stage in the Edit tab, everything that makes the mask: brush, eraser or tap; find… by words;
// the fitted body as a layer under the mask, to see what dressing holds to; ⋯ for invert and clear. Under them,
// what the tool needs at hand: the brush's size, or how tapping works and Done. Undo takes back the last step, or in
// tap mode the last point.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

import { api } from "@/data/api";
import { loadImage } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { imageRef, withImages } from "@/data/images";
import type { Render } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import {
  BRUSH,
  brushAtom,
  masksAtom,
  peekAtom,
  showBodyAtom,
  tapsAtom,
  tapStageAtom,
  toolAtom,
  type Tool,
} from "@/features/edit/state";
import { PARTS, useFind, worn } from "@/features/edit/use-find";
import { usePreview } from "@/state/preview";
import { Button } from "@/ui/button";
import { Chip, ChipRow } from "@/ui/chip";
import { Input } from "@/ui/field";
import { MenuItem, Popover } from "@/ui/popover";
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

/** Find by words: a name typed, or one of what the image's people wore and the usual parts. */
function FindMenu({ render }: { render: Render }) {
  const find = useFind(render);
  const [text, setText] = useState("");
  const suggestions = [...worn(render).map((t): [string, string] => [t, t]), ...PARTS];
  return (
    <Popover
      trigger="find…"
      role="dialog"
      align="start"
      panel="w-72 gap-2 p-2"
      title="Find by words: SAM 3.1"
    >
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = text.trim();
          // kept until found: a miss is tried again with a word changed
          void find(t).then((ok) => ok && setText((x) => (x.trim() === t ? "" : x)));
        }}
      >
        <Input
          className="min-w-0 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="her jacket, the sofa"
          enterKeyHint="search"
        />
        <Button type="submit" disabled={!text.trim()}>
          Find
        </Button>
      </form>
      <ChipRow>
        {suggestions.map(([label, what]) => (
          <Chip key={label} tone="quiet" onClick={() => void find(label, what)}>
            {label}
          </Chip>
        ))}
      </ChipRow>
    </Popover>
  );
}

export function MaskTools({ render, steps }: { render: Render; steps: number }) {
  const id = render.id;
  const space = useSpace();
  const [tool, setTool] = useAtom(toolAtom);
  const [brush, setBrush] = useAtom(brushAtom);
  const [allTaps, setTaps] = useAtom(tapsAtom);
  const running = useAtomValue(tapStageAtom);
  const setMasks = useSetAtom(masksAtom);
  const [bodyOf, setBodyOf] = useAtom(showBodyAtom);
  const setPeek = useSetAtom(peekAtom);
  useEffect(() => () => setPeek(null), [setPeek]); // the bar gone while held
  const body = usePreview(`body:${id}`);
  const showBody = bodyOf === id;
  const points = allTaps[id]?.points ?? [];
  const add = (op: Op) => setMasks((m) => ({ ...m, [id]: [...(m[id] ?? []), op] }));
  /** The tapped area stays as a step of the mask; its points are done with. */
  const keep = () => setTaps((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== id)));
  const undo = () => {
    if (tool === "tap" && points.length)
      setTaps((all) => ({ ...all, [id]: { ...all[id], points: all[id].points.slice(0, -1) } }));
    else setMasks((m) => ({ ...m, [id]: (m[id] ?? []).slice(0, -1) }));
  };
  const toggleBody = () => {
    if (!showBody)
      body.run(async () =>
        withImages(space, async (t) => api.body(t.wire, await imageRef(t, await loadImage(space, id)))),
      );
    setBodyOf(showBody ? null : id);
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-1 py-1">
      <div className="flex items-center gap-1.5">
        <Segmented
          className="w-40 shrink-0"
          value={tool}
          options={TOOLS}
          onChange={(t) => {
            if (t !== "tap") keep();
            setTool(t);
          }}
        />
        <FindMenu render={render} />
        <Button
          variant="toggle"
          aria-pressed={showBody}
          onClick={toggleBody}
          title="The body dressing holds to, under the mask"
        >
          body
        </Button>
        <Popover trigger="⋯" aria-label="More: invert, clear" className="w-11 shrink-0">
          <MenuItem disabled={!steps} onClick={() => add({ kind: "invert" })}>
            Invert the mask
          </MenuItem>
          <MenuItem disabled={!steps} onClick={() => add({ kind: "clear" })}>
            Clear the mask
          </MenuItem>
        </Popover>
      </div>
      <div className="flex min-h-11 items-center gap-2 fine:min-h-8">
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
        {render.source && (
          <Button
            title="Hold to see the image this one was made from (hold C)"
            className="touch-none select-none"
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId); // the up comes here even off the button
              setPeek(id);
            }}
            onPointerUp={() => setPeek(null)}
            onPointerCancel={() => setPeek(null)}
            onContextMenu={(e) => e.preventDefault()}
          >
            before
          </Button>
        )}
        <Button disabled={!steps && !points.length} title="Undo the last step (⌘Z)" onClick={undo}>
          Undo
        </Button>
      </div>
    </div>
  );
}
