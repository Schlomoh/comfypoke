// The dock along the bottom: what the next run is set to, as one line, what it costs, and Generate; in the Edit tab
// the edit's line and its button instead.
import { MOD } from "@/app/platform";
import { duration } from "@/domain/format";
import type { EditAction } from "@/features/edit/use-edit";
import { RunLine } from "@/features/run/run-line";
import type { Generate } from "@/state/generate";
import { Button } from "@/ui/button";
import { cn } from "@/ui/cn";
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
  const word = g.draft ? "Draft" : "Generate";
  return g.runs > 1 ? `${word} ${g.runs}` : word;
}

function buttonLabel(g: Generate, edit?: EditAction) {
  if (!edit) return label(g);
  return edit.sending ? "Sending…" : edit.button;
}

/** Generate's own: the run's line, then the estimate and the button. An edit has no run line: its passes are set in
 * the Edit tab, so its line says what it will do. */
export function Dock({ g: generate, edit }: { g: Generate; edit?: EditAction }) {
  const g = edit ?? generate;
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 order-3 flex flex-col gap-2.5 border-t border-line bg-panel px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:static lg:py-3">
      {g.error && (
        <Note tone="bad" mono>
          {g.error}
        </Note>
      )}
      {!edit && <RunLine />}
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1 font-mono text-xs leading-snug text-faint tabular-nums">
          {edit && <div className="truncate text-muted">{edit.label}</div>}
          {/* why Generate is off wraps rather than truncates: it is the one line that says */}
          <div className={cn(g.blocked ? "line-clamp-2 text-muted" : "truncate")}>
            <Estimate g={g} />
          </div>
        </div>
        <Button
          variant="primary"
          size="lg"
          onClick={() => void g.submit()}
          disabled={!!g.blocked || g.sending}
          className="w-44"
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
