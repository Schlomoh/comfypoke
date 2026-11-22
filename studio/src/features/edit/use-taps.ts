// Tap to select: each change to an image's tapped points asks SAM 3.1 for the area they mark (/api/mask with
// points, a few seconds on a warm GPU), and the answer replaces that area in the image's mask steps, so the area
// follows the points until it is kept. Only the latest answer counts: a tap made while one runs supersedes it.
import { useAtomValue, useStore } from "jotai";
import { useEffect, useRef } from "react";

import { api, Locked } from "@/data/api";
import { loadImage } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { imageRef, withImages } from "@/data/images";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { areaOf, type Op } from "@/features/edit/mask";
import { masksAtom, tapsAtom, tapStageAtom, type Taps } from "@/features/edit/state";
import { preview } from "@/state/preview";
import { notify } from "@/ui/notify";

/** The mask steps with the tapped area put in place of its earlier version, or added at the end; none removes it. */
const placed = (ops: Op[], id: string, area: ImageBitmap | null): Op[] => {
  const at = ops.findIndex((o) => o.kind === "found" && o.id === id);
  if (!area) return at === -1 ? ops : ops.filter((_, i) => i !== at);
  const op: Op = { kind: "found", id, text: "tapped", area };
  return at === -1 ? [...ops, op] : ops.map((o, i) => (i === at ? op : o));
};

/** Pixels SAM takes: whole, inside the image. */
const px = (f: number, size: number) => Math.min(size - 1, Math.max(0, Math.round(f * size)));

export function useTaps(render: Render) {
  const store = useStore();
  const space = useSpace();
  const taps: Taps | undefined = useAtomValue(tapsAtom)[render.id];
  const latest = useRef(0);

  useEffect(() => {
    if (!taps) return;
    const run = ++latest.current;
    const set = (area: ImageBitmap | null) =>
      store.set(masksAtom, (m) => ({ ...m, [render.id]: placed(m[render.id] ?? [], taps.op, area) }));
    const yes = taps.points.filter((p) => !p.not);
    if (!yes.length) {
      set(null); // only "not this" points, or none left: nothing is marked
      return;
    }
    const pts = (not: boolean) =>
      taps.points
        .filter((p) => p.not === not)
        .map((p) => ({ x: px(p.at[0], render.width), y: px(p.at[1], render.height) }));
    store.set(tapStageAtom, { id: render.id, stage: "queued" });
    void (async () => {
      try {
        const b64 = await preview(
          async () =>
            withImages(async () =>
              api.mask(await imageRef(await loadImage(space, render.id)), "", {
                positive: pts(false),
                negative: pts(true),
              }),
            ),
          (stage) => run === latest.current && store.set(tapStageAtom, { id: render.id, stage }),
        );
        if (run !== latest.current) return;
        const area = await areaOf(b64);
        if (!area) notify("Nothing found there; tap the middle of the thing, or paint it");
        set(area);
      } catch (e) {
        if (e instanceof Locked) lockApp();
        else if (run === latest.current)
          notify(`Could not find what was tapped: ${errorText(e)}`, { bad: true });
      } finally {
        if (run === latest.current) store.set(tapStageAtom, null);
      }
    })();
  }, [store, space, render.id, render.width, render.height, taps]);
}
