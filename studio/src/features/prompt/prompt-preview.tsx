// The prompt as it will be sent, with the phrases that vary shown with all their versions.
import { useAtomValue, useSetAtom } from "jotai";

import { compose } from "@/domain/compose";
import { axes } from "@/domain/versions";
import { useTriggers } from "@/state/recipe";
import { layerAtom, recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { notify } from "@/ui/notify";
import { Heading, Note } from "@/ui/text";

const OPEN = "\u0001";
const CLOSE = "\u0002";

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => notify("Prompt copied"),
    () => notify("Could not copy the prompt", { bad: true }),
  );
}

export function PromptPreview() {
  const recipe = useAtomValue(recipeAtom);
  const triggers = useTriggers();
  const setLayer = useSetAtom(layerAtom);
  const varied = axes(recipe).length > 0;
  // the varied phrases inline with all their versions, marked so they can be drawn apart
  const marked = compose(recipe, triggers, (p) =>
    p.versions.length ? `${OPEN}${[p.t, ...p.versions].join(" / ")}${CLOSE}` : p.t,
  );
  const plain = compose(recipe, triggers);
  return (
    <section className="flex flex-col gap-2 border-b border-line px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <Heading>Prompt · {plain.length} chars</Heading>
        {varied ? (
          <Button variant="text" onClick={() => setLayer("renders")} className="underline underline-offset-4">
            see each render
          </Button>
        ) : (
          <Button variant="text" disabled={!plain} onClick={() => copy(plain)}>
            copy
          </Button>
        )}
      </div>
      <p className="min-h-10 border border-line bg-bg p-2.5 font-mono text-xs leading-relaxed text-muted">
        {plain
          ? marked.split(new RegExp(`(${OPEN}[^${CLOSE}]*${CLOSE})`)).map((part, i) =>
              part.startsWith(OPEN) ? (
                // oxlint-disable-next-line react/no-array-index-key -- the parts of one string, in order; nothing reorders them
                <span key={i} className="bg-warn/15 text-warn">
                  [{part.slice(1, -1)}]
                </span>
              ) : (
                part
              ),
            )
          : "Add a phrase to a row to build the prompt."}
      </p>
      {triggers.length > 0 && <Note>Starts with the trigger words of the active LoRAs.</Note>}
    </section>
  );
}
