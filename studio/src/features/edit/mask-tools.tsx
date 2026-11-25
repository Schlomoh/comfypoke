// The bar under the stage in the Edit tab, everything that makes the mask being edited (the image's, or in People the
// selected person's): brush, eraser or tap; find… by words; everyone's fitted body as a layer under the masks, to see
// what dressing holds to; ⋯ for invert and clear. Under them, what the tool needs at hand: the brush's size, or how
// tapping works and Done. Undo takes back the last step, or in tap mode the last point. In People with nobody
// selected there is no mask to edit: the bar says to tap a face.
import { useAtom, useSetAtom } from "jotai";
import { useEffect, useState } from "react";

import { api } from "@/data/api";
import { useSpace } from "@/data/db/space";
import type { Render } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import {
  BRUSH,
  brushAtom,
  masksAtom,
  peekAtom,
  showBodyAtom,
  tapsAtom,
  toolAtom,
  type Tool,
} from "@/features/edit/state";
import { PARTS, useFind, worn } from "@/features/edit/use-find";
import { tapping } from "@/features/edit/use-taps";
import { lookAt, usePreview, useStage } from "@/state/preview";
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
function FindMenu({ render, maskKey }: { render: Render; maskKey: string }) {
  const find = useFind(render, maskKey);
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

/** Everyone's fitted body under the masks, toggled. */
function BodyButton({ render }: { render: Render }) {
  const space = useSpace();
  const [bodyOf, setBodyOf] = useAtom(showBodyAtom);
  const body = usePreview(`body:${render.id}`);
  const showBody = bodyOf === render.id;
  return (
    <Button
      variant="toggle"
      aria-pressed={showBody}
      onClick={() => {
        if (!showBody)
          body.run(async (onStage) =>
            lookAt(space, render.id, (t, image) => api.body(t.wire, image), onStage),
          );
        setBodyOf(showBody ? null : render.id);
      }}
      title="Everyone's fitted body, which dressing holds to, under the masks"
    >
      body
    </Button>
  );
}

export function MaskTools({
  render,
  maskKey,
  steps,
}: {
  render: Render;
  maskKey: string | null;
  steps: number;
}) {
  if (!maskKey)
    return (
      <div className="flex w-full min-w-0 items-center gap-2 py-1">
        <span className="min-w-0 flex-1 truncate text-faint">tap a face to edit their area</span>
        <BodyButton render={render} />
      </div>
    );
  return <Tools render={render} maskKey={maskKey} steps={steps} />;
}

function Tools({ render, maskKey: key, steps }: { render: Render; maskKey: string; steps: number }) {
  const id = render.id;
  const [tool, setTool] = useAtom(toolAtom);
  const [brush, setBrush] = useAtom(brushAtom);
  const [allTaps, setTaps] = useAtom(tapsAtom);
  const running = useStage(tapping(key));
  const setMasks = useSetAtom(masksAtom);
  const setPeek = useSetAtom(peekAtom);
  useEffect(() => () => setPeek(null), [setPeek]); // the bar gone while held
  const points = allTaps[key]?.points ?? [];
  const add = (op: Op) => setMasks((m) => ({ ...m, [key]: [...(m[key] ?? []), op] }));
  /** The tapped area stays as a step of the mask; its points are done with. */
  const keep = () => setTaps((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)));
  const undo = () => {
    if (tool === "tap" && points.length)
      setTaps((all) => ({ ...all, [key]: { ...all[key], points: all[key].points.slice(0, -1) } }));
    else setMasks((m) => ({ ...m, [key]: (m[key] ?? []).slice(0, -1) }));
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
        <FindMenu render={render} maskKey={key} />
        <BodyButton render={render} />
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
              {hint(running, points.length)}
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
