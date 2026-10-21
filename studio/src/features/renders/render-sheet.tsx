// Every render Generate will send, one after another: how many seeds, whether versions share them,
// whether the GPU stops after the queue, and what it will take.
import { useAtom } from "jotai";

import { api, quietly } from "@/data/api";
import { useGpu } from "@/data/queries";
import { plan } from "@/domain/batch";
import { duration } from "@/domain/format";
import { useRenderTime } from "@/state/generate";
import { useTriggers } from "@/state/recipe";
import { layerAtom, recipeAtom } from "@/state/studio";
import { Checkbox } from "@/ui/checkbox";
import { Sheet } from "@/ui/modal";
import { Segmented } from "@/ui/segmented";
import { Facts, Heading } from "@/ui/text";

const SHOWN = 40;

function Explained({ title, detail }: { title: string; detail: string }) {
  return (
    <span className="text-[13px]">
      {title}
      <br />
      <span className="text-xs text-faint">{detail}</span>
    </span>
  );
}

export function RenderSheet() {
  const [layer, setLayer] = useAtom(layerAtom);
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const triggers = useTriggers();
  const each = useRenderTime();
  const { gpu } = useGpu();
  const open = layer === "renders";
  const runs = open ? plan(recipe, triggers, 0) : [];
  const total = each == null ? null : each * runs.length;
  const rate = gpu?.rate_per_hour ?? null;

  return (
    <Sheet
      open={open}
      onClose={() => setLayer(null)}
      title={`${runs.length} separate render${runs.length === 1 ? "" : "s"}`}
    >
      <Heading>Seeds</Heading>
      <Segmented
        value={recipe.count}
        options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))}
        onChange={(count) => setRecipe((r) => ({ ...r, count }))}
      />
      <Checkbox
        on={recipe.sameSeed}
        onChange={(sameSeed) => setRecipe((r) => ({ ...r, sameSeed }))}
        label={
          <Explained
            title="Same seeds for every version"
            detail={
              recipe.sameSeed
                ? "Images differ only by the phrases that vary."
                : "Every render gets its own seed."
            }
          />
        }
        className="py-1"
      />
      <Checkbox
        on={recipe.stopAfter}
        onChange={(stopAfter) => {
          setRecipe((r) => ({ ...r, stopAfter }));
          quietly(api.stopAfter(stopAfter)); // for the queue already running
        }}
        label={
          <Explained
            title="Stop the GPU when the queue is done"
            detail="Review without paying for idle time; the next render boots it again in about a minute."
          />
        }
        className="py-1"
      />
      <Facts
        rows={[
          ["time, warm GPU", total == null ? "no estimate yet" : `≈ ${duration(total)}`],
          ["cost", total == null || rate == null ? "?" : `≈ $${((total * rate) / 3600).toFixed(3)}`],
        ]}
      />
      <Heading>Each render, one after another</Heading>
      <div className="flex flex-col gap-2">
        {runs.slice(0, SHOWN).map((run, i) => (
          // oxlint-disable-next-line react/no-array-index-key -- a plan is a fixed sequence; two runs can share prompt and seed label
          <div key={i} className="flex flex-col gap-1.5 border border-line bg-bg p-2.5">
            <div className="flex justify-between font-mono text-[11px] text-muted">
              <span>
                Render {i + 1} of {runs.length}
              </span>
              <span>{run.seedLabel}</span>
            </div>
            {run.changes.length > 0 && (
              <div className="text-xs text-warn">
                {run.changes.map((c) => (
                  <div key={c}>{c}</div>
                ))}
              </div>
            )}
            <details className="font-mono text-[11px] leading-relaxed text-faint">
              <summary className="flex min-h-11 cursor-pointer items-center text-muted fine:min-h-8">
                full prompt
              </summary>
              {run.prompt}
            </details>
          </div>
        ))}
        {runs.length > SHOWN && <p className="text-xs text-faint">and {runs.length - SHOWN} more</p>}
      </div>
    </Sheet>
  );
}
