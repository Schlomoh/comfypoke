// What every layer over the page shares: the page held still underneath, and which layer is on top.
let locks = 0;
/**
 * Holds the page still and returns the release. A modal dialog does not stop the page under it from
 * scrolling, and on iOS a page that moved under a fixed layer leaves taps landing away from where the
 * layer is drawn. Only html is locked: overflow on body would make it a scroll container of its own,
 * and the sticky bars inside it would jump.
 */
export function lockPage() {
  locks++;
  document.documentElement.classList.add("locked");
  return () => {
    if (--locks === 0) document.documentElement.classList.remove("locked");
  };
}

const stack: HTMLDialogElement[] = [];
const watchers = new Set<() => void>();

/** The layer on top, or none. A toast is drawn inside it: everything outside a modal dialog is inert. */
export const topLayer = (): HTMLDialogElement | undefined => stack.at(-1);

/** Puts a layer on top until the returned function takes it off. */
export function pushLayer(d: HTMLDialogElement) {
  stack.push(d);
  for (const w of watchers) w();
  return () => {
    stack.splice(stack.indexOf(d), 1);
    for (const w of watchers) w();
  };
}

/** Called whenever a layer opens or closes: a toast raised as a sheet closed moves to what is on top now. */
export function watchLayers(fn: () => void) {
  watchers.add(fn);
  return () => void watchers.delete(fn);
}
