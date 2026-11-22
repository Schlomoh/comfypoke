// The recipe being edited: written back to the workspace's draft once typing pauses, and on leaving.
import { useAtomValue, useStore } from "jotai";
import { useEffect } from "react";

import { saveDraft } from "@/data/db/drafts";
import { useLoraNotes } from "@/data/db/presets";
import { useSavedList } from "@/data/db/saved";
import { useSpace } from "@/data/db/space";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { syncCastLoras, triggersOf } from "@/domain/loras";
import { recipeAtom } from "@/state/studio";

/** Mounted once, by the studio. */
export function useDraftAutosave() {
  const store = useStore();
  const space = useSpace();
  useEffect(() => {
    let saved = store.get(recipeAtom);
    let timer: number | undefined;
    const flush = () => {
      clearTimeout(timer);
      const now = store.get(recipeAtom);
      if (now !== saved) void saveDraft(space, now);
      saved = now;
    };
    const unsubscribe = store.sub(recipeAtom, () => {
      clearTimeout(timer);
      timer = window.setTimeout(flush, 300);
    });
    window.addEventListener("pagehide", flush);
    return () => {
      unsubscribe();
      window.removeEventListener("pagehide", flush);
      flush(); // closing the workspace within 300 ms of an edit
    };
  }, [store, space]);
}

/** The model family the recipe runs with, once the model list has loaded. */
function useFamily() {
  const recipe = useAtomValue(recipeAtom);
  return resolve(recipe, useCatalog().catalog).family?.id;
}

/** The trigger words of the active LoRAs, in stack order: the stack's own lead the prompt, a character's go into
 * that person's words. */
export function useTriggers() {
  return triggersOf(useAtomValue(recipeAtom).loras, useLoraNotes(), useFamily());
}

/** Keeps the cast's character LoRAs in the stack as people come and go, saved characters change and the family
 * changes (domain/loras.ts). Nothing moves while the model list loads. */
export function useCastLoras() {
  const store = useStore();
  const cast = useAtomValue(recipeAtom).cast;
  const saved = useSavedList();
  const family = useFamily();
  useEffect(() => {
    if (!family || !saved) return; // both still loading: nothing moves
    store.set(recipeAtom, (r) => {
      const loras = syncCastLoras(r.loras, cast, saved, family);
      return loras === r.loras ? r : { ...r, loras };
    });
  }, [store, cast, saved, family]);
}
