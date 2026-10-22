// Generate: what it would send, what it would cost, and sending it.
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useState } from "react";

import { Locked } from "@/data/api";
import { lockApp, useCatalog, useGpu } from "@/data/queries";
import { plan, runCount, summary } from "@/domain/batch";
import { resolve } from "@/domain/catalog";
import { compose } from "@/domain/compose";
import { errorText, median, shortName } from "@/domain/format";
import { legacyUnet, size, type Recipe } from "@/domain/recipe";
import type { Upscale } from "@/domain/render";
import { useJobs } from "@/state/jobs";
import { useTriggers } from "@/state/recipe";
import { focusAtom, recipeAtom, rendersAtom } from "@/state/studio";

/** The Upscale section's settings as what a job carries. */
export const upscaleOf = ({ upscale: { megapixels, prompt, denoise } }: Recipe): Upscale => ({
  megapixels,
  prompt,
  denoise,
});

/** Seconds one render of this model takes on this device: the median of the last 15, or null before the first. */
export function useRenderTime() {
  const unet = useAtomValue(recipeAtom).unet;
  const renders = useAtomValue(rendersAtom) ?? [];
  const times = renders
    .filter((r) => (r.unet ?? legacyUnet(r.model)) === unet)
    .slice(0, 15)
    .map((r) => r.seconds);
  return times.length ? median(times) : null;
}

/** Why Generate cannot run, in a few words, or null when it can. */
function blockedBy(recipe: Recipe, catalog: ReturnType<typeof useCatalog>, prompt: string) {
  if (!catalog.catalog.models.length) return catalog.error ? "model list unavailable" : "loading models…";
  if (!resolve(recipe, catalog.catalog).family) return "pick a family for this model";
  return prompt ? null : "add a phrase to generate";
}

export type Generate = ReturnType<typeof useGenerate>;

export function useGenerate() {
  const store = useStore();
  const recipe = useAtomValue(recipeAtom);
  const setFocus = useSetAtom(focusAtom);
  const catalog = useCatalog();
  const { gpu } = useGpu();
  const triggers = useTriggers();
  const { generate } = useJobs();
  const each = useRenderTime();
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const prompt = compose(recipe, triggers);
  const runs = runCount(recipe);
  const seconds = each == null ? null : each * runs;
  const aspect = size(recipe.aspect, recipe.mp);
  const blocked = blockedBy(recipe, catalog, prompt);

  const submit = async () => {
    const r = store.get(recipeAtom); // as it is now, not as it was when this rendered
    const sent = resolve(r, catalog.catalog);
    if (blocked || sending || !sent.family) return;
    setError("");
    setSending(true);
    const active = r.loras.filter((l) => l.on).map(({ name, strength }) => ({ name, strength }));
    const characterName =
      r.cast
        .filter((c) => c.savedId)
        .map((c) => c.name)
        .join(" & ") || undefined; // the library filters by it
    const { width, height } = size(r.aspect, r.mp);
    try {
      // one job per version and seed; stop_after rides on each, so the last one sent decides
      for (const [i, run] of plan(r, triggers).entries()) {
        const started = await generate(
          {
            unet: r.unet,
            family: sent.family.id,
            prompt: run.prompt,
            negative: sent.negative ? r.negative : "",
            width,
            height,
            seed: run.seed,
            steps: r.steps,
            cfg: r.cfg,
            loras: active,
            stop_after: r.stopAfter,
          },
          // oxlint-disable-next-line unicorn/no-thenable -- the field's name in jobs already stored on phones
          { recipe: run.recipe, characterName, then: r.upscale.auto ? upscaleOf(r) : undefined },
        );
        if (i === 0) setFocus(started.id);
      }
      if (!matchMedia("(min-width: 1024px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return {
    submit,
    sending,
    error: error || (catalog.error ? errorText(catalog.error) : ""),
    blocked,
    runs,
    seconds,
    cost: seconds != null && gpu ? (seconds * gpu.rate_per_hour) / 3600 : null,
    booting: gpu ? !gpu.booted : false,
    stopAfter: recipe.stopAfter,
    label: summary(recipe) ?? `${shortName(recipe.unet)} · ${aspect.width}×${aspect.height}`,
  };
}
