// Finding the faces on an image (/api/faces, a second or two on a warm GPU), each guessed as one of the cast by their
// face photo or where they stand (comfy_nodes/studio_face/assign.py). Runs by itself the first time People opens on an
// image; "find again" after the cast changed.
import { useAtomValue, useStore } from "jotai";

import { api, Locked } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { loadImage } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { imageRef, withImages } from "@/data/images";
import { lockApp } from "@/data/queries";
import { FACE_PEOPLE, sideOf } from "@/domain/face";
import { errorText } from "@/domain/format";
import { facesOf } from "@/domain/people";
import type { Render } from "@/domain/render";
import { findingAtom, peopleAtom, startPick, type PersonRow } from "@/features/edit/people/state";
import { preview } from "@/state/preview";
import { recipeAtom } from "@/state/studio";
import { notify } from "@/ui/notify";

/** A PNG's RGBA pixels and its width. */
async function pixelsOf(b64: string) {
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
  const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
  if (!ctx) throw new Error("This browser cannot read the faces found.");
  ctx.drawImage(img, 0, 0);
  return { px: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width };
}

export function useFinding(render: Render | undefined) {
  return useAtomValue(findingAtom)[render?.id ?? ""] ?? null;
}

export function useFaces(render: Render) {
  const store = useStore();
  const space = useSpace();
  return async () => {
    if (store.get(findingAtom)[render.id]) return;
    const cast = store.get(recipeAtom).cast.slice(0, FACE_PEOPLE);
    const stage = (s: string) => store.set(findingAtom, (all) => ({ ...all, [render.id]: s }));
    stage("queued");
    try {
      const b64 = await preview(
        space,
        async () =>
          withImages(space, async (t) => {
            // a face photo gone from the device only means that person is told apart by where they stand
            const people = await Promise.all(
              cast.map(async (p) => {
                const photo = p.face ? await loadFace(space, p.face).catch(() => undefined) : undefined;
                return { side: sideOf(p), face: photo && (await imageRef(t, photo)) };
              }),
            );
            return api.faces(t.wire, await imageRef(t, await loadImage(space, render.id)), people);
          }),
        stage,
      );
      const { px, width } = await pixelsOf(b64);
      const found = facesOf(px, width);
      const rows: PersonRow[] = found.length
        ? found.map((f) => ({ found: f, pick: startPick(f.guess === null ? undefined : cast[f.guess], f) }))
        : [{ found: null, pick: startPick(cast[0], null) }]; // no face: whoever is in the picture, to dress
      store.set(peopleAtom, (all) => ({ ...all, [render.id]: rows }));
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else notify(`Could not find the faces: ${errorText(e)}`, { bad: true });
    } finally {
      store.set(findingAtom, (all) =>
        Object.fromEntries(Object.entries(all).filter(([id]) => id !== render.id)),
      );
    }
  };
}
