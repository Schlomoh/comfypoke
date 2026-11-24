// The open workspace's state as atoms. Each workspace gets a store of its own (WorkspaceProvider), so
// nothing of one can show in another, and closing it drops everything. What is stored on the device
// stays in IndexedDB (@/data/db); the atoms hold what is on screen and what it is derived from.
import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";

import type { Job } from "@/domain/job";
import { depthFirst, stacks, trail, visible } from "@/domain/lineage";
import { EMPTY, type Recipe } from "@/domain/recipe";
import type { Render } from "@/domain/render";
import { FIT, type View } from "@/domain/view";

export type Tab = "prompt" | "look" | "edit" | "library";
/** The layers over the studio; at most one at a time. */
export type Layer = "activity" | "renders" | "workspace" | "keys" | null;

export const recipeAtom = atom<Recipe>(EMPTY);
export const tabAtom = atom<Tab>("prompt");
/** On a phone, while the prompt or the look is written, the stage is a strip: the image small, a tap opens it, and its
 * buttons are the viewer's. A render on its way keeps its bar, to see it and cancel it. */
export const stripTab = (tab: Tab) => tab === "prompt" || tab === "look";
export const layerAtom = atom<Layer>(null);
/** The image or job on the stage; null shows the newest. */
export const focusAtom = atom<string | null>(null);
/** The image or job in the full-screen viewer; null when it is closed. */
export const viewerAtom = atom<string | null>(null);
export const infoAtom = atom(false); // the viewer's info panel
/** One zoom for the stage and the viewer, kept across images, so two seeds compare at the same spot. */
export const viewAtom = atom<View>(FIT);
export const characterFilterAtom = atom("");
export const bestOnlyAtom = atom(false);
/** The renders being picked among (features/pick); null when not picking. */
export const pickAtom = atom<string[] | null>(null);
/** Every image blanked to a plain tile, for working where others can see the screen. Kept across reloads. */
export const veilAtom = atomWithStorage("studio.veil", false, undefined, { getOnInit: true });

/** The workspace's renders, newest first; undefined while they are decrypted. Filled by useRendersSync. */
export const rendersAtom = atom<Render[] | undefined>(undefined);
export const jobsAtom = atom<Job[]>([]);

const allRendersAtom = atom((get) => get(rendersAtom) ?? []);

/** Jobs not yet in the library. A finished job stays until its render is listed, so the viewer goes from one to the other in place. */
export const liveJobsAtom = atom((get) => {
  const ids = new Set(get(allRendersAtom).map((r) => r.id));
  return get(jobsAtom).filter((j) => !(j.saved && ids.has(j.id)));
});

export const characterNamesAtom = atom((get) => [
  ...new Set(get(allRendersAtom).flatMap((r) => (r.characterName ? [r.characterName] : []))),
]);

/** The filter as applied: the last render of a character may be gone. */
const activeCharacterAtom = atom((get) => {
  const f = get(characterFilterAtom);
  return get(characterNamesAtom).includes(f) ? f : "";
});

const ofCharacterAtom = atom((get) => {
  const c = get(activeCharacterAtom);
  return get(allRendersAtom).filter((r) => !c || r.characterName === c);
});

/** What the library shows, in its order. */
export const shownAtom = atom((get) => {
  const best = get(bestOnlyAtom);
  return get(ofCharacterAtom).filter((r) => !best || r.best);
});
/** What the library shows as stacks (domain/lineage.ts): one tile per image and everything made from it. */
export const stacksAtom = atom((get) => stacks(get(shownAtom)));
/** Batches showing the stacks picked over in them, which otherwise fold away. */
export const unfoldedAtom = atom<ReadonlySet<string>>(new Set<string>());
/** The stacks on screen: picked-over ones in a folded batch are not. Browsing and "select all" go by these. */
export const visibleStacksAtom = atom((get) => visible(get(stacksAtom), get(unfoldedAtom)));
/** Each shown image's stack, depth first, by id: where stepping goes on from an image left out of its trail. */
export const orderOfAtom = atom(
  (get) =>
    new Map(
      get(stacksAtom).flatMap((s) => {
        const ids = depthFirst(s).map((m) => m.id);
        return ids.map((id) => [id, ids]);
      }),
    ),
);
export const bestCountAtom = atom((get) => get(ofCharacterAtom).filter((r) => r.best).length);
export const libraryFilterAtom = atom((get) => ({
  character: get(activeCharacterAtom),
  best: get(bestOnlyAtom),
}));

/** What the stage shows: the focused job, else the focused render, else the newest of either. */
export const stageAtom = atom((get) => {
  const focus = get(focusAtom);
  const live = get(liveJobsAtom);
  const all = get(allRendersAtom);
  const job = focus ? live.find((j) => j.id === focus) : live[0];
  if (job) return { job, render: undefined };
  return { job: undefined, render: all.find((r) => r.id === focus) ?? all[0] };
});

/** What the viewer shows: always the stored version of a render (Best changes it), or a job in flight. */
export const viewerItemAtom = atom((get) => {
  const id = get(viewerAtom);
  if (!id) return { render: null, job: null };
  const render = get(allRendersAtom).find((r) => r.id === id) ?? null;
  const job = render ? null : (get(liveJobsAtom).find((j) => j.id === id) ?? null);
  return { render, job };
});

/** Where keyboard browsing starts: the viewer's item, else the stage's. */
export const cursorAtom = atom((get) => {
  const { render, job } = get(viewerItemAtom);
  const stage = get(stageAtom);
  return (render ?? job ?? stage.job ?? stage.render)?.id ?? null;
});

/** Queue and library in the order the library lists them, for stepping through with arrows and swipes: the jobs in
 * flight, then each stack's trail (domain/lineage.ts: all of it depth first, or only its bests). */
export const sequenceAtom = atom((get) => [
  ...get(liveJobsAtom).map((j) => j.id),
  ...get(visibleStacksAtom).flatMap((s) => trail(s).map((m) => m.id)),
]);
