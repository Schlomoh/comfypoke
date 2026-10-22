// A tab's body: where a person stands (with more than one), and each row's phrases as chips. A chip or
// "+ add" opens the row's sheet; the chip's card is brought into view there.
import { useAtomValue, useSetAtom } from "jotai";

import { withPerson, type Key } from "@/domain/cast";
import { SIDES, type Depth, type Person, type Phrase } from "@/domain/recipe";
import { PERSON_ROWS, SCENE_ROWS, type RowId } from "@/domain/rows";
import { recipeAtom } from "@/state/studio";
import { Chip, ChipRow } from "@/ui/chip";
import { Segmented, Toggles } from "@/ui/segmented";
import { Heading, Note } from "@/ui/text";

const DEPTHS: Depth[] = ["auto", "front", "back"];

function Placement({ person }: { person: Person }) {
  const setRecipe = useSetAtom(recipeAtom);
  const set = (change: (p: Person) => Person) => setRecipe((r) => withPerson(r, person.id, change));
  return (
    <div className="flex flex-col gap-1.5">
      <Heading>Side</Heading>
      <Toggles value={person.side} options={SIDES} onChange={(side) => set((p) => ({ ...p, side }))} />
      <Heading>Depth</Heading>
      <Segmented
        value={person.depth}
        options={DEPTHS.map((d) => ({ value: d, label: d }))}
        onChange={(depth) => set((p) => ({ ...p, depth }))}
      />
      <Note>
        {person.side.length ? "Others can share the same spot." : "No side picked: placed anywhere."}
      </Note>
    </div>
  );
}

function tone(p: Phrase) {
  if (!p.on) return "off";
  return p.versions.length ? "varied" : "plain";
}

function Row({
  phrases,
  label,
  hint,
  onOpen,
}: {
  phrases: Phrase[];
  label: string;
  hint: string;
  onOpen: (shown?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Heading>{label}</Heading>
      <ChipRow>
        {phrases
          .filter((p) => p.t.trim())
          .map((p) => (
            <Chip key={p.id} tone={tone(p)} text="body" onClick={() => onOpen(p.id)}>
              <span className="min-w-0 break-words">{p.t}</span>
              {p.on && p.versions.length > 0 && (
                <span
                  className="bg-warn/15 px-1.5 font-mono text-[10.5px] text-warn no-underline"
                  title={`${p.versions.length + 1} versions`}
                >
                  {p.versions.length + 1}
                </span>
              )}
            </Chip>
          ))}
        <Chip tone="add" text="body" onClick={() => onOpen()}>
          + {phrases.length ? "add" : hint}
        </Chip>
      </ChipRow>
    </div>
  );
}

export function Rows({ tab, onOpen }: { tab: Key; onOpen: (row: RowId, shown?: string) => void }) {
  const recipe = useAtomValue(recipeAtom);
  const person = recipe.cast.find((c) => c.id === tab);
  return (
    <section className="flex flex-col gap-3 border-b border-line px-4 py-3">
      {person && recipe.cast.length > 1 && <Placement person={person} />}
      {person
        ? PERSON_ROWS.map((row) => (
            <Row
              key={row.id}
              phrases={person[row.id]}
              label={row.label}
              hint={row.hint}
              onOpen={(shown) => onOpen(row.id, shown)}
            />
          ))
        : SCENE_ROWS.map((row) => (
            <Row
              key={row.id}
              phrases={recipe.scene[row.id]}
              label={row.label}
              hint={row.hint}
              onOpen={(shown) => onOpen(row.id, shown)}
            />
          ))}
    </section>
  );
}
