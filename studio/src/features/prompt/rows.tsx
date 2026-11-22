// A tab's body: a person's gender, where they stand (with more than one), and each row's phrases as
// chips; the scene's tab also holds what the people do together. A chip or "+ add" opens the row's
// sheet; the chip's card is brought into view there. Beside a row's name, the die adds one of its presets as a
// version, and the pin keeps the row out of Surprise me (domain/shuffle.ts).
import { useAtomValue, useSetAtom } from "jotai";
import type { ReactNode } from "react";

import { usePresets } from "@/data/db/presets";
import { sayTogether, setGender, withPerson, type Key } from "@/domain/cast";
import { GENDERS, type Gender } from "@/domain/presets/gender";
import { SIDES, type Depth, type Person, type Phrase } from "@/domain/recipe";
import { PERSON_ROWS, SCENE_ROWS, TOGETHER, type RowId } from "@/domain/rows";
import { fresh, offered, rowKey, SCENE, withVersion } from "@/domain/shuffle";
import { CharacterLoras } from "@/features/prompt/character-loras";
import { FaceRow } from "@/features/prompt/face-row";
import { recipeAtom } from "@/state/studio";
import { Button } from "@/ui/button";
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

function GenderPicker({ person }: { person: Person }) {
  const setRecipe = useSetAtom(recipeAtom);
  return (
    <Segmented
      value={person.gender}
      options={GENDERS.map((g) => ({ value: g, label: g }))}
      onChange={(g) => setRecipe((r) => setGender(r, person.id, g))}
    />
  );
}

const text = (p: Phrase) => p.t;

function tone(p: Phrase) {
  if (!p.on) return "off";
  return p.versions.length ? "varied" : "plain";
}

/** The die and the pin of one row: a person's (owner is their id) or the scene's. */
function RowTools({
  owner,
  row,
  phrases,
  gender = "person",
}: {
  owner: string;
  row: RowId;
  phrases: Phrase[];
  gender?: Gender;
}) {
  const setRecipe = useSetAtom(recipeAtom);
  const pinned = useAtomValue(recipeAtom).pinned.includes(rowKey(owner, row));
  const options = fresh(phrases, offered(row, gender, usePresets() ?? []));
  const roll = () => {
    const t = options[Math.floor(Math.random() * options.length)];
    setRecipe((r) =>
      owner === SCENE
        ? {
            ...r,
            scene: { ...r.scene, [row]: withVersion(r.scene[row as keyof typeof r.scene] as Phrase[], t) },
          }
        : withPerson(r, owner, (p) => ({ ...p, [row]: withVersion(p[row as keyof Person] as Phrase[], t) })),
    );
  };
  const key = rowKey(owner, row);
  return (
    <>
      <Button
        variant="text"
        size="inline"
        disabled={!options.length}
        onClick={roll}
        title={
          options.length ? "Add one of its presets as a version: another render" : "No presets left to add"
        }
      >
        dice
      </Button>
      <Button
        variant="text"
        size="inline"
        aria-pressed={pinned}
        onClick={() =>
          setRecipe((r) => ({
            ...r,
            pinned: pinned ? r.pinned.filter((k) => k !== key) : [...r.pinned, key],
          }))
        }
        title="Pinned: Surprise me leaves this row as it is"
      >
        {pinned ? "pinned" : "pin"}
      </Button>
    </>
  );
}

/** A row's phrases as chips and "+ add"; also the Edit tab's Wearing row. */
export function Row({
  phrases,
  label,
  hint,
  onOpen,
  say = text,
  tools,
}: {
  phrases: Phrase[];
  tools?: ReactNode; // beside the row's name
  /** A chip's text, when it reads otherwise than the phrase. */
  say?: (p: Phrase) => string;
  label: string;
  hint: string;
  onOpen: (shown?: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex min-h-6 items-center gap-1">
        <Heading className="flex-1">{label}</Heading>
        {tools}
      </div>
      <ChipRow>
        {phrases
          .filter((p) => p.t.trim())
          .map((p) => (
            <Chip key={p.id} tone={tone(p)} text="body" onClick={() => onOpen(p.id)}>
              <span className="min-w-0 break-words">{say(p)}</span>
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

type RowsProps = {
  tab: Key;
  onOpen: (row: RowId, shown?: string) => void;
  onTogether: (shown?: string) => void;
};

export function Rows({ tab, onOpen, onTogether }: RowsProps) {
  const recipe = useAtomValue(recipeAtom);
  const person = recipe.cast.find((c) => c.id === tab);
  const ids = new Set(recipe.cast.map((c) => c.id));
  const together = recipe.together.filter((i) => ids.has(i.from) && ids.has(i.to));
  const said = new Map(together.map((i) => [i.id, sayTogether(recipe, i)]));
  return (
    <section className="flex flex-col gap-3 border-b border-line px-4 py-3">
      {person && <GenderPicker person={person} />}
      {person && <FaceRow key={person.id} person={person} />}
      {person?.savedId && <CharacterLoras person={person} />}
      {person && recipe.cast.length > 1 && <Placement person={person} />}
      {person
        ? PERSON_ROWS.map((row) => (
            <Row
              key={row.id}
              phrases={person[row.id]}
              label={row.label}
              hint={row.hint}
              onOpen={(shown) => onOpen(row.id, shown)}
              tools={
                <RowTools owner={person.id} row={row.id} phrases={person[row.id]} gender={person.gender} />
              }
            />
          ))
        : SCENE_ROWS.map((row) => (
            <Row
              key={row.id}
              phrases={recipe.scene[row.id]}
              label={row.label}
              hint={row.hint}
              onOpen={(shown) => onOpen(row.id, shown)}
              tools={<RowTools owner={SCENE} row={row.id} phrases={recipe.scene[row.id]} />}
            />
          ))}
      {!person && recipe.cast.length > 1 && (
        <Row
          phrases={together}
          say={(p) => said.get(p.id) ?? p.t}
          label={TOGETHER.label}
          hint={TOGETHER.hint}
          onOpen={onTogether}
        />
      )}
    </section>
  );
}
