// Each dressed person's area as dressing would find it (/api/areas: the clothes their part names, cut to their
// silhouette), for the stage to show and the bar to edit. One job for everyone dressed whose area was not asked for in
// their part yet; each area is the first step of their mask (AREA_STEP), so strokes on it stay when it is found again
// for another part, and it is written only if they are still as they were when it was asked for.
import { useStore } from "jotai";

import { api, Locked } from "@/data/api";
import { useSpace } from "@/data/db/space";
import { lockApp } from "@/data/queries";
import { FACE_PEOPLE } from "@/domain/face";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { areasOf, type Op } from "@/features/edit/mask";
import { AREA_STEP, askedAtom, peopleAtom, type PersonRow } from "@/features/edit/people/state";
import { maskKey, masksAtom } from "@/features/edit/state";
import { partWords } from "@/features/edit/use-find";
import { lookAt, setStage, stageOf } from "@/state/preview";
import { notify } from "@/ui/notify";

/** A step of a person's mask that is their area as found, not one of theirs. */
export const isArea = (o: Op) => o.kind === "found" && o.id.startsWith(`${AREA_STEP}:`);

export const areasLook = (renderId: string) => `areas:${renderId}`;
const askFor = (key: string, row: PersonRow) => `${key}|${row.pick.part}`;

/** The dressed people of an image whose area has not been asked for in their part yet. */
export function wanted(rows: readonly PersonRow[], renderId: string, asked: ReadonlySet<string>) {
  return rows
    .flatMap((row, i) => {
      const key = maskKey(renderId, i);
      return row.pick.who && row.pick.outfit && !asked.has(askFor(key, row)) ? [{ key, i, row }] : [];
    })
    .slice(0, FACE_PEOPLE);
}

/** Their area is for them as they are now: the same face found, the same part, still dressed. */
const still = (now: PersonRow | undefined, then: PersonRow) =>
  !!now &&
  now.found === then.found &&
  now.pick.part === then.pick.part &&
  now.pick.outfit &&
  now.pick.who === then.pick.who;

export function useAreas(render: Render) {
  const store = useStore();
  const space = useSpace();
  return async () => {
    const look = areasLook(render.id);
    if (stageOf(look)) return;
    const want = wanted(store.get(peopleAtom)[render.id] ?? [], render.id, store.get(askedAtom));
    if (!want.length) return;
    store.set(askedAtom, (all) => new Set([...all, ...want.map(({ key, row }) => askFor(key, row))]));
    setStage(look, "queued");
    try {
      const b64 = await lookAt(
        space,
        render.id,
        (t, image) =>
          api.areas(
            t.wire,
            image,
            want.map(({ row }) => ({ box: row.found?.box ?? null, part: partWords(row.pick.part) })),
          ),
        (s) => setStage(look, s),
      );
      const areas = await areasOf(b64, want.length);
      const rows = store.get(peopleAtom)[render.id] ?? [];
      store.set(masksAtom, (m) => {
        const out = { ...m };
        want.forEach(({ key, i, row }, k) => {
          const area = areas[k];
          if (!still(rows[i], row)) return; // found again, or another part picked, while this ran
          const rest = (out[key] ?? []).filter((o) => !isArea(o));
          const found: Op[] = area
            ? [{ kind: "found", id: `${AREA_STEP}:${crypto.randomUUID()}`, text: row.pick.part, area }]
            : [];
          out[key] = [...found, ...rest];
        });
        return out;
      });
      if (areas.some((a) => !a))
        notify("Nothing found for someone's part: paint their area, or pick another part");
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else notify(`Could not find the areas: ${errorText(e)}`, { bad: true });
    } finally {
      setStage(look, null);
    }
  };
}
