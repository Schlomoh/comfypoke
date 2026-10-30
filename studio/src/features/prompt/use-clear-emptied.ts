// Closing a sheet drops the phrases emptied in it, with an Undo for any that had something to lose.
import { useStore } from "jotai";

import { insertAt, type Lens } from "@/domain/cast";
import type { Phrase } from "@/domain/recipe";
import { emptiedAtom } from "@/features/prompt/state";
import { recipeAtom } from "@/state/studio";
import { notify } from "@/ui/notify";

const versions = (n: number) => `${n} version${n === 1 ? "" : "s"}`;

/** A phrase emptied while the sheet was open stays put, so nothing moves under a finger; closing clears it. */
export function useClearEmptied() {
  const store = useStore();
  return <T extends Phrase>(lens: Lens<T>) => {
    const before = lens.get(store.get(recipeAtom));
    const emptied = before.map((p, i) => [p, i] as const).filter(([p]) => !p.t.trim());
    const texts = store.get(emptiedAtom);
    store.set(emptiedAtom, new Map());
    if (!emptied.length) return;
    store.set(recipeAtom, (r) => lens.edit(r, (xs) => xs.filter((p) => p.t.trim())));
    // only one with versions or a text it had is worth an Undo, which brings it back as it was before emptied
    const lost = emptied.flatMap(([p, i]) => {
      const t = texts.get(p.id);
      return t || p.versions.length ? [[{ ...p, t: t ?? p.versions[0] }, i] as const] : [];
    });
    if (!lost.length) return;
    const putBack = (xs: T[]) =>
      lost.reduce((acc, [p, i]) => (acc.some((x) => x.id === p.id) ? acc : insertAt(acc, i, p)), xs);
    const [[first]] = lost;
    const extra = first.versions.length ? ` and its ${versions(first.versions.length)}` : "";
    notify(
      lost.length > 1 ? `Removed ${lost.length} emptied phrases` : `Removed the emptied “${first.t}”${extra}`,
      {
        action: { label: "Undo", run: () => store.set(recipeAtom, (r) => lens.edit(r, putBack)) },
      },
    );
  };
}
