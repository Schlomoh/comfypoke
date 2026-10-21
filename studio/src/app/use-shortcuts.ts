// The keyboard: arrows and J/K browse, F opens, I shows info, Z and +/−/0 zoom, B marks best, U
// upscales, S saves, R reuses, Delete deletes, H hides every image, ⌘↵ generates, ? lists them all.
// Every key reads the store as it is at that moment, so a held arrow never acts on a stale image.
import { useStore } from "jotai";
import { useEffect, useRef } from "react";

import { wide } from "@/app/platform";
import { toggleBest } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { FIT } from "@/domain/view";
import { saveImage } from "@/features/library/files";
import { useImageActions } from "@/state/actions";
import {
  cursorAtom,
  infoAtom,
  layerAtom,
  shownAtom,
  stageAtom,
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
      const { submit: send, actions: act } = latest.current;
      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) return send();
      if (typingIn(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") return store.set(layerAtom, "keys");
      if ((e.key === "Enter" || e.key === " ") && onControl(e.target)) return; // activates what has focus
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const go = (n: number) => act.step(n) && e.preventDefault();
      const view = store.get(viewAtom);
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
      else if (k === "s") void saveImage(space, cur);
      else if (k === "b") void toggleBest(space, cur);
      else if (k === "u") void act.upscaleMany([cur]);
      else if (k === "Delete" || k === "Backspace") {
        e.preventDefault();
        void act.remove(cur);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [store, space]);
}
