// People in the Edit tab: one card per face found on the image, each saying who it is (guessed, a tap to change),
// whether they get an outfit from their Wearing row and over what, and whether their face is redrawn. The faces are
// found by themselves on an image the stage stays on for a moment, but only while the GPU is up: passing images by, or
// opening the Edit tab with the GPU off, never starts it. Then "find faces" does.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef } from "react";

import { useGpu } from "@/data/queries";
import { outfitPieces } from "@/domain/outfits";
import type { Pick } from "@/domain/people";
import type { Render } from "@/domain/render";
import {
  askedAtom,
  colorOf,
  peopleAtom,
  selectedAtom,
  startPick,
  type PersonRow,
} from "@/features/edit/people/state";
import { areasLook, isArea, useAreas, wanted } from "@/features/edit/people/use-areas";
import { useFaces, useFinding } from "@/features/edit/people/use-faces";
import { Wearing } from "@/features/edit/people/wearing";
import { maskKey, masksAtom } from "@/features/edit/state";
import { PARTS } from "@/features/edit/use-find";
import { useStage } from "@/state/preview";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow } from "@/ui/chip";
import { cn } from "@/ui/cn";
import { Select } from "@/ui/field";
import { Pressable } from "@/ui/pressable";

const tried = new Set<string>(); // images whose faces were looked for by themselves once: a failure is not retried in a loop
const SETTLE_MS = 1000; // how long the stage stays on an image before its faces are looked for: a swipe past sends nothing

function Card({ render, index, row }: { render: Render; index: number; row: PersonRow }) {
  const cast = useAtomValue(recipeAtom).cast;
  const setRows = useSetAtom(peopleAtom);
  const setMasks = useSetAtom(masksAtom);
  const [selected, setSelected] = useAtom(selectedAtom);
  const on = selected?.id === render.id && selected.index === index;
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
  const key = maskKey(render.id, index);
  /** Another part: their area is found again for it, their own strokes stay. */
  const setPart = (part: string) => {
    set({ part });
    setMasks((m) => ({ ...m, [key]: (m[key] ?? []).filter((o) => !isArea(o)) }));
  };
  return (
    <div
      id={`person-${index}`}
      className={cn("flex flex-col gap-2 border-l-4 py-1 pl-3", on ? "bg-raised" : "border-line")}
      style={{ borderLeftColor: person ? colorOf(index) : undefined }}
    >
      <Pressable
        aria-pressed={on}
        className="flex min-h-8 items-center gap-2"
        onClick={() => setSelected(on ? null : { id: render.id, index })}
      >
        <span className="label">{row.found ? `Face ${index + 1}` : "Whoever is in the picture"}</span>
        <span className="ml-auto text-xs text-faint">{on ? "editing their area" : "edit their area"}</span>
      </Pressable>
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
                onChange={(e) => setPart(e.target.value)}
              >
                {PARTS.slice(0, 5).map(([p]) => (
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
  const latest = useRef(find); // the timer below starts the find as it is then, not as it was when it was set
  useEffect(() => {
    latest.current = find;
  });
  const { gpu } = useGpu();
  const warm = !!gpu?.booted && (gpu.state === "warm" || gpu.state === "busy");
  useEffect(() => {
    if (rows || !warm || tried.has(render.id)) return;
    const t = setTimeout(() => {
      tried.add(render.id);
      void latest.current();
    }, SETTLE_MS);
    return () => clearTimeout(t);
  }, [rows, warm, render.id]);
  // a dressed person selected without their area: everyone dressed gets theirs found, to see and edit
  const areas = useAreas(render);
  const areasNow = useRef(areas);
  useEffect(() => {
    areasNow.current = areas;
  });
  const selected = useAtomValue(selectedAtom);
  const asked = useAtomValue(askedAtom);
  const running = !!useStage(areasLook(render.id));
  const pick = selected?.id === render.id ? rows?.[selected.index]?.pick : undefined;
  const dressedOn = !!pick?.who && pick.outfit;
  const pending = wanted(rows ?? [], render.id, asked)
    .map(({ key, row }) => `${key}|${row.pick.part}`)
    .join(",");
  useEffect(() => {
    if (dressedOn && pending && !running) void areasNow.current();
  }, [dressedOn, pending, running]);
  const faces = rows?.filter((r) => r.found).length ?? 0;
  let said = "";
  if (finding) said = `finding faces · ${finding}`;
  else if (rows) said = faces ? `${faces} face${faces === 1 ? "" : "s"} found` : "no face found";
  else if (!warm) said = "the GPU is off: finding faces starts it";
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
