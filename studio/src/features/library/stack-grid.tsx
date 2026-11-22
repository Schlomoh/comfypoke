// The library's images as ideas: one tile per image and everything made from it (a stack, domain/lineage.ts), its
// cover the one marked best, else the newest. A count on a tile opens its stack as a row under it, each step labeled.
// Stacks from one Generate sit together under a quiet header with Pick; the ones picked over fold away.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { Fragment, useState } from "react";

import { groups, pickedOver, type Stack } from "@/domain/lineage";
import type { Render } from "@/domain/render";
import { Thumb } from "@/features/library/thumb";
import { pickAtom, stacksAtom, unfoldedAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

type Props = {
  focus: string | null;
  picked: Set<string> | null; // null: not selecting
  onSelect: (r: Render) => void; // show it, or toggle it while selecting
};

const label = (r: Render) => r.title ?? (r.prompt.length > 60 ? `${r.prompt.slice(0, 60)}…` : r.prompt);

function StackTile({
  stack,
  open,
  onOpen,
  ...p
}: Props & { stack: Stack; open: boolean; onOpen: () => void }) {
  const many = stack.members.length > 1;
  const inside = p.picked ? stack.members.filter((m) => p.picked?.has(m.id)) : [];
  return (
    // the layered edge: more than one image under this one
    <div
      className={cn(
        "relative",
        many && "shadow-[3px_-3px_0_-1px_var(--color-panel),3px_-3px_0_0_var(--color-edge)]",
      )}
    >
      <Thumb
        render={stack.cover}
        active={stack.members.some((m) => m.id === p.focus)}
        // ticked when any of its images is: one picked inside a closed stack still shows
        selected={p.picked ? inside.length > 0 : undefined}
        // while selecting, a ticked tile clears all of its images rather than adding the cover beside them
        onSelect={() => (inside.length ? inside.forEach(p.onSelect) : p.onSelect(stack.cover))}
      />
      {many && (
        <Pressable
          onClick={onOpen}
          aria-expanded={open}
          aria-label={`${open ? "Close" : "Open"} its stack of ${stack.members.length}`}
          className={cn(
            "absolute right-0 bottom-0 grid min-h-8 min-w-8 place-items-center px-1.5 font-mono text-[11px]",
            open ? "bg-ink text-bg" : "bg-bg/85 text-ink",
          )}
        >
          {stack.members.length}
        </Pressable>
      )}
    </div>
  );
}

/** A stack opened: its images in the order they were made, each labeled with what it is. */
function StackRow({ stack, ...p }: Props & { stack: Stack }) {
  return (
    <div className="col-span-full flex gap-2 overflow-x-auto bg-raised p-2">
      {stack.members.map((m) => (
        <div key={m.id} className="w-20 shrink-0">
          <Thumb
            render={m}
            active={m.id === p.focus}
            selected={p.picked ? p.picked.has(m.id) : undefined}
            onSelect={p.onSelect}
          />
        </div>
      ))}
    </div>
  );
}

export function StackGrid(p: Props) {
  const all = useAtomValue(stacksAtom);
  const setPick = useSetAtom(pickAtom);
  const [open, setOpen] = useState<string | null>(null); // the opened stack, by its root
  const [unfolded, setUnfolded] = useAtom(unfoldedAtom);

  return groups(all).map((g, gi) => {
    const many = g.batch !== undefined && g.stacks.length > 1;
    const showAll = !!g.batch && unfolded.has(g.batch);
    const shown = many && !showAll ? g.stacks.filter((s) => !pickedOver(s)) : g.stacks;
    const folded = g.stacks.length - shown.length;
    const live = g.stacks.filter((s) => !pickedOver(s));
    return (
      <Fragment key={g.batch ?? g.stacks[0].root.id}>
        {many && (
          <div
            className={cn(
              "col-span-full flex min-w-0 items-center gap-2 bg-bg px-3 py-1.5 font-mono text-[11px] text-muted",
              gi > 0 && "mt-px",
            )}
          >
            <span className="min-w-0 flex-1 truncate" title={g.stacks[0].root.prompt}>
              {label(g.stacks[0].root)}
            </span>
            <span className="shrink-0 tabular-nums">{g.stacks.length}</span>
            {live.length > 1 && !p.picked && (
              <Button
                variant="text"
                size="inline"
                title="Pick the best of these, two at a time"
                onClick={() => setPick(live.map((s) => s.cover.id))}
              >
                Pick
              </Button>
            )}
          </div>
        )}
        {shown.map((s) => (
          <Fragment key={s.root.id}>
            <StackTile
              {...p}
              stack={s}
              open={open === s.root.id}
              onOpen={() => setOpen(open === s.root.id ? null : s.root.id)}
            />
            {open === s.root.id && <StackRow {...p} stack={s} />}
          </Fragment>
        ))}
        {(folded > 0 || showAll) && g.batch && (
          <Pressable
            onClick={() =>
              setUnfolded((u) => {
                const next = new Set(u);
                if (!next.delete(g.batch as string)) next.add(g.batch as string);
                return next;
              })
            }
            className="col-span-full bg-bg px-3 py-1.5 text-left font-mono text-[11px] text-faint hover:text-ink"
          >
            {showAll ? "hide the ones picked over" : `show ${folded} picked over`}
          </Pressable>
        )}
      </Fragment>
    );
  });
}
