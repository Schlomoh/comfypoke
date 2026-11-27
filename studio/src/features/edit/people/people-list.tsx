// People in the Edit tab: one card per face found on the image, each saying who it is (guessed, a tap to change),
// whether they get an outfit from their Wearing row and over what, and whether their face is redrawn. A dressed person
// has two steps of their own, each run only when asked for and seen before it is used: their area (found by their part,
// then edited on the stage; required) and their body (fitted, held to; without one they are dressed without a body).
// The faces are found by themselves on an image the stage stays on for a moment, but only while the GPU is up: passing
// images by, or opening the Edit tab with the GPU off, never starts it. Then "find faces" does.
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useEffect, useRef, type ReactNode } from "react";

import { useGpu } from "@/data/queries";
import { outfitPieces } from "@/domain/outfits";
import type { Pick } from "@/domain/people";
import type { Render } from "@/domain/render";
import { hasArea } from "@/features/edit/mask";
import {
  bodiesAtom,
  colorOf,
  peopleAtom,
  selectedAtom,
  startPick,
  type PersonRow,
} from "@/features/edit/people/state";
import { areaLook, isArea, useArea } from "@/features/edit/people/use-areas";
import { bodyLook, useBody } from "@/features/edit/people/use-body";
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

/** One of a dressed person's steps: what it holds now, and the button that runs it. */
function Step({
  label,
  said,
  run,
  busy,
  more,
}: {
  label: string;
  said: string;
  run: [string, () => void];
  busy: string | null;
  more?: ReactNode;
}) {
  return (
    <div className="flex min-h-8 items-center gap-2 text-[13px]">
      <span className="w-10 shrink-0 text-faint">{label}</span>
      <span className="min-w-0 flex-1 truncate" aria-live="polite">
        {busy ? `${run[0].replace(/ again$/, "")}… ${busy}` : said}
      </span>
      {more}
      <Button variant="link" size="inline" disabled={!!busy} onClick={run[1]}>
        {run[0]}
      </Button>
    </div>
  );
}

/** A dressed person's area and body: each found or fitted when asked for, shown on the stage, used as shown. */
function Steps({ render, index }: { render: Render; index: number }) {
  const key = maskKey(render.id, index);
  const ops = useAtomValue(masksAtom)[key] ?? [];
  const [bodies, setBodies] = useAtom(bodiesAtom);
  const setSelected = useSetAtom(selectedAtom);
  const findArea = useArea(render, index);
  const fitBody = useBody(render, index);
  const finding = useStage(areaLook(key));
  const fitting = useStage(bodyLook(key));
  const select = () => setSelected({ id: render.id, index }); // what is found is theirs to see and edit next
  let area = "none yet: find it, or paint it on the stage";
  if (hasArea(ops)) area = ops.some(isArea) ? "found, editable on the stage" : "painted";
  const body = !!bodies[key];
  return (
    <div className="flex flex-col">
      <Step
        label="area"
        said={area}
        busy={finding}
        run={[ops.some(isArea) ? "find again" : "find area", () => (select(), void findArea())]}
      />
      <Step
        label="body"
        said={body ? "fitted: dressing holds to it" : "none: dressed without a body"}
        busy={fitting}
        run={[body ? "fit again" : "fit body", () => (select(), void fitBody())]}
        more={
          body && (
            <Button
              variant="link"
              size="inline"
              onClick={() =>
                setBodies((all) => Object.fromEntries(Object.entries(all).filter(([k]) => k !== key)))
              }
            >
              remove
            </Button>
          )
        }
      />
    </div>
  );
}

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
  /** Another part: their area as found goes, to be found again for it; their own strokes stay. */
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
            onClick={() => set({ ...startPick(p), face: pick.face, part: pick.part })} // their area stays theirs
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
          {pick.outfit && <Steps render={render} index={index} />}
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
