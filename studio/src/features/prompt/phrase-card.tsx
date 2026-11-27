// One phrase in its row's sheet, on one line: on or off, its text, how many versions, ×. Its versions open under it
// on a tap of that count, with the switch that sends the picker below to add more; a phrase without any goes
// straight to adding them.
import { useAtom, useSetAtom } from "jotai";
import { useState, type ReactNode } from "react";

import { insertAt, type Lens } from "@/domain/cast";
import type { Phrase } from "@/domain/recipe";
import { sameText } from "@/domain/versions";
import { emptiedAtom } from "@/features/prompt/state";
import { useTapGuard } from "@/features/prompt/use-tap-guard";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow, Tag } from "@/ui/chip";
import { cn } from "@/ui/cn";
import { LineArea } from "@/ui/field";
import { notify } from "@/ui/notify";
import type { useReorder } from "@/ui/reorder";

type Reorder = ReturnType<typeof useReorder>;

function countLabel(p: Phrase, shown: boolean) {
  if (!p.versions.length) return "+ version";
  return `${p.versions.length} more ${shown ? "▴" : "▾"}`;
}

export function PhraseCard<T extends Phrase>({
  lens,
  phrase: p,
  index,
  picked,
  onPick,
  drag,
  children,
}: {
  /** A handle to drag it by, in a list of more than one: the prompt follows the order. */
  drag?: { handle: Reorder["handle"]; row: ReturnType<Reorder["row"]> };
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
  const [open, setOpen] = useState(false);
  const shown = picked || (open && p.versions.length > 0);
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

  const dropVersion = (v: string, i: number) => {
    change((x) => ({ ...x, versions: x.versions.filter((y) => y !== v) }));
    notify(`Removed the version “${v}”`, {
      action: {
        label: "Undo",
        run: () =>
          change((x) => (x.versions.includes(v) ? x : { ...x, versions: insertAt(x.versions, i, v) })),
      },
    });
  };
  const removeVersion = guard(dropVersion);

  // emptied, it goes as the × takes it; a text the phrase already says is refused
  const saveVersion = (v: string, i: number, text: string) => {
    const t = text.trim();
    if (t === v) return;
    if (!t) return dropVersion(v, i); // unguarded: a tap that ended the edit may be a × that follows
    const others = [p.t, ...p.versions.filter((_, j) => j !== i)];
    if (others.some((x) => sameText(x, t))) {
      notify(`This phrase already has “${t}”`);
      return;
    }
    change((x) => ({ ...x, versions: x.versions.map((y) => (y === v ? t : y)) }));
  };

  const toggle = () => {
    if (!p.versions.length) return onPick(picked ? null : p.id);
    if (shown && picked) onPick(null);
    setOpen(!shown);
  };

  return (
    <div
      id={`card-${p.id}`}
      {...drag?.row}
      className={cn(
        "shrink-0 border-l-2 bg-bg data-dragging:relative data-dragging:z-10 data-dragging:shadow-lg",
        picked ? "border-l-accent" : "border-l-transparent",
      )}
    >
      {children}
      <div className="flex items-start">
        {drag && (
          <span
            {...drag.handle}
            data-index={index}
            aria-hidden
            title="Drag to move: the prompt says them in this order"
            className="grid h-11 w-6 shrink-0 place-items-center text-faint select-none fine:h-8"
          >
            ⋮⋮
          </span>
        )}
        <Checkbox
          on={p.on}
          onChange={(on) => change((x) => ({ ...x, on }))}
          title={p.on ? "In the prompt; tap to leave it out" : "Left out; tap to use it"}
        />
        <LineArea
          bare
          value={p.t}
          onText={(t) => {
            if (!t.trim() && p.t.trim()) setEmptied((m) => new Map(m).set(p.id, p.t));
            change((x) => ({ ...x, t }));
          }}
          aria-label="Phrase"
          placeholder="empty: removed when the sheet closes"
          className={cn("min-w-0 flex-1 fine:min-h-8 fine:py-1.5", !p.on && "text-faint line-through")}
        />
        <Button
          variant="text"
          size="inline"
          onClick={toggle}
          aria-expanded={p.versions.length ? shown : undefined}
          aria-pressed={picked}
          className={cn(picked && "text-accent aria-pressed:text-accent")}
          title={
            p.versions.length
              ? `${p.versions.length} more version${p.versions.length === 1 ? "" : "s"}: one render each`
              : "Add versions to compare: one render each"
          }
        >
          {countLabel(p, shown)}
        </Button>
        <Button variant="icon" size="square" onClick={remove} aria-label={`Remove ${p.t}`}>
          ×
        </Button>
      </div>
      {shown && (
        <ChipRow className="pr-2 pb-2 pl-11">
          {p.versions.map((v, i) => (
            <Tag
              key={v}
              onRemove={() => removeVersion(v, i)}
              removeLabel={`Remove the version ${v}`}
              edit={{ value: v, label: "Version", onSave: (t) => saveVersion(v, i, t) }}
            >
              or {v}
            </Tag>
          ))}
          <Chip
            tone={picked ? "warn" : "add"}
            onClick={() => onPick(picked ? null : p.id)}
            aria-pressed={picked}
          >
            {picked ? "adding versions below" : "+ version"}
          </Chip>
        </ChipRow>
      )}
    </div>
  );
}
