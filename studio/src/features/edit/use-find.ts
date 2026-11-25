// Finding by words: SAM 3.1 finds what is named (/api/mask, a few seconds on a warm GPU) and the area joins the
// mask being edited (the image's, or a person's in People) as a step. The toolbar asks; the Edit tab's mask summary shows what is still being found.
import { useStore } from "jotai";

import { api, Locked } from "@/data/api";
import { useSpace } from "@/data/db/space";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { areaOf } from "@/features/edit/mask";
import { masksAtom } from "@/features/edit/state";
import { lookAt, setStage, stageOf, useStages } from "@/state/preview";
import { notify } from "@/ui/notify";

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

/** A part by its label as SAM is asked for it; words of one's own are asked as they are. */
export const partWords = (label: string) => PARTS.find(([l]) => l === label)?.[1] ?? label;

/** What the image's people wore, as written: the likeliest things to find again. */
export const worn = (r: Render) => [
  ...new Set(
    r.recipe?.cast.flatMap((p) => p.wear.filter((x) => x.on && x.t.trim()).map((x) => x.t.trim())) ?? [],
  ),
];

const finding = (key: string) => `find:${key}:`;

/** What is being found right now for the mask `key`, by its words, with its stage. */
export function useFinding(key: string) {
  return useStages(finding(key)).map(({ rest, stage }) => ({ text: rest, stage }));
}

/** Finding by words on `render`, into the mask `key` (features/edit/state maskKey). */
export function useFind(render: Render, key: string) {
  const store = useStore();
  const space = useSpace();

  /** `label` is how the area is listed and recorded, `what` what SAM is asked for. True when it found something. */
  return async (label: string, what = label): Promise<boolean> => {
    const t = label.trim();
    const look = finding(key) + t;
    if (!t || stageOf(look)) return false;
    setStage(look, "queued");
    try {
      const b64 = await lookAt(
        space,
        render.id,
        (tr, image) => api.mask(tr.wire, image, what.trim()),
        (s) => setStage(look, s),
      );
      const area = await areaOf(b64);
      if (!area) throw new Error("nothing found by that name; try other words, tap it, or paint it");
      store.set(masksAtom, (m) => ({
        ...m,
        [key]: [...(m[key] ?? []), { kind: "found", id: crypto.randomUUID(), text: t, area }],
      }));
      return true;
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else notify(`Could not find “${t}”: ${errorText(e)}`, { bad: true });
      return false;
    } finally {
      setStage(look, null);
    }
  };
}
