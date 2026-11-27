// A tab's body: the person's setup folded into one line (person-setup.tsx), then each row's phrases as chips; the
// scene's tab also holds what the people do together. A chip or "+ add" opens the row's sheet; the chip's card is
// brought into view there.
import { useAtomValue } from "jotai";

import { sayTogether, type Key } from "@/domain/cast";
import type { Phrase } from "@/domain/recipe";
import { PERSON_ROWS, SCENE_ROWS, TOGETHER, type RowId } from "@/domain/rows";
import { valuesOf } from "@/domain/versions";
import { PersonSetup } from "@/features/prompt/person-setup";
import { recipeAtom } from "@/state/studio";
import { Chip, ChipRow } from "@/ui/chip";
import { Heading } from "@/ui/text";

const text = (p: Phrase) => p.t;

function tone(p: Phrase) {
  if (!p.on) return "off";
  return p.versions.length ? "varied" : "plain";
}

/** A row's phrases as chips and "+ add"; also the Edit tab's Wearing row. */
export function Row({
  phrases,
  label,
  hint,
  onOpen,
  say = text,
}: {
  phrases: Phrase[];
  /** A chip's text, when it reads otherwise than the phrase. */
  say?: (p: Phrase) => string;
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
              <span className="min-w-0 break-words">{say(p)}</span>
              {p.on && valuesOf(p).length > 1 && (
                <span
                  className="bg-accent/15 px-1.5 font-mono text-[10.5px] text-accent no-underline"
                  title={`${valuesOf(p).length} versions: one render each`}
                >
                  {valuesOf(p).length}
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
      {person && <PersonSetup person={person} />}
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
