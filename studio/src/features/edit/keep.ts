// The Edit tab's work kept on the device (data/db/edits.ts): an image's masks, people and fitted bodies are read the
// first time it comes on the stage and written back once they settle, and the tab's choices go with the workspace. A
// reload, or the workspace opened again, finds them as they were left.
import { atom, useStore } from "jotai";
import { useEffect } from "react";

import { toBase64 } from "@/data/crypto";
import { loadEdit, saveEdit } from "@/data/db/edits";
import { useSpace } from "@/data/db/space";
import { pngBlob, type Op } from "@/features/edit/mask";
import { bodiesAtom, peopleAtom, type PersonRow } from "@/features/edit/people/state";
import { editAtom, isPersonKey, masksAtom, type EditChoice } from "@/features/edit/state";
import { stageAtom, tabAtom } from "@/state/studio";
import { notify } from "@/ui/notify";

/** Images whose kept edit has been read, which happens in the Edit tab. People looks for faces by itself only on these,
 * so a reload never pays for faces it already has, and browsing other tabs never pays at all. */
export const keptAtom = atom<ReadonlySet<string>>(new Set<string>());

type KeptOp = Exclude<Op, { kind: "found" }> | { kind: "found"; id: string; text: string; png: string };
type Kept = { masks: Record<string, KeptOp[]>; people?: PersonRow[]; bodies: Record<string, string> };
type Work = {
  masks: Readonly<Record<string, Op[]>>;
  people: Readonly<Record<string, PersonRow[]>>;
  bodies: Readonly<Record<string, string>>;
};

const SETTLE_MS = 500;

/** The image a mask key belongs to: its own key, or `<id>:<face>`. */
const imageOf = (key: string) => key.split(":")[0];
const ofImage = <T>(all: Readonly<Record<string, T>>, id: string) =>
  Object.entries(all).filter(([k]) => k === id || isPersonKey(k, id));

// a found area stays the same bitmap until it is found again: encoded once
const encoded = new WeakMap<ImageBitmap, Promise<string>>();
function png(area: ImageBitmap) {
  let p = encoded.get(area);
  if (!p) {
    const canvas = new OffscreenCanvas(area.width, area.height);
    canvas.getContext("2d")?.drawImage(area, 0, 0);
    p = canvas
      .convertToBlob({ type: "image/png" })
      .then(async (b) => toBase64(new Uint8Array(await b.arrayBuffer())));
    encoded.set(area, p);
  }
  return p;
}

const keptOp = async (op: Op): Promise<KeptOp> =>
  op.kind === "found" ? { kind: "found", id: op.id, text: op.text, png: await png(op.area) } : op;
/** A kept step as the mask takes it; null for an area that no longer opens, so the rest are still had. */
async function opOf(op: KeptOp): Promise<Op | null> {
  if (op.kind !== "found") return op;
  try {
    const area = await createImageBitmap(await pngBlob(op.png));
    encoded.set(area, Promise.resolve(op.png)); // written again as it came
    return { kind: "found", id: op.id, text: op.text, area };
  } catch {
    return null;
  }
}

async function keptOf(work: Work, id: string): Promise<Kept | undefined> {
  const masks = ofImage(work.masks, id).filter(([, ops]) => ops.length);
  const bodies = Object.fromEntries(ofImage(work.bodies, id));
  const people = work.people[id];
  if (!masks.length && !people && !Object.keys(bodies).length) return undefined;
  const kept = await Promise.all(
    masks.map(async ([k, ops]) => [k, await Promise.all(ops.map(keptOp))] as const),
  );
  return { masks: Object.fromEntries(kept), people, bodies };
}

/** Mounted once, by the studio. */
export function useKeepEdits() {
  const store = useStore();
  const space = useSpace();
  useEffect(() => {
    let live = true;
    let writes = Promise.resolve(); // one after another, so an older edit never lands over a newer one
    const work = (): Work => ({
      masks: store.get(masksAtom),
      people: store.get(peopleAtom),
      bodies: store.get(bodiesAtom),
    });
    // what is on the device, entry by entry: only images whose entries differ are written again
    const saved = {
      masks: { ...store.get(masksAtom) },
      people: { ...store.get(peopleAtom) },
      bodies: { ...store.get(bodiesAtom) },
    };
    const startChoice = store.get(editAtom);
    let savedChoice: EditChoice | null = startChoice; // null: not on the device as it is

    const changed = () => {
      const now = work();
      const ids = new Set<string>();
      const diff = <T>(a: Readonly<Record<string, T>>, b: Record<string, T>, id: (k: string) => string) => {
        for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) if (a[k] !== b[k]) ids.add(id(k));
      };
      diff(now.masks, saved.masks, imageOf);
      diff(now.bodies, saved.bodies, imageOf);
      diff(now.people, saved.people, (k) => k);
      return { now, ids };
    };

    /** Marks an image's entries as on the device as they are in `now`. */
    const settle = (id: string, now: Work) => {
      for (const part of ["masks", "bodies"] as const) {
        const kept: Record<string, unknown> = saved[part];
        for (const k of Object.keys(kept)) if (k === id || isPersonKey(k, id)) delete kept[k];
        for (const [k, v] of ofImage<unknown>(now[part], id)) kept[k] = v;
      }
      if (now.people[id]) saved.people[id] = now.people[id];
      else delete saved.people[id];
    };

    /** Queues a write. One that fails is tried again with the next change, and said once. */
    let failed = false;
    const forget = (id: string) => {
      if (id === space.id) savedChoice = null;
      else
        for (const part of ["masks", "bodies", "people"] as const)
          for (const k of Object.keys(saved[part])) if (imageOf(k) === id) delete saved[part][k];
    };
    const put = async (id: string, value: () => Promise<unknown>) => {
      try {
        await saveEdit(space, id, await value());
        failed = false;
      } catch {
        forget(id);
        if (!failed) notify("This edit could not be kept on the device: is its storage full?", { bad: true });
        failed = true;
      }
    };
    const write = (id: string, value: () => Promise<unknown>) => {
      writes = writes.then(() => put(id, value));
    };

    let timer: number | undefined;
    const flush = () => {
      clearTimeout(timer);
      const { now, ids } = changed();
      const read = store.get(keptAtom);
      for (const id of ids) {
        if (!read.has(id)) continue; // still being read: written once it is, or what is kept would be lost
        settle(id, now);
        write(id, () => keptOf(now, id));
      }
      const choice = store.get(editAtom);
      if (choice !== savedChoice) {
        savedChoice = choice;
        write(space.id, async () => choice);
      }
    };
    const later = () => {
      clearTimeout(timer);
      timer = window.setTimeout(flush, SETTLE_MS);
    };

    const asked = new Set<string>(); // read once, whatever comes of it
    const read = async (id: string) => {
      if (asked.has(id)) return;
      asked.add(id);
      const kept = (await loadEdit(space, id).catch(() => undefined)) as Kept | undefined;
      if (!live) return;
      if (!kept) return done(id);
      const masks = await Promise.all(
        Object.entries(kept.masks).map(
          async ([k, ops]) => [k, (await Promise.all(ops.map(opOf))).filter((o) => o !== null)] as const,
        ),
      );
      if (!live) return;
      // only what the image has none of yet: work done while it was read wins, and faces found meanwhile are
      // numbered afresh, so the kept people's masks and bodies would land on the wrong ones
      const refound = !!store.get(peopleAtom)[id];
      const wanted = (k: string, now: Readonly<Record<string, unknown>>) =>
        !(k in now) && !(refound && isPersonKey(k, id));
      const masksNow = store.get(masksAtom);
      const bodiesNow = store.get(bodiesAtom);
      const addMasks = masks.filter(([k]) => wanted(k, masksNow));
      const addBodies = Object.entries(kept.bodies).filter(([k]) => wanted(k, bodiesNow));
      for (const [k, v] of addMasks) saved.masks[k] = v;
      for (const [k, v] of addBodies) saved.bodies[k] = v;
      if (addMasks.length) store.set(masksAtom, (m) => ({ ...m, ...Object.fromEntries(addMasks) }));
      if (addBodies.length) store.set(bodiesAtom, (b) => ({ ...b, ...Object.fromEntries(addBodies) }));
      const people = kept.people;
      if (people && !store.get(peopleAtom)[id]) {
        saved.people[id] = people;
        store.set(peopleAtom, (all) => ({ ...all, [id]: people }));
      }
      done(id);
    };
    const done = (id: string) => {
      store.set(keptAtom, (s) => new Set(s).add(id));
      later(); // anything done to it while it was read
    };

    void (async () => {
      const kept = await loadEdit(space, space.id).catch(() => undefined);
      // the choices as last left, over today's defaults, unless they were changed already
      if (!live || !kept || store.get(editAtom) !== startChoice) return;
      savedChoice = { ...startChoice, ...(kept as Partial<EditChoice>) };
      store.set(editAtom, savedChoice);
    })();
    // read in the Edit tab only: browsing elsewhere neither fills memory with masks nor lets People look for faces
    const onStage = () => {
      const id = store.get(stageAtom).render?.id;
      if (id && store.get(tabAtom) === "edit") void read(id);
    };
    onStage();
    const stops = [
      store.sub(stageAtom, onStage),
      store.sub(tabAtom, onStage),
      store.sub(masksAtom, later),
      store.sub(peopleAtom, later),
      store.sub(bodiesAtom, later),
      store.sub(editAtom, later),
    ];
    window.addEventListener("pagehide", flush);
    return () => {
      live = false;
      for (const stop of stops) stop();
      window.removeEventListener("pagehide", flush);
      flush(); // closing the workspace right after an edit
    };
  }, [store, space]);
}
