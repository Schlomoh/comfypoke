// Finding the faces on an image (/api/faces, a second or two on a warm GPU), each guessed as one of the cast by their
// face photo or where they stand (comfy_nodes/studio_face/assign.py). Runs by itself the first time People opens on an
// image while the GPU is up; "find again" after the cast changed, which starts the image's people afresh.
import { useStore } from "jotai";

import { api, Locked } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { useSpace } from "@/data/db/space";
import { imageRef } from "@/data/images";
import { lockApp } from "@/data/queries";
import { FACE_PEOPLE, sideOf } from "@/domain/face";
import { errorText } from "@/domain/format";
import { facesOf } from "@/domain/people";
import type { Render } from "@/domain/render";
import { pixelsOf } from "@/features/edit/mask";
import {
  bodiesAtom,
  peopleAtom,
  selectedAtom,
  startPick,
  type PersonRow,
} from "@/features/edit/people/state";
import { isPersonKey, masksAtom, tapsAtom } from "@/features/edit/state";
import { lookAt, setStage, stageOf, useStage } from "@/state/preview";
import { recipeAtom } from "@/state/studio";
import { notify } from "@/ui/notify";

const finding = (renderId: string) => `faces:${renderId}`;

export function useFinding(render: Render | undefined) {
  return useStage(finding(render?.id ?? ""));
}

/** Without these an image's people start afresh: faces are numbered left to right and may come back otherwise. */
const without = <T>(all: Readonly<Record<string, T>>, renderId: string) =>
  Object.fromEntries(Object.entries(all).filter(([k]) => !isPersonKey(k, renderId)));

export function useFaces(render: Render) {
  const store = useStore();
  const space = useSpace();
  return async () => {
    const look = finding(render.id);
    if (stageOf(look)) return;
    const cast = store.get(recipeAtom).cast.slice(0, FACE_PEOPLE);
    setStage(look, "queued");
    try {
      const b64 = await lookAt(
        space,
        render.id,
        async (t, image) => {
          // a face photo gone from the device only means that person is told apart by where they stand
          const people = await Promise.all(
            cast.map(async (p) => {
              const photo = p.face ? await loadFace(space, p.face).catch(() => undefined) : undefined;
              return { side: sideOf(p), face: photo && (await imageRef(t, photo)) };
            }),
          );
          return api.faces(t.wire, image, people);
        },
        (s) => setStage(look, s),
      );
      const { px, width } = await pixelsOf(b64);
      const found = facesOf(px, width);
      const rows: PersonRow[] = found.length
        ? found.map((f) => ({ found: f, pick: startPick(f.guess === null ? undefined : cast[f.guess]) }))
        : [{ found: null, pick: startPick(cast[0]) }]; // no face: whoever is in the picture, to dress
      store.set(peopleAtom, (all) => ({ ...all, [render.id]: rows }));
      store.set(masksAtom, (all) => without(all, render.id));
      store.set(tapsAtom, (all) => without(all, render.id));
      store.set(selectedAtom, null);
      store.set(bodiesAtom, (all) => without(all, render.id));
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else notify(`Could not find the faces: ${errorText(e)}`, { bad: true });
    } finally {
      setStage(look, null);
    }
  };
}
