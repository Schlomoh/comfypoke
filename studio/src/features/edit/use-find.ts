// Finding by words: SAM 3.1 finds what is named (/api/mask, a few seconds on a warm GPU) and the area joins the
// image's mask as a step. The toolbar asks; the Edit tab's mask summary shows what is still being found.
import { atom, useAtomValue, useStore } from "jotai";

import { api, Locked } from "@/data/api";
import { loadImage } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { imageRef, withImages } from "@/data/images";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { areaOf } from "@/features/edit/mask";
import { masksAtom } from "@/features/edit/state";
import { preview } from "@/state/preview";
import { notify } from "@/ui/notify";

/** What is being found right now, on which image, with its stage. */
export type Finding = { id: string; text: string; stage: string };
const findingAtom = atom<Finding[]>([]);

/** Garments by name: "clothing" alone found a t-shirt and left the jeans. */
export const PARTS: [string, string][] = [
  ["all clothes", "shirt, top, pants, shorts, skirt, dress, jacket"],
  ["top", "shirt, top"],
  ["bottoms", "pants, shorts, skirt"],
  ["shoes", "shoes"],
  ["jacket", "jacket, coat"],
  ["hair", "hair"],
  ["background", "background"],
];

/** What the image's people wore, as written: the likeliest things to find again. */
export const worn = (r: Render) => [
  ...new Set(
    r.recipe?.cast.flatMap((p) => p.wear.filter((x) => x.on && x.t.trim()).map((x) => x.t.trim())) ?? [],
  ),
];

export function useFinding(render: Render) {
  return useAtomValue(findingAtom).filter((f) => f.id === render.id);
}

export function useFind(render: Render) {
  const store = useStore();
  const space = useSpace();
  const set = (text: string, stage: string | null) =>
    store.set(findingAtom, (all) => [
      ...all.filter((f) => f.id !== render.id || f.text !== text),
      ...(stage ? [{ id: render.id, text, stage }] : []),
    ]);

  /** `label` is how the area is listed and recorded, `what` what SAM is asked for. True when it found something. */
  return async (label: string, what = label): Promise<boolean> => {
    const t = label.trim();
    if (!t || store.get(findingAtom).some((f) => f.id === render.id && f.text === t)) return false;
    set(t, "queued");
    try {
      const b64 = await preview(
        space,
        async () =>
          withImages(space, async (tr) =>
            api.mask(tr.wire, await imageRef(tr, await loadImage(space, render.id)), what.trim()),
          ),
        (stage) => set(t, stage),
      );
      const area = await areaOf(b64);
      if (!area) throw new Error("nothing found by that name; try other words, tap it, or paint it");
      store.set(masksAtom, (m) => ({
        ...m,
        [render.id]: [...(m[render.id] ?? []), { kind: "found", id: crypto.randomUUID(), text: t, area }],
      }));
      return true;
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else notify(`Could not find “${t}”: ${errorText(e)}`, { bad: true });
      return false;
    } finally {
      set(t, null);
    }
  };
}
