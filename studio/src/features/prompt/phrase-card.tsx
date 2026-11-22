// One phrase in its row's sheet: on or off, its text, its versions, and the switch that sends the picker
// below to add versions of it.
import { useAtom, useSetAtom } from "jotai";
import type { ReactNode } from "react";

import { insertAt, type Lens } from "@/domain/cast";
import type { Phrase } from "@/domain/recipe";
import { emptiedAtom } from "@/features/prompt/state";
import { useTapGuard } from "@/features/prompt/use-tap-guard";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow, Tag } from "@/ui/chip";
import { cn } from "@/ui/cn";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";

function targetLabel(p: Phrase, picked: boolean) {
  if (picked) return "adding versions below";
  return p.versions.length ? "+ version" : "+ versions to compare";
}

export function PhraseCard<T extends Phrase>({
  lens,
  phrase: p,
  index,
  picked,
  onPick,
  children,
}: {
  lens: Lens<T>;
  phrase: T;
  index: number;
  picked: boolean;
  onPick: (target: string | null) => void;
  /** Above the text: who does it to whom, for an interaction. */
  children?: ReactNode;
}) {
  const setRecipe = useSetAtom(recipeAtom);
  const [emptied, setEmptied] = useAtom(emptiedAtom);
  const guard = useTapGuard();
  const edit = (c: (xs: T[]) => T[]) => setRecipe((r) => lens.edit(r, c));
  const change = (f: (p: T) => T) => edit((xs) => xs.map((x) => (x.id === p.id ? f(x) : x)));

  const remove = guard(() => {
    edit((xs) => xs.filter((x) => x.id !== p.id));
    if (picked) onPick(null);
    // an emptied phrase comes back with the text it had before
    const back = { ...p, t: p.t.trim() || emptied.get(p.id) || p.versions[0] || "" };
    if (!back.t) return; // nothing worth an Undo
    // Undo puts back this phrase alone, so edits made since stay
    notify(`Removed “${back.t}”`, {
      action: {
        label: "Undo",
        run: () => edit((xs) => (xs.some((x) => x.id === p.id) ? xs : insertAt(xs, index, back))),
      },
    });
  });

  const removeVersion = guard((v: string, i: number) => {
    change((x) => ({ ...x, versions: x.versions.filter((y) => y !== v) }));
    notify(`Removed the version “${v}”`, {
      action: {
        label: "Undo",
        run: () =>
          change((x) => (x.versions.includes(v) ? x : { ...x, versions: insertAt(x.versions, i, v) })),
      },
    });
  });

  return (
    <div id={`card-${p.id}`} className={cn("shrink-0 border bg-bg", picked ? "border-warn" : "border-line")}>
      {children}
      <div className="flex items-center">
        <Checkbox
          on={p.on}
          onChange={(on) => change((x) => ({ ...x, on }))}
          title={p.on ? "In the prompt; tap to leave it out" : "Left out; tap to use it"}
        />
        <Input
          bare
          value={p.t}
          onChange={(e) => {
            const t = e.target.value;
            if (!t.trim() && p.t.trim()) setEmptied((m) => new Map(m).set(p.id, p.t));
            change((x) => ({ ...x, t }));
          }}
          aria-label="Phrase"
          placeholder="empty: removed when the sheet closes"
          className={cn("flex-1 fine:h-9", !p.on && "text-faint line-through")}
        />
        <Button variant="icon" size="square" onClick={remove} aria-label={`Remove ${p.t}`}>
          ×
        </Button>
      </div>
      <ChipRow className="pr-2 pb-2 pl-11">
        {p.versions.map((v, i) => (
          <Tag key={v} onRemove={() => removeVersion(v, i)} removeLabel={`Remove the version ${v}`}>
            or {v}
          </Tag>
        ))}
        <Chip
          tone={picked ? "warn" : "add"}
          onClick={() => onPick(picked ? null : p.id)}
          aria-pressed={picked}
        >
          {targetLabel(p, picked)}
        </Chip>
      </ChipRow>
    </div>
  );
}
