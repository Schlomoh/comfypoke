// The zoom presets, and the zoom as a percentage when it is none of them.
import { useAtom } from "jotai";

import { FIT, type View } from "@/domain/view";
import { viewAtom } from "@/state/studio";
import { Button } from "@/ui/button";

const PRESETS: [string, View][] = [
  ["fit", FIT],
  ["1:1", { ...FIT, scale: 1 }],
  ["2:1", { ...FIT, scale: 2 }],
];

export function ZoomBar() {
  const [view, setView] = useAtom(viewAtom);
  return (
    <div className="flex items-center">
      {PRESETS.map(([label, v]) => (
        <Button
          key={label}
          variant="text"
          onClick={() => setView({ ...v, cx: view.cx, cy: view.cy })}
          aria-pressed={view.scale === v.scale}
        >
          {label}
        </Button>
      ))}
      {view.scale != null && ![1, 2].includes(view.scale) && (
        <span className="px-1 font-mono text-[10.5px] text-muted tabular-nums">
          {Math.round(view.scale * 100)}%
        </span>
      )}
    </div>
  );
}
