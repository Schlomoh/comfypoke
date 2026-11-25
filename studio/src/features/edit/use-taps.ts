// Tap to select: each change to a mask's tapped points asks SAM 3.1 for the area they mark (/api/mask with
// points, a few seconds on a warm GPU), and the answer replaces that area in the image's mask steps, so the area
// follows the points until it is kept. Only the latest answer counts: a tap made while one runs supersedes it.
import { useAtomValue, useStore } from "jotai";
import { useEffect, useRef } from "react";

import { api, Locked } from "@/data/api";
import { useSpace } from "@/data/db/space";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { areaOf, type Op } from "@/features/edit/mask";
import { masksAtom, tapsAtom, type Taps } from "@/features/edit/state";
import { lookAt, setStage } from "@/state/preview";
import { notify } from "@/ui/notify";

/** The mask steps with the tapped area put in place of its earlier version, or added at the end; none removes it. */
const placed = (ops: Op[], id: string, area: ImageBitmap | null): Op[] => {
  const at = ops.findIndex((o) => o.kind === "found" && o.id === id);
  if (!area) return at === -1 ? ops : ops.filter((_, i) => i !== at);
  const op: Op = { kind: "found", id, text: "tapped", area };
  return at === -1 ? [...ops, op] : ops.map((o, i) => (i === at ? op : o));
};

/** The look key of the area being found for the mask `key`'s taps (state/preview.ts). */
export const tapping = (key: string) => `tap:${key}`;

/** Pixels SAM takes: whole, inside the image. */
const px = (f: number, size: number) => Math.min(size - 1, Math.max(0, Math.round(f * size)));

/** The tapped points of the mask `key` (features/edit/state maskKey), found on `render`. */
export function useTaps(render: Render, key: string) {
  const store = useStore();
  const space = useSpace();
  const taps: Taps | undefined = useAtomValue(tapsAtom)[key];
  const latest = useRef<Record<string, number>>({}); // the newest run of each mask's taps: only it places its area
  const ran = useRef(new Map<string, Taps>()); // the taps each mask last ran with: coming back to a mask is no new tap

  useEffect(() => {
    if (!taps || ran.current.get(key) === taps) return;
    ran.current.set(key, taps);
    const run = (latest.current[key] = (latest.current[key] ?? 0) + 1);
    const newest = () => run === latest.current[key];
    const set = (area: ImageBitmap | null) =>
      store.set(masksAtom, (m) => ({ ...m, [key]: placed(m[key] ?? [], taps.op, area) }));
    const yes = taps.points.filter((p) => !p.not);
    if (!yes.length) {
      set(null); // only "not this" points, or none left: nothing is marked
      return;
    }
    const pts = (not: boolean) =>
      taps.points
        .filter((p) => p.not === not)
        .map((p) => ({ x: px(p.at[0], render.width), y: px(p.at[1], render.height) }));
    const look = tapping(key);
    setStage(look, "queued");
    void (async () => {
      try {
        const b64 = await lookAt(
          space,
          render.id,
          (t, image) => api.mask(t.wire, image, "", { positive: pts(false), negative: pts(true) }),
          (stage) => newest() && setStage(look, stage),
        );
        if (!newest()) return;
        const area = await areaOf(b64);
        if (!area) notify("Nothing found there; tap the middle of the thing, or paint it");
        set(area);
      } catch (e) {
        if (e instanceof Locked) lockApp();
        else if (newest()) notify(`Could not find what was tapped: ${errorText(e)}`, { bad: true });
      } finally {
        if (newest()) setStage(look, null);
      }
    })();
  }, [store, space, key, render.id, render.width, render.height, taps]);
}
