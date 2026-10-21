import { useAtom } from "jotai";

import { MOD } from "@/app/platform";
import { KEYS } from "@/features/library/keys";
import { layerAtom } from "@/state/studio";
import { Sheet } from "@/ui/modal";

export function ShortcutsSheet() {
  const [layer, setLayer] = useAtom(layerAtom);
  return (
    <Sheet center open={layer === "keys"} onClose={() => setLayer(null)} title="Keyboard">
      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-xs">
        {KEYS.map(([k, what]) => (
          <div key={k} className="contents">
            <dt className="font-mono text-ink">{k.replace("⌘", MOD)}</dt>
            <dd className="text-muted">{what}</dd>
          </div>
        ))}
      </dl>
    </Sheet>
  );
}
