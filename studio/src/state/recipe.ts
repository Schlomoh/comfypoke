// The recipe being edited: written back to the workspace's draft once typing pauses, and on leaving.
import { useAtomValue, useStore } from "jotai";
import { useEffect } from "react";

import { saveDraft } from "@/data/db/drafts";
import { useLoraNotes } from "@/data/db/presets";
import { useSpace } from "@/data/db/space";
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

/** The trigger words of the active LoRAs, in their order: they lead the prompt. */
export function useTriggers() {
  const loras = useAtomValue(recipeAtom).loras;
  const notes = useLoraNotes();
  return loras
    .filter((l) => l.on)
    .map((l) => notes.find((n) => n.name === l.name)?.trigger ?? "")
    .filter(Boolean);
}
