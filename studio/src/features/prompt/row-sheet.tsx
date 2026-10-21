// One sheet per row: its phrases to edit in the body, and the picker that adds in the footer under it.
import { useAtom, useAtomValue, useSetAtom, useStore } from "jotai";

import { usePresets } from "@/data/db/presets";
import { editRow, insertAt, nameOf, ownerOf, phrasesOf, rowDef, type RowRef } from "@/domain/cast";
import type { Phrase } from "@/domain/recipe";
import { PhraseCard } from "@/features/prompt/phrase-card";
import { PresetPicker } from "@/features/prompt/preset-picker";
import { emptiedAtom, openAtom } from "@/features/prompt/state";
import { recipeAtom } from "@/state/studio";
import { Sheet } from "@/ui/modal";
import { notify } from "@/ui/notify";
import { Note } from "@/ui/text";

const versions = (n: number) => `${n} version${n === 1 ? "" : "s"}`;

/** A phrase emptied while the sheet was open stays put, so nothing moves under a finger; closing clears it. */
function useClearEmptied() {
  const store = useStore();
  return (at: RowRef) => {
    const before = phrasesOf(store.get(recipeAtom), at);
    const emptied = before.map((p, i) => [p, i] as const).filter(([p]) => !p.t.trim());
    const texts = store.get(emptiedAtom);
    store.set(emptiedAtom, new Map());
    if (!emptied.length) return;
    store.set(recipeAtom, (r) => editRow(r, at, (xs) => xs.filter((p) => p.t.trim())));
    // only one with versions or a text it had is worth an Undo, which brings it back as it was before emptied
    const lost = emptied.flatMap(([p, i]) => {
      const t = texts.get(p.id);
      return t || p.versions.length ? [[{ ...p, t: t ?? p.versions[0] }, i] as const] : [];
    });
    if (!lost.length) return;
    const putBack = (xs: Phrase[]) =>
      lost.reduce((acc, [p, i]) => (acc.some((x) => x.id === p.id) ? acc : insertAt(acc, i, p)), xs);
    const [[first]] = lost;
    const extra = first.versions.length ? ` and its ${versions(first.versions.length)}` : "";
    notify(
      lost.length > 1 ? `Removed ${lost.length} emptied phrases` : `Removed the emptied “${first.t}”${extra}`,
      {
        action: { label: "Undo", run: () => store.set(recipeAtom, (r) => editRow(r, at, putBack)) },
      },
    );
  };
}

export function RowSheet() {
  const [open, setOpen] = useAtom(openAtom);
  const recipe = useAtomValue(recipeAtom);
  const presets = usePresets(); // read here, always mounted: the picker opens with Yours already there
  const clearEmptied = useClearEmptied();
  const setTarget = useSetAtom(openAtom);

  const at = open?.kind === "row" ? open : null;
  const shown = at && ownerOf(recipe, at.key) ? at : null;
  const close = () => {
    if (at) clearEmptied(at);
    setOpen(null);
  };
  const onTarget = (target: string | null) => setTarget((o) => (o?.kind === "row" ? { ...o, target } : o));

  const phrases = shown ? phrasesOf(recipe, shown) : [];
  const target = phrases.find((p) => p.id === shown?.target);
  const def = shown ? rowDef(shown.row) : null;

  return (
    <Sheet
      open={!!shown}
      onClose={close}
      title={shown && def ? `${nameOf(recipe, shown.key)} · ${def.label}` : ""}
      footer={
        shown &&
        presets && (
          <PresetPicker
            key={`${shown.key}:${shown.row}`}
            at={shown}
            phrases={phrases}
            target={target}
            presets={presets}
            onTarget={onTarget}
          />
        )
      }
    >
      {shown && def && phrases.length === 0 && (
        <Note>Nothing in {def.label} yet. Pick from below or type one.</Note>
      )}
      {shown &&
        phrases.map((p, i) => (
          <PhraseCard
            key={p.id}
            at={shown}
            phrase={p}
            index={i}
            picked={p.id === shown.target}
            onPick={onTarget}
          />
        ))}
      {phrases.some((p) => p.versions.length) && (
        <Note>Each version is a separate render with the same seed; nothing else changes between them.</Note>
      )}
    </Sheet>
  );
}
