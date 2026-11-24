// The Edit tab: edit the image on the stage. People works on everyone in it at once: each face found, who it is, a new
// outfit from their Wearing row and their face redrawn (features/edit/people). Repaint paints a few words into the
// mask, made from the bar under the image and listed here. Then the passes, and the rest folded into one line: the
// hold, who is kept as the Prompt tab writes them, and how many takes. The bar at the bottom sends it.
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { portrait } from "@/domain/compose";
import type { Person } from "@/domain/recipe";
import { EditLineage } from "@/features/edit/edit-lineage";
import { hasArea } from "@/features/edit/mask";
import { MaskSummary } from "@/features/edit/mask-summary";
import { Passes } from "@/features/edit/passes";
import { PeopleList } from "@/features/edit/people/people-list";
import { editAtom, masksAtom, optionsOpenAtom, TAKES, type EditChoice } from "@/features/edit/state";
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
  { value: "people", label: "People" },
  { value: "repaint", label: "Repaint" },
] as const;

const HOLDS = [
  { value: "tight", label: "tight" },
  { value: "loose", label: "loose" },
  { value: "off", label: "free" },
] as const;

/** Whether the prompt keeps the person as the Prompt tab writes them: in a repaint the one picked, in People everyone
 * dressed, each with their outfit in place of their Wearing row. */
function Who({ person }: { person: Person }) {
  const [c, setC] = useAtom(editAtom);
  const dress = c.mode === "people";
  const name = dress ? "everyone" : person.name || "them";
  const kept = dress ? "" : portrait(person);
  return (
    <>
      <div className="flex items-center gap-2">
        <Checkbox
          on={c.portrait}
          onChange={(on) => setC((x) => ({ ...x, portrait: on }))}
          label={<span className="text-[13px]">Keep {name} as written</span>}
        />
        <Tip label="About keeping them">
          {dress
            ? "Each dressed person's Who and Look from their rows in the Prompt tab go into the prompt with their outfit, so the new clothes are theirs. Doing stays out: the pose is the image's."
            : `Who, Look and Wearing from ${name}'s rows in the Prompt tab go into the prompt after your words, so a large area repainted still looks like ${name}. Doing stays out: the pose is the image's. Switch it off for an edit away from ${name}, like the background.`}
        </Tip>
      </div>
      {c.portrait && !dress && (
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
    c.mode === "people" && `body ${HOLDS.find((h) => h.value === c.hold)?.label ?? c.hold}`,
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
  const masked = hasArea(useAtomValue(masksAtom)[render?.id ?? ""] ?? []);
  const people = c.mode === "people";
  const person = recipe.cast.find((p) => p.id === c.person) ?? recipe.cast[0];
  return (
    <div>
      {render && <EditLineage render={render} />}
      {!render && (
        <p className="border-b border-line px-4 py-4 text-xs text-muted">
          {job ? "The stage shows a render on its way: edit it when it lands." : "No image to edit yet."}
        </p>
      )}
      <Section
        title="What goes in"
        tip="People works on everyone in the picture at once: each face found is guessed as one of the cast, by their face photo or where they stand; tap a name to change it. Each gets a new outfit from their Wearing row in the Prompt tab, over the clothes found on them or the mask, and their face redrawn, in one render. Outfits with versions go side by side: the second render takes everyone's second. Repaint paints what you write into the mask, with any look."
      >
        <Segmented value={c.mode} options={MODES} onChange={(mode) => setC((x) => ({ ...x, mode }))} />
        {people && render && <PeopleList render={render} />}
        {!people && person && <PersonPicker person={person} />}
        {!people && (
          <Textarea
            value={c.repaint}
            onChange={(e) => setC((x) => ({ ...x, repaint: e.target.value }))}
            placeholder="what goes inside the mask: a red silk scarf"
          />
        )}
      </Section>
      {/* the mask: what Repaint replaces, and in People an area someone can be dressed over */}
      {render && (!people || masked) && <MaskSummary key={render.id} render={render} />}
      <Passes />
      <Section title="Options">
        <Disclosure
          summary={optionsSaid(c, people ? "everyone" : person?.name || "them")}
          open={optionsOpen}
          onToggle={setOptionsOpen}
        >
          {people && <Hold />}
          {person && <Who person={person} />}
          <div className="flex flex-col gap-1.5">
            <Heading>Takes</Heading>
            <Segmented
              value={c.takes}
              options={TAKES.map((n) => ({ value: n, label: `×${n}` }))}
              onChange={(takes) => setC((x) => ({ ...x, takes }))}
            />
            <Note>Each render this many times, each with its own seed.</Note>
          </div>
        </Disclosure>
      </Section>
    </div>
  );
}
