// The keyboard: arrows and J/K browse, F opens, I shows info, Z and +/−/0 zoom, B marks best, U
// upscales, S saves, R reuses, E edits, Delete deletes, H hides every image, ⌘↵ generates (or sends the edit),
// ? lists them all. In the Edit tab X swaps brush and eraser, [ and ] size the brush, ⌘Z undoes a mask step.
// Every key reads the store as it is at that moment, so a held arrow never acts on a stale image.
import { useStore } from "jotai";
import { useEffect, useRef } from "react";

import { wide } from "@/app/platform";
import { toggleBest } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { FIT } from "@/domain/view";
import { BRUSH, brushAtom, masksAtom, toolAtom } from "@/features/edit/state";
import { saveImage } from "@/features/library/files";
import { useImageActions } from "@/state/actions";
import {
  cursorAtom,
  infoAtom,
  layerAtom,
  shownAtom,
  stageAtom,
  tabAtom,
  veilAtom,
  viewAtom,
  viewerAtom,
  viewerItemAtom,
} from "@/state/studio";

const typingIn = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest("input, textarea, select, [contenteditable]");
const onControl = (t: EventTarget | null) => t instanceof Element && !!t.closest("button, a");
const columns = () => {
  if (wide()) return 2;
  return matchMedia("(min-width: 640px)").matches ? 4 : 3;
};

export function useShortcuts(submit: () => void) {
  const store = useStore();
  const space = useSpace();
  const actions = useImageActions();
  // the handler is bound once; these change every render
  const latest = useRef({ submit, actions });
  useEffect(() => {
    latest.current = { submit, actions };
  });

  useEffect(() => {
    const zoom = (f: number) => {
      const v = store.get(viewAtom);
      store.set(viewAtom, { ...v, scale: Math.min(8, (v.scale ?? 1 / f) * f) }); // from fit, + goes to 1:1
    };
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector("dialog[open]:not([data-keys-through])")) return; // a layer over the studio: keys belong to it
      if (document.querySelector(":popover-open:not([role=tooltip])")) return; // so does an open menu
      const { submit: send, actions: act } = latest.current;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return send();
      const editing = store.get(tabAtom) === "edit" && !store.get(viewerAtom);
      const shown = store.get(stageAtom).render;
      if (
        editing &&
        shown &&
        e.key.toLowerCase() === "z" &&
        (e.metaKey || e.ctrlKey) &&
        !typingIn(e.target)
      ) {
        e.preventDefault();
        return store.set(masksAtom, (m) => ({ ...m, [shown.id]: (m[shown.id] ?? []).slice(0, -1) }));
      }
      if (typingIn(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") return store.set(layerAtom, "keys");
      if ((e.key === "Enter" || e.key === " ") && onControl(e.target)) return; // activates what has focus
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const go = (n: number) => act.step(n) && e.preventDefault();
      const view = store.get(viewAtom);
      const size = (f: number) =>
        store.set(brushAtom, Math.round(Math.min(BRUSH.max, Math.max(BRUSH.min, store.get(brushAtom) * f))));
      if (editing && k === "x")
        return store.set(toolAtom, store.get(toolAtom) === "eraser" ? "brush" : "eraser");
      if (editing && k === "[") return size(1 / 1.25);
      if (editing && k === "]") return size(1.25);
      switch (k) {
        case "ArrowRight":
        case "j":
          return void go(1);
        case "ArrowLeft":
        case "k":
          return void go(-1);
        case "ArrowDown":
          return void go(columns());
        case "ArrowUp":
          return void go(-columns());
        case "z":
          return store.set(viewAtom, view.scale == null ? { ...view, scale: 1 } : FIT);
        case "0":
          return store.set(viewAtom, FIT);
        case "h":
          return store.set(veilAtom, !store.get(veilAtom));
        case "=":
        case "+":
          return zoom(1.25);
        case "-":
          return view.scale == null ? undefined : zoom(0.8); // the zoom view turns anything below fit into fit
        default:
      }
      // the rest act on an image: the viewer's, or the stage's; none on a job
      const viewing = store.get(viewerItemAtom);
      if (viewing.job) return;
      const id = store.get(cursorAtom);
      const cur =
        store.get(shownAtom).find((r) => r.id === id) ?? viewing.render ?? store.get(stageAtom).render;
      if (!cur || (e.repeat && ["b", "s", "u", "Delete", "Backspace"].includes(k))) return; // a held key acts once
      const open = !!viewing.render;
      if ((k === "f" || k === "Enter") && !open) {
        e.preventDefault();
        store.set(viewerAtom, cur.id);
      } else if (k === "i") {
        store.set(infoAtom, open ? !store.get(infoAtom) : true);
        if (!open) store.set(viewerAtom, cur.id);
      } else if (k === "r") act.reuse(cur);
      else if (k === "e") act.edit(cur);
      else if (k === "s") void saveImage(space, cur);
      else if (k === "b") void toggleBest(space, cur);
      else if (k === "u") {
        // the same question a tap gets, from the Upscale button showing this image: the viewer's or the stage's
        const here = open ? "dialog[open] [data-upscale]" : "[data-upscale]";
        if (open || cur.id === store.get(stageAtom).render?.id)
          document.querySelector<HTMLButtonElement>(here)?.click();
      } else if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        void act.remove(cur);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, space]);
}
