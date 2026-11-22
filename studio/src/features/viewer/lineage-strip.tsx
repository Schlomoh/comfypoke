// Under the image in the viewer: where it came from and what was made from it, as small tiles. A tap goes there;
// A ⑂ marks where the lineage splits: more than one image was made from that one. Edit, Reuse and the rest then work
// from any step.
import { useAtomValue, useSetAtom } from "jotai";

import { useThumb } from "@/data/db/renders";
import { kindOf, lineage } from "@/domain/lineage";
import type { Render } from "@/domain/render";
import { useImageActions } from "@/state/actions";
import { pickAtom, rendersAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";

/** `branches`: how many images were made from this one; more than one is where the lineage splits. */
function Step({
  r,
  current,
  branches = 0,
  onOpen,
}: {
  r: Render;
  current: boolean;
  branches?: number;
  onOpen: () => void;
}) {
  const url = useThumb(r.id);
  return (
    <Pressable
      onClick={onOpen}
      aria-current={current}
      title={`${kindOf(r) ?? "render"}${branches > 1 ? `, ${branches} made from it` : ""}`}
      className={cn(
        "relative size-12 shrink-0 border bg-panel",
        current ? "border-ink" : "border-line opacity-80",
      )}
    >
      {url && <img src={url} alt="" className="size-full object-cover" />}
      {branches > 1 && (
        <span className="absolute top-0 right-0 bg-warn px-0.5 font-mono text-[9px] leading-3 text-bg">
          ⑂{branches}
        </span>
      )}
      <span className="absolute inset-x-0 bottom-0 truncate bg-bg/80 px-0.5 font-mono text-[9px] leading-3 text-ink">
        {kindOf(r) ?? "render"}
      </span>
    </Pressable>
  );
}

export function LineageStrip({ render }: { render: Render }) {
  const all = useAtomValue(rendersAtom) ?? [];
  const { open } = useImageActions();
  const setPick = useSetAtom(pickAtom);
  const { chain, children, cut } = lineage(all, render.id);
  const batch = render.batch ? all.filter((r) => r.batch === render.batch) : [];
  if (chain.length < 2 && !children.length && batch.length < 2) return null;
  return (
    <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto border-t border-line px-3 py-2">
      {cut && <span className="shrink-0 font-mono text-[10px] text-faint">…</span>}
      {chain.map((r, i) => (
        <div key={r.id} className="flex shrink-0 items-center gap-1.5">
          {i > 0 && (
            <span className="text-faint" aria-hidden>
              →
            </span>
          )}
          <Step
            r={r}
            current={r.id === render.id}
            branches={all.filter((x) => x.source === r.id).length}
            onOpen={() => open(r.id)}
          />
        </div>
      ))}
      {children.length > 0 && (
        <span className="shrink-0 text-faint" aria-hidden>
          ⇉
        </span>
      )}
      {children.map((r) => (
        <Step key={r.id} r={r} current={false} onOpen={() => open(r.id)} />
      ))}
      {batch.length > 1 && (
        <Button
          variant="text"
          size="inline"
          className="ml-auto shrink-0"
          title="Pick the best of the renders sent with this one, two at a time"
          onClick={() => setPick(batch.map((r) => r.id))}
        >
          pick of {batch.length}
        </Button>
      )}
    </div>
  );
}
