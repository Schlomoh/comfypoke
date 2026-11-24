// People in the Edit tab: one card per face found on the image, each saying who it is (guessed, a tap to change),
// whether they get an outfit from their Wearing row and over what, and whether their face is redrawn. The faces are
// found by themselves the first time People opens on an image.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect } from "react";

import { outfitPieces } from "@/domain/outfits";
import type { Pick } from "@/domain/people";
import type { Render } from "@/domain/render";
import { hasArea } from "@/features/edit/mask";
import { MASK_PART, peopleAtom, pointedAtom, startPick, type PersonRow } from "@/features/edit/people/state";
import { useFaces, useFinding } from "@/features/edit/people/use-faces";
import { Wearing } from "@/features/edit/people/wearing";
import { masksAtom } from "@/features/edit/state";
import { PARTS } from "@/features/edit/use-find";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow } from "@/ui/chip";
import { cn } from "@/ui/cn";
import { Select } from "@/ui/field";

const tried = new Set<string>(); // images whose faces were looked for by themselves once: a failure is not retried in a loop

function Card({ render, index, row }: { render: Render; index: number; row: PersonRow }) {
  const cast = useAtomValue(recipeAtom).cast;
  const setRows = useSetAtom(peopleAtom);
  const [pointed, setPointed] = useAtom(pointedAtom);
  const masked = hasArea(useAtomValue(masksAtom)[render.id] ?? []);
  const person = cast.find((p) => p.id === row.pick.who);
  const { pick } = row;
  const set = (patch: Partial<Pick>) =>
    setRows((all) => ({
      ...all,
      [render.id]: (all[render.id] ?? []).map((r, i) =>
        i === index ? { ...r, pick: { ...r.pick, ...patch } } : r,
      ),
    }));
  const outfits = person ? outfitPieces(person).length : 0;
  const parts = [
    ...PARTS.slice(0, 5).map(([label]) => label),
    ...(masked || pick.part === MASK_PART ? [MASK_PART] : []),
  ];
  return (
    <div
      id={`person-${index}`}
      onAnimationEnd={() => setPointed(null)}
      className={cn(
        "flex flex-col gap-2 border-l-2 py-1 pl-3",
        pointed === index ? "flash-card border-mask" : "border-line",
      )}
    >
      <span className="label">{row.found ? `Face ${index + 1}` : "Whoever is in the picture"}</span>
      <ChipRow>
        {cast.map((p) => (
          <Chip
            key={p.id}
            tone={p.id === pick.who ? "picked" : "quiet"}
            onClick={() => set(startPick(p, row.found))}
          >
            {p.name || "unnamed"}
          </Chip>
        ))}
        <Chip tone={pick.who === null ? "picked" : "quiet"} onClick={() => set({ who: null })}>
          leave as is
        </Chip>
      </ChipRow>
      {person && (
        <>
          <div className="flex min-h-11 items-center gap-2 fine:min-h-8">
            <Checkbox
              on={pick.outfit}
              onChange={(outfit) => set({ outfit })}
              label={<span className="text-[13px]">New outfit{outfits > 1 ? `s · ${outfits}` : ""}</span>}
            />
            {pick.outfit && (
              <Select
                className="ml-auto max-w-40"
                aria-label="What the outfit replaces"
                value={pick.part}
                onChange={(e) => set({ part: e.target.value })}
              >
                {parts.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            )}
          </div>
          {pick.outfit && <Wearing person={person} />}
          {row.found && (
            <Checkbox
              on={pick.face}
              onChange={(face) => set({ face })}
              label={<span className="text-[13px]">Redraw the face</span>}
            />
          )}
        </>
      )}
    </div>
  );
}

export function PeopleList({ render }: { render: Render }) {
  const rows = useAtomValue(peopleAtom)[render.id];
  const finding = useFinding(render);
  const find = useFaces(render);
  useEffect(() => {
    if (rows || tried.has(render.id)) return;
    tried.add(render.id);
    void find();
  }, [rows, render.id, find]);
  const faces = rows?.filter((r) => r.found).length ?? 0;
  let said = "";
  if (finding) said = `finding faces · ${finding}`;
  else if (rows) said = faces ? `${faces} face${faces === 1 ? "" : "s"} found` : "no face found";
  return (
    <>
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-xs text-faint" aria-live="polite">
          {said}
        </span>
        <Button variant="link" size="inline" disabled={!!finding} onClick={() => void find()}>
          {rows ? "find again" : "find faces"}
        </Button>
      </div>
      {rows?.map((row, i) => (
        // oxlint-disable-next-line react/no-array-index-key -- the faces are numbered left to right
        <Card key={i} render={render} index={i} row={row} />
      ))}
    </>
  );
}
