// Generate: what it would send, what it would cost, and sending it.
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useState } from "react";

import { FACE_FAMILIES, Locked } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { useLoraNotes } from "@/data/db/presets";
import { useSetups } from "@/data/db/setups";
import { useSpace } from "@/data/db/space";
import { lockApp, useCatalog, useGpu } from "@/data/queries";
import { plan, runCount, summary } from "@/domain/batch";
import { faceFor, inPicture } from "@/domain/cast";
import { resolve } from "@/domain/catalog";
import { compose } from "@/domain/compose";
import { errorText, median, shortName } from "@/domain/format";
import { runnable, triggersOf } from "@/domain/loras";
import { DRAFT_MP, legacyUnet, size, type Recipe } from "@/domain/recipe";
import type { Render, Upscale } from "@/domain/render";
import { toPass } from "@/domain/setup";
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
  const space = useSpace();
  const recipe = useAtomValue(recipeAtom);
  const setFocus = useSetAtom(focusAtom);
  const catalog = useCatalog();
  const { gpu } = useGpu();
  const triggers = useTriggers();
  const { generate } = useJobs();
  const each = useRenderTime();
  const setups = useSetups();
  const notes = useLoraNotes();
  const finishing = recipe.finish && setups.find((s) => s.id === recipe.finish?.setup);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const prompt = compose(recipe, triggers);
  const runs = runCount(recipe);
  const seconds = each == null ? null : each * runs;
  const aspect = size(recipe.aspect, recipe.draft ? Math.min(recipe.mp, DRAFT_MP) : recipe.mp);
  const blocked = blockedBy(recipe, catalog, prompt);

  /** One job per version and seed of `r`, sharing a batch; a draft renders small, `from` is the draft made big. */
  const send = async (
    r: Recipe,
    { draft, from, title }: { draft: boolean; from?: Render; title?: string },
  ): Promise<boolean> => {
    const sent = resolve(r, catalog.catalog);
    if (sending || !sent.family) return false;
    setError("");
    setSending(true);
    const active = runnable(r.loras, notes, sent.family.id);
    const words = triggersOf(r.loras, notes, sent.family.id); // this recipe's, which a draft made big need not share
    const characterName =
      r.cast
        .filter((c) => c.savedId)
        .map((c) => c.name)
        .join(" & ") || undefined; // the library filters by it
    const { width, height } = size(r.aspect, draft ? Math.min(r.mp, DRAFT_MP) : r.mp);
    const batch = crypto.randomUUID();
    const fin = r.finish && setups.find((s) => s.id === r.finish?.setup);
    const finish = fin && r.finish ? { ...toPass(fin), denoise: r.finish.strength } : null;
    const last = finish?.family ?? sent.family.id; // the head swap runs on the last pass's model
    const face = FACE_FAMILIES.includes(last) ? faceFor(r)?.face : null;
    try {
      const photo = face ? await loadFace(space, face) : undefined;
      // one job per version and seed; stop_after rides on each, so the last one sent decides
      const jobs = plan(r, words).map((run) => ({ ...run, title }));
      for (const [i, run] of jobs.entries()) {
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
            finish,
            // one face only: with two, the box around both faces is most of the picture; the server skips it under a photo
            face_pass: inPicture(run.recipe).length === 1 ? r.facePass : null,
          },
          {
            recipe: run.recipe,
            title: run.title,
            characterName,
            // oxlint-disable-next-line unicorn/no-thenable -- the field's name in jobs already stored on phones
            then: r.upscale.auto && !draft ? upscaleOf(r) : undefined,
            batch,
            draft,
            from,
          },
          photo,
        );
        if (i === 0) setFocus(started.id);
      }
      if (!matchMedia("(min-width: 1024px)").matches) window.scrollTo({ top: 0, behavior: "smooth" });
      return true;
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else setError(errorText(e));
      return false;
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    const r = store.get(recipeAtom); // as it is now, not as it was when this rendered
    if (!blocked) await send(r, { draft: r.draft });
  };
  /** A draft again at the size its recipe asks for, same seed: sharper, though the composition may shift. */
  const rerender = async (d: Render) => {
    if (d.recipe)
      await send(
        { ...d.recipe, draft: false, seed: d.seed, count: 1 },
        { draft: false, from: d, title: d.title },
      );
  };

  return {
    submit,
    rerender,
    sending,
    error: error || (catalog.error ? errorText(catalog.error) : ""),
    blocked,
    runs,
    seconds,
    cost: seconds != null && gpu ? (seconds * gpu.rate_per_hour) / 3600 : null,
    booting: gpu ? !gpu.booted : false,
    stopAfter: recipe.stopAfter,
    draft: recipe.draft,
    label:
      (recipe.draft ? "draft · " : "") +
      (summary(recipe) ?? `${shortName(recipe.unet)} · ${aspect.width}×${aspect.height}`) +
      (finishing ? ` → ${finishing.name}` : ""),
  };
}
