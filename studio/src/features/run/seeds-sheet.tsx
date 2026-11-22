// The dock's ×N: how many seeds, random or fixed, whether versions share them, whether the GPU stops after the
// queue, what it will take, and every render Generate will send, one after another. Surprise me sends that many
// renders instead, each with one row changed to one of its presets (domain/shuffle.ts).
import { useAtom } from "jotai";

import { api, quietly } from "@/data/api";
import { usePresets } from "@/data/db/presets";
import { useGpu } from "@/data/queries";
import { plan, randomSeed } from "@/domain/batch";
import { duration } from "@/domain/format";
import { surprises } from "@/domain/shuffle";
import { useGenerate, useRenderTime } from "@/state/generate";
import { useTriggers } from "@/state/recipe";
import { layerAtom, recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Input } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { Segmented } from "@/ui/segmented";
import { Facts, Heading, Note } from "@/ui/text";

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

const SEED_MODES = [
  { value: "random", label: "random seed" },
  { value: "fixed", label: "fixed seed" },
] as const;

function SeedMode() {
  const [{ seed, count }, setRecipe] = useAtom(recipeAtom);
  return (
    <>
      <div className="flex gap-2">
        <Segmented
          className="w-56 shrink-0"
          value={seed == null ? "random" : "fixed"}
          options={SEED_MODES}
          onChange={(v) => setRecipe((r) => ({ ...r, seed: v === "random" ? null : randomSeed() }))}
        />
        {seed != null && (
          <>
            <Input
              mono
              inputMode="numeric"
              aria-label="Seed"
              value={seed}
              onChange={(e) => {
                const typed = Number(e.target.value.replace(/\D/g, "")) || 0;
                setRecipe((r) => ({ ...r, seed: typed }));
              }}
              className="min-w-0 flex-1"
            />
            <Button onClick={() => setRecipe((r) => ({ ...r, seed: randomSeed() }))} title="New seed">
              New
            </Button>
          </>
        )}
      </div>
      {seed != null && count > 1 && <Note>A batch counts up from this seed.</Note>}
    </>
  );
}

export function SeedsSheet() {
  const [layer, setLayer] = useAtom(layerAtom);
  const [recipe, setRecipe] = useAtom(recipeAtom);
  const triggers = useTriggers();
  const each = useRenderTime();
  const { gpu } = useGpu();
  const open = layer === "renders";
  const runs = open ? plan(recipe, triggers, 0) : [];
  const total = each == null ? null : each * runs.length;
  const rate = gpu?.rate_per_hour ?? null;
  const presets = usePresets() ?? [];
  const { surprise, sending } = useGenerate();
  const surprising = open ? surprises(recipe, presets, recipe.count, () => 0).length : 0; // as many as there are changes

  return (
    <Sheet
      open={open}
      onClose={() => setLayer(null)}
      title={`${runs.length} render${runs.length === 1 ? "" : "s"}`}
    >
      <Heading>Seeds per version</Heading>
      <Segmented
        value={recipe.count}
        options={[1, 2, 3, 4].map((n) => ({ value: n, label: `×${n}` }))}
        onChange={(count) => setRecipe((r) => ({ ...r, count }))}
      />
      <Button
        disabled={!surprising || sending}
        onClick={() => void surprise(presets).then((n) => n && setLayer(null))}
      >
        Surprise me: {surprising || recipe.count} render{(surprising || recipe.count) === 1 ? "" : "s"}
      </Button>
      <Note>
        {surprising
          ? "Each one changes one row to one of its presets; pinned rows stay as they are."
          : "No row has a preset left to change to: unpin a row or save presets."}
      </Note>
      <SeedMode />
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
