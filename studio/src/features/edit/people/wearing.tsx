// A person's Wearing row from the Prompt tab, where People dresses them from: the chips switched on are worn together,
// and each version of a chip makes another render, spelled out under a fold.
import { useAtom, useSetAtom } from "jotai";

import { outfitPieces } from "@/domain/outfits";
import type { Person } from "@/domain/recipe";
import { rendersOpenAtom } from "@/features/edit/state";
import { flash } from "@/features/prompt/flash";
import { Row } from "@/features/prompt/rows";
import { openAtom } from "@/features/prompt/state";
import { Disclosure } from "@/ui/disclosure";

export function Wearing({ person }: { person: Person }) {
  const setOpen = useSetAtom(openAtom);
  const [open, setRendersOpen] = useAtom(rendersOpenAtom);
  const renders = outfitPieces(person);
  return (
    <>
      <Row
        phrases={person.wear}
        label={person.name ? `What ${person.name} wears` : "What they wear"}
        hint="clothes"
        onOpen={(shown) => {
          setOpen({ kind: "row", key: person.id, row: "wear", target: null });
          if (shown) setTimeout(() => flash(shown));
        }}
      />
      {renders.length === 0 ? (
        <p className="text-xs text-faint">Add what goes on: a piece of clothing per chip.</p>
      ) : (
        <Disclosure
          summary={`${renders.length} outfit${renders.length === 1 ? "" : "s"}`}
          open={open}
          onToggle={setRendersOpen}
        >
          <ol className="flex flex-col gap-0.5 font-mono text-[11px] text-muted">
            {renders.map((pieces, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- the outfits are numbered by place
              <li key={i} className="break-words">
                <span className="text-faint">{i + 1}:</span> {pieces.join(" + ")}
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
    </>
  );
}
