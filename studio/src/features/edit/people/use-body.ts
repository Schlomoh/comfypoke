// A person's body as SAM 3D Body fits it (/api/body, by their face's box), when asked for: shown under the masks, and
// sent with a dressing, which holds to exactly it. Without one they are dressed without a body.
import { useStore } from "jotai";

import { api, Locked } from "@/data/api";
import { useSpace } from "@/data/db/space";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { bodiesAtom, peopleAtom } from "@/features/edit/people/state";
import { maskKey } from "@/features/edit/state";
import { lookAt, setStage, stageOf } from "@/state/preview";
import { notify } from "@/ui/notify";

export const bodyLook = (key: string) => `body:${key}`;

export function useBody(render: Render, index: number) {
  const store = useStore();
  const space = useSpace();
  return async () => {
    const key = maskKey(render.id, index);
    const look = bodyLook(key);
    const row = store.get(peopleAtom)[render.id]?.[index];
    if (stageOf(look) || !row) return;
    setStage(look, "queued");
    try {
      const b64 = await lookAt(
        space,
        render.id,
        (t, image) => api.body(t.wire, image, row.found?.box ?? null),
        (s) => setStage(look, s),
      );
      if (store.get(peopleAtom)[render.id]?.[index]?.found !== row.found) return; // faces found again while this ran
      store.set(bodiesAtom, (all) => ({ ...all, [key]: b64 }));
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else notify(`Could not fit their body: ${errorText(e)}`, { bad: true });
    } finally {
      setStage(look, null);
    }
  };
}
