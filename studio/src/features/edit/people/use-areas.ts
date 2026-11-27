// A person's area as dressing goes over it, found when asked for (/api/areas: the clothes their part names, cut to
// their silhouette) for the stage to show and the bar to edit. It is the first step of their mask (AREA_STEP), so their
// strokes on it stay when it is found again for another part, and it is written only if they are still as they were
// when it was asked for.
import { useStore } from "jotai";

import { api, Locked } from "@/data/api";
import { useSpace } from "@/data/db/space";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { areaOf, type Op } from "@/features/edit/mask";
import { AREA_STEP, peopleAtom, type PersonRow } from "@/features/edit/people/state";
import { maskKey, masksAtom } from "@/features/edit/state";
import { partWords } from "@/features/edit/use-find";
import { lookAt, setStage, stageOf } from "@/state/preview";
import { notify } from "@/ui/notify";

/** A step of a person's mask that is their area as found, not one of theirs. */
export const isArea = (o: Op) => o.kind === "found" && o.id.startsWith(`${AREA_STEP}:`);

export const areaLook = (key: string) => `area:${key}`;

/** The person a look was asked for is still the one there: the same face found, the same pick. */
export const still = (now: PersonRow | undefined, then: PersonRow) =>
  !!now && now.found === then.found && now.pick.who === then.pick.who && now.pick.part === then.pick.part;

export function useArea(render: Render, index: number) {
  const store = useStore();
  const space = useSpace();
  return async () => {
    const key = maskKey(render.id, index);
    const look = areaLook(key);
    const row = store.get(peopleAtom)[render.id]?.[index];
    if (stageOf(look) || !row) return;
    setStage(look, "queued");
    try {
      const b64 = await lookAt(
        space,
        render.id,
        (t, image) =>
          api.areas(t.wire, image, [{ box: row.found?.box ?? null, part: partWords(row.pick.part) }]),
        (s) => setStage(look, s),
      );
      const area = await areaOf(b64);
      if (!still(store.get(peopleAtom)[render.id]?.[index], row)) return; // found again, or another part, while this ran
      if (!area) {
        notify("Nothing found for their part: paint their area, or pick another part");
        return;
      }
      const found: Op = {
        kind: "found",
        id: `${AREA_STEP}:${crypto.randomUUID()}`,
        text: row.pick.part,
        area,
      };
      store.set(masksAtom, (m) => ({ ...m, [key]: [found, ...(m[key] ?? []).filter((o) => !isArea(o))] }));
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else notify(`Could not find their area: ${errorText(e)}`, { bad: true });
    } finally {
      setStage(look, null);
    }
  };
}
