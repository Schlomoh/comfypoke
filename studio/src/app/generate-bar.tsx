// The bar along the bottom: what Generate will send and what it costs (a tap opens each render), and
// Generate itself; in the Edit tab the same for the edit, whose button sends it.
import { useSetAtom } from "jotai";

import { MOD } from "@/app/platform";
import { duration } from "@/domain/format";
import type { EditAction } from "@/features/edit/use-edit";
import type { Generate } from "@/state/generate";
import { layerAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
import { Pressable } from "@/ui/pressable";
import { Note } from "@/ui/text";

type Action = Pick<Generate, "blocked" | "seconds" | "cost" | "booting" | "stopAfter">;

function Estimate({ g }: { g: Action }) {
  if (g.blocked) return <>{g.blocked}</>;
  return (
    <>
      {g.seconds == null ? "no estimate yet" : `≈ ${duration(g.seconds)} · $${g.cost?.toFixed(3) ?? "?"}`}
      {g.booting && " + boot"}
      {g.stopAfter && " · GPU stops after"}
    </>
  );
}

function label(g: Generate) {
  if (g.sending) return "Sending…";
  return g.runs > 1 ? `Generate ${g.runs}` : "Generate";
}

function buttonLabel(g: Generate, edit?: EditAction) {
  if (!edit) return label(g);
  return edit.sending ? "Sending…" : edit.button;
}

export function GenerateBar({ g: generate, edit }: { g: Generate; edit?: EditAction }) {
  const setLayer = useSetAtom(layerAtom);
  const g = edit ?? generate;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 order-3 border-t border-line bg-panel px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:py-3">
      {g.error && (
        <Note tone="bad" mono className="mb-2">
          {g.error}
        </Note>
      )}
      <div className="flex items-center gap-3">
        <Pressable
          onClick={() => setLayer("renders")}
          disabled={!!edit} // the list of renders is Generate's
          aria-label="Each render, seeds and stopping the GPU after"
          className="min-w-0 flex-1 font-mono text-xs leading-snug text-faint tabular-nums"
        >
          <div className="truncate text-muted">
            {g.label} <span aria-hidden>›</span>
          </div>
          <div className={cn("truncate", g.blocked && "text-warn")}>
            <Estimate g={g} />
          </div>
        </Pressable>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void g.submit()}
          disabled={!!g.blocked || g.sending}
          className="w-40"
        >
          {buttonLabel(generate, edit)}
          <kbd className="hidden font-mono text-[10.5px] opacity-50 [@media(pointer:fine)]:inline">
            {MOD}↵
          </kbd>
        </Button>
      </div>
    </div>
  );
}
