// The tags of one image or of many: each tag in the workspace as a chip, on for all of them, some (mixed) or none; a
// tap puts it on all or takes it off all. A new one is typed below.
import { useAtomValue } from "jotai";
import { useState } from "react";

import { useSpace } from "@/data/db/space";
import type { Render } from "@/domain/render";
import { cleanTag, tagState } from "@/domain/tags";
import { tagsAtom } from "@/state/studio";
import { setTag } from "@/state/tags";
import { Button } from "@/ui/button";
import { Chip, ChipRow } from "@/ui/chip";
import { Input } from "@/ui/field";
import { Note } from "@/ui/text";

const TONE = { all: "picked", some: "mixed", none: "quiet" } as const;

export function TagEditor({ targets }: { targets: readonly Render[] }) {
  const space = useSpace();
  const tags = useAtomValue(tagsAtom);
  const [typed, setTyped] = useState("");

  return (
    <div className="flex flex-col gap-2">
      {tags.length > 0 ? (
        <ChipRow>
          {tags.map(({ tag }) => {
            const state = tagState(targets, tag);
            return (
              <Chip
                key={tag}
                tone={TONE[state]}
                aria-pressed={state === "some" ? "mixed" : state === "all"}
                title={state === "some" ? "On some of them: tap to put it on all" : undefined}
                onClick={() => void setTag(space, targets, tag, state !== "all")}
              >
                {tag}
              </Chip>
            );
          })}
        </ChipRow>
      ) : (
        <Note>No tags in this workspace yet. A tag is how images are grouped: type one below.</Note>
      )}
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          const t = cleanTag(typed);
          if (!t) return;
          void setTag(space, targets, t, true);
          setTyped("");
        }}
      >
        <Input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="a new tag"
          aria-label="New tag"
          enterKeyHint="done"
          className="min-w-0 flex-1"
        />
        <Button type="submit" disabled={!cleanTag(typed)}>
          Tag
        </Button>
      </form>
    </div>
  );
}
