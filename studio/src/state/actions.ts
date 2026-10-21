// What can be done to an image from anywhere it is shown (stage, viewer, library, keyboard), and moving
// between images. Each reads the store when it runs, so a held arrow key never acts on a stale image.
import { useSetAtom, useStore } from "jotai";
import { useEffect } from "react";

import { Locked } from "@/data/api";
import { removeRender, useRenders } from "@/data/db/renders";
import { lockApp, useCatalog } from "@/data/queries";
import { errorText } from "@/domain/format";
import { parseRecipe } from "@/domain/parse";
import { EMPTY, fromSize, legacyUnet, phrase, type Recipe } from "@/domain/recipe";
import { withUpscales, type Render } from "@/domain/render";
import { upscaleOf } from "@/state/generate";
import { useJobs } from "@/state/jobs";
import {
  cursorAtom,
  focusAtom,
  jobsAtom,
  recipeAtom,
  rendersAtom,
  sequenceAtom,
  shownAtom,
  tabAtom,
  viewerAtom,
} from "@/state/studio";
import { notify } from "@/ui/notify";

/** Decrypts the workspace's renders into rendersAtom. Mounted once, by the studio. */
export function useRendersSync() {
  const store = useStore();
  const renders = useRenders();
  useEffect(() => {
    store.set(rendersAtom, renders);
    if (!renders) return;
    // a finished job has done its part once its render is listed
    const ids = new Set(renders.map((r) => r.id));
    const jobs = store.get(jobsAtom);
    if (jobs.some((j) => j.saved && ids.has(j.id)))
      store.set(
        jobsAtom,
        jobs.filter((j) => !(j.saved && ids.has(j.id))),
      );
  }, [store, renders]);
}

/** The library's thumbnail for an item, wherever it is on screen (the phone tab and the desktop column both have one). */
const revealThumb = (id: string) => {
  for (const el of document.querySelectorAll(`[data-render="${CSS.escape(id)}"]`))
    el.scrollIntoView({ block: "nearest" });
};

export function useImageActions() {
  const store = useStore();
  const setRecipe = useSetAtom(recipeAtom);
  const setTab = useSetAtom(tabAtom);
  const { catalog } = useCatalog();
  const { upscale } = useJobs();

  /** Loads a render's settings back into the editor. A render from before recipes were kept comes back as its prompt, verbatim, in the scene's Extra row. */
  const reuse = (r: Render) => {
    const base: Recipe = r.recipe
      ? parseRecipe(r.recipe)
      : { ...EMPTY, scene: { ...EMPTY.scene, extra: [phrase(r.prompt)] }, ...fromSize(r.width, r.height) };
    // the model as actually rendered; older renders and recipes only knew "turbo" or "raw"
    const unet = r.unet ?? legacyUnet(r.model);
    const suggested = catalog.models.find((m) => m.file === unet)?.family;
    // the family is pinned only when it differs from what the model list suggests; with no list yet, it stays as rendered
    const family = r.family && (catalog.models.length === 0 || r.family !== suggested) ? r.family : null;
    setRecipe({ ...base, unet, family, seed: r.seed, count: 1 });
    store.set(viewerAtom, null);
    setTab("prompt");
  };

  /** Upscales with the Model tab's settings, one job each; the results land in the library as new images. */
  const upscaleMany = async (rs: Render[]) => {
    const recipe = store.get(recipeAtom);
    const u = upscaleOf(recipe);
    notify(
      `Upscaling ${rs.length > 1 ? `${rs.length} images` : "the image"} to ${u.megapixels} MP${u.prompt.trim() ? " with a touch-up" : ""}`,
    );
    for (const r of rs) {
      try {
        await upscale(r, u, recipe.stopAfter);
      } catch (e) {
        if (e instanceof Locked) {
          lockApp();
          return;
        }
        return notify(`Could not start the upscale: ${errorText(e)}`, { bad: true });
      }
    }
  };

  /** Deletes renders and every upscale made from them, after asking once. The ids deleted, or null when not confirmed. */
  const removeMany = async (rs: Render[]) => {
    const ids = withUpscales(
      rs.map((r) => r.id),
      store.get(rendersAtom) ?? [],
    );
    const extra = ids.size - rs.length;
    const what = rs.length === 1 ? "this image" : `${rs.length} images`;
    const also = extra
      ? ` and ${extra} upscale${extra > 1 ? "s" : ""} made from ${rs.length === 1 ? "it" : "them"}`
      : "";
    if (!confirm(`Delete ${what}${also} from this device?`)) return null;
    for (const id of ids) await removeRender(id);
    notify(`Deleted ${ids.size} image${ids.size > 1 ? "s" : ""}`);
    return ids;
  };

  /** Deletes one image (and its upscales), then shows the next one where it was. */
  const remove = async (r: Render) => {
    const shown = store.get(shownAtom);
    const gone = await removeMany([r]);
    if (!gone) return;
    const at = shown.findIndex((x) => x.id === r.id);
    const left = (from: number, dir: 1 | -1) => {
      for (let i = from; i >= 0 && i < shown.length; i += dir) if (!gone.has(shown[i].id)) return shown[i];
    };
    const after = left(at + 1, 1) ?? left(at - 1, -1); // its upscales sit next to it and went with it
    store.set(focusAtom, after?.id ?? null);
    if (store.get(viewerAtom)) store.set(viewerAtom, after?.id ?? null);
  };

  /** Moves through the queue and the library by n images. The zoom stays as it is. */
  const step = (n: number) => {
    const items = store.get(sequenceAtom);
    const at = items.indexOf(store.get(cursorAtom) ?? "");
    const next = items[Math.min(items.length - 1, Math.max(0, at + n))];
    if (!next || next === store.get(cursorAtom)) return false;
    if (store.get(viewerAtom)) store.set(viewerAtom, next);
    store.set(focusAtom, next);
    revealThumb(next);
    return true;
  };

  /** Shows an image or job on the stage and in the viewer. */
  const open = (id: string) => {
    store.set(focusAtom, id);
    store.set(viewerAtom, id);
  };

  return { reuse, upscaleMany, removeMany, remove, step, open };
}
