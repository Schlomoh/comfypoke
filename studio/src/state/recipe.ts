// The recipe being edited: written back to the workspace's draft once typing pauses, and on leaving.
import { atom, useAtomValue, useStore } from "jotai";
import { useEffect } from "react";

import { saveDraft } from "@/data/db/drafts";
import { useLoraNotes } from "@/data/db/lora-notes";
import { updateSaved, useSavedList } from "@/data/db/saved";
import { useSpace } from "@/data/db/space";
import { useCatalog } from "@/data/queries";
import { resolve } from "@/domain/catalog";
import { handedOver, reassign, syncCastLoras, triggersOf, withLora, type Handoff } from "@/domain/loras";
import type { StackLora } from "@/domain/recipe";
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
  const handoff = useAtomValue(handoffAtom);
  useEffect(() => {
    if (!family || !saved) return; // both still loading: nothing moves
    const known = (id?: string) => !id || saved.some((s) => s.id === id);
    const stale =
      !!handoff &&
      (handoff.family !== family || // the model changed meanwhile: the write went to the other family's list
        !known(handoff.from) ||
        !known(handoff.to) || // deleted meanwhile
        (!!handoff.to && !cast.some((c) => c.savedId === handoff.to))); // left the cast: the look keeps it
    if (handoff && !stale && !handedOver(handoff, saved, family)) return; // being written: wait for it
    store.set(recipeAtom, (r) => {
      const mine = handoff && !stale ? reassign(r.loras, handoff) : r.loras;
      const loras = syncCastLoras(mine, cast, saved, family);
      return loras === r.loras ? r : { ...r, loras };
    });
    if (handoff) store.set(handoffAtom, null);
  }, [store, cast, saved, family, handoff]);
}

/** A LoRA changing owner: the stack and the saved characters are two stores, so the stack follows once the
 * characters show the change (useCastLoras), keeping the LoRA's place, strength and switch. */
const handoffAtom = atom<Handoff | null>(null);

/** Gives a LoRA of the stack to a saved character, or back to the look (`to` undefined). */
export function useGiveLora() {
  const store = useStore();
  const space = useSpace();
  const family = useFamily();
  return (lora: StackLora, to: string | undefined) => {
    if (!family || lora.from === to || store.get(handoffAtom)) return;
    const from = lora.from;
    store.set(handoffAtom, { name: lora.name, from, to, family });
    const put = (id: string, strength: number | null) =>
      updateSaved(space, id, (s) => ({ ...s, loras: withLora(s.loras, family, lora.name, strength) }));
    void (async () => {
      try {
        if (to) await put(to, lora.strength);
        try {
          if (from) await put(from, null);
        } catch (e) {
          if (to) await put(to, null); // both bringing it would list it twice
          throw e;
        }
      } catch {
        store.set(handoffAtom, null);
      }
    })();
  };
}
