// The bar under the stage in the Edit tab: what painting needs at hand, brush or eraser, its size and undo. The
// mask's other steps (find, invert, clear, the body) are in the Edit tab itself.
import { useAtom, useSetAtom } from "jotai";

import { BRUSH, brushAtom, eraseAtom, masksAtom } from "@/features/edit/state";
import { Button } from "@/ui/button";
import { Segmented } from "@/ui/segmented";
import { Slider } from "@/ui/slider";

export function MaskTools({ id, steps }: { id: string; steps: number }) {
  const [erase, setErase] = useAtom(eraseAtom);
  const [brush, setBrush] = useAtom(brushAtom);
  const setMasks = useSetAtom(masksAtom);
  return (
    <>
      <Segmented
        className="w-36 shrink-0"
        value={erase ? "erase" : "paint"}
        options={[
          { value: "paint", label: "brush" },
          { value: "erase", label: "eraser" },
        ]}
        onChange={(v) => setErase(v === "erase")}
      />
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
      <Button
        disabled={!steps}
        title="Undo the last step (⌘Z)"
        onClick={() => setMasks((m) => ({ ...m, [id]: (m[id] ?? []).slice(0, -1) }))}
      >
        Undo
      </Button>
    </>
  );
}
