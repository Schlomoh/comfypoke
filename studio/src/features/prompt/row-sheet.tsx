// One sheet per row: its phrases to edit in the body, and the picker that adds in the footer under it.
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { usePresets } from "@/data/db/presets";
import { nameOf, ownerOf, phrasesOf, rowDef, rowLens } from "@/domain/cast";
import { PhraseCard } from "@/features/prompt/phrase-card";
import { RowPicker } from "@/features/prompt/row-picker";
import { openAtom } from "@/features/prompt/state";
import { useClearEmptied } from "@/features/prompt/use-clear-emptied";
import { recipeAtom } from "@/state/studio";
import { Sheet } from "@/ui/modal";
import { Note } from "@/ui/text";

export function RowSheet() {
  const [open, setOpen] = useAtom(openAtom);
  const recipe = useAtomValue(recipeAtom);
  const presets = usePresets(); // read here, always mounted: the picker opens with Yours already there
  const clearEmptied = useClearEmptied();
  const setTarget = useSetAtom(openAtom);

  const at = open?.kind === "row" ? open : null;
  const shown = at && ownerOf(recipe, at.key) ? at : null;
  const close = () => {
    if (at) clearEmptied(rowLens(at));
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
          <RowPicker
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
            lens={rowLens(shown)}
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
