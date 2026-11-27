// The Edit tab: edit the image on the stage. The mask (made from the bar under the image, listed here), then what
// goes in: Dress puts a person's Wearing row from the Prompt tab on the body, one render per outfit; Repaint paints
// a few words into the mask. Then the passes, and the rest folded into one line: the hold, who is kept as the Prompt
// tab writes them, and how many takes. The bar at the bottom sends it.
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { portrait } from "@/domain/compose";
import { outfitPieces } from "@/domain/outfits";
import type { Person } from "@/domain/recipe";
import { EditLineage } from "@/features/edit/edit-lineage";
import { MaskSummary } from "@/features/edit/mask-summary";
import { Passes } from "@/features/edit/passes";
import { editAtom, optionsOpenAtom, rendersOpenAtom, TAKES, type EditChoice } from "@/features/edit/state";
import { flash } from "@/features/prompt/flash";
import { Row } from "@/features/prompt/rows";
import { openAtom } from "@/features/prompt/state";
import { recipeAtom, stageAtom } from "@/state/studio";
import { Checkbox } from "@/ui/checkbox";
import { Chip, ChipRow } from "@/ui/chip";
import { Disclosure } from "@/ui/disclosure";
import { Textarea } from "@/ui/field";
import { Section } from "@/ui/section";
import { Segmented } from "@/ui/segmented";
import { Heading, Note } from "@/ui/text";
import { Tip } from "@/ui/tip";

const MODES = [
  { value: "repaint", label: "Repaint" },
  { value: "dress", label: "Dress" },
] as const;

const HOLDS = [
  { value: "tight", label: "tight" },
  { value: "loose", label: "loose" },
  { value: "off", label: "free" },
] as const;

/** Who is edited, when there is more than one, and whether the prompt keeps them as the Prompt tab writes them. */
function Who({ person }: { person: Person }) {
  const [c, setC] = useAtom(editAtom);
  const dress = c.mode === "dress";
  const name = person.name || "them";
  // dressing sends each outfit in place of the Wearing row, so the line shows it without
  const kept = portrait(person, dress ? [] : undefined);
  return (
    <>
      <div className="flex items-center gap-2">
        <Checkbox
          on={c.portrait}
          onChange={(on) => setC((x) => ({ ...x, portrait: on }))}
          label={<span className="text-[13px]">Keep {name} as written</span>}
        />
        <Tip label="About keeping them">
          Who, Look{dress ? "" : " and Wearing"} from {name}&apos;s rows in the Prompt tab go into the prompt
          {dress ? " with each outfit" : " after your words"}, so a large area repainted still looks like{" "}
          {name}. Doing stays out: the pose is the image&apos;s. Switch it off for an edit away from {name},
          like the background.
        </Tip>
      </div>
      {c.portrait && (
        <p className="font-mono text-[11px] break-words text-muted">
          {kept || <span className="text-faint">Nothing written for {name} yet.</span>}
        </p>
      )}
    </>
  );
}

/** Whose clothes are dressed, or who is repainted, when there is more than one person. */
function PersonPicker({ person }: { person: Person }) {
  const recipe = useAtomValue(recipeAtom);
  const setC = useSetAtom(editAtom);
  if (recipe.cast.length < 2) return null;
  return (
    <ChipRow>
      {recipe.cast.map((p) => (
        <Chip
          key={p.id}
          tone={p.id === person.id ? "picked" : "quiet"}
          onClick={() => setC((x) => ({ ...x, person: p.id }))}
        >
          {p.name || "unnamed"}
        </Chip>
      ))}
    </ChipRow>
  );
}

function Wearing({ person }: { person: Person }) {
  const setOpen = useSetAtom(openAtom);
  const [open, setRendersOpen] = useAtom(rendersOpenAtom);
  const renders = outfitPieces(person);
  return (
    <>
      <Row
        phrases={person.wear}
        label={`What ${person.name || "they"} wear`}
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
          summary={`${renders.length} outfit${renders.length === 1 ? "" : "s"}, one render each`}
          open={open}
          onToggle={setRendersOpen}
        >
          {/* each render spelled out: switched-on pieces are worn together, a piece's versions make more renders */}
          <ol className="flex flex-col gap-0.5 font-mono text-[11px] text-muted">
            {renders.map((pieces, i) => (
              // oxlint-disable-next-line react/no-array-index-key -- the renders are numbered by place
              <li key={i} className="break-words">
                <span className="text-faint">Render {i + 1}:</span> {pieces.join(" + ")}
              </li>
            ))}
          </ol>
        </Disclosure>
      )}
    </>
  );
}

function Hold() {
  const [c, setC] = useAtom(editAtom);
  return (
    <div className="flex flex-col gap-1.5">
      <Heading>Body</Heading>
      <div className="flex items-center gap-2">
        <Segmented
          className="flex-1"
          value={c.hold}
          options={HOLDS}
          onChange={(hold) => setC((x) => ({ ...x, hold }))}
        />
        <Tip label="About the hold">
          Tight: the body&apos;s mesh pins the silhouette, the arms and the hands, for fitted clothes. Loose:
          the body stays, the outline may change, so a dress can flare and a hoodie hang. Free: no mesh, only
          the picture around the mask; the body may change with it.
        </Tip>
      </div>
    </div>
  );
}

/** "body tight · keeps Mia · 2 takes": what the folded options hold. */
function optionsSaid(c: EditChoice, name: string) {
  return [
    c.mode === "dress" && `body ${HOLDS.find((h) => h.value === c.hold)?.label ?? c.hold}`,
    c.portrait ? `keeps ${name}` : `not keeping ${name}`,
    `${c.takes} take${c.takes === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function EditPanel() {
  const { render, job } = useAtomValue(stageAtom);
  const recipe = useAtomValue(recipeAtom);
  const [c, setC] = useAtom(editAtom);
  const [optionsOpen, setOptionsOpen] = useAtom(optionsOpenAtom);
  const dress = c.mode === "dress";
  const person = recipe.cast.find((p) => p.id === c.person) ?? recipe.cast[0];
  return (
    <div>
      {render && <EditLineage render={render} />}
      {render ? (
        <MaskSummary key={render.id} render={render} />
      ) : (
        <p className="border-b border-line px-4 py-4 text-xs text-muted">
          {job ? "The stage shows a render on its way: edit it when it lands." : "No image to edit yet."}
        </p>
      )}
      <Section
        title="What goes in"
        tip="Dress puts the outfits from a person's Wearing row in the Prompt tab on the masked body, presets and saved characters included: the chips switched on are worn together, and each version of a chip makes another render. Repaint paints what you write into the mask, with any look."
      >
        <Segmented value={c.mode} options={MODES} onChange={(mode) => setC((x) => ({ ...x, mode }))} />
        {person && <PersonPicker person={person} />}
        {dress && person && <Wearing person={person} />}
        {!dress && (
          <Textarea
            value={c.repaint}
            onChange={(e) => setC((x) => ({ ...x, repaint: e.target.value }))}
            placeholder="what goes inside the mask: a red silk scarf"
          />
        )}
      </Section>
      <Passes />
      <Section title="Options">
        <Disclosure
          summary={optionsSaid(c, person?.name || "them")}
          open={optionsOpen}
          onToggle={setOptionsOpen}
        >
          {dress && <Hold />}
          {person && <Who person={person} />}
          <div className="flex flex-col gap-1.5">
            <Heading>Takes</Heading>
            <Segmented
              value={c.takes}
              options={TAKES.map((n) => ({ value: n, label: `×${n}` }))}
              onChange={(takes) => setC((x) => ({ ...x, takes }))}
            />
            <Note>Each outfit, or the repaint, this many times, each with its own seed.</Note>
          </div>
        </Disclosure>
      </Section>
    </div>
  );
}
