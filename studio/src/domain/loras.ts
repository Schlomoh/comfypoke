// The LoRA stack and the cast: a saved character brings its own LoRAs for the model family in use, and its
// trigger words go into that person's description, so two characters in one picture each keep their words.
// The stack's order is the user's: it is the order of the LoraLoader chain and of the leading trigger words.
import type { Person, StackLora } from "@/domain/recipe";
import type { Saved } from "@/domain/saved";

/** Trigger words: the stack's own lead the prompt; a character's go into that person's words, by saved id. */
export type Triggers = { lead: string[]; of: Record<string, string[]> };
export const NO_TRIGGERS: Triggers = { lead: [], of: {} };

type Note = { name: string; trigger: string; family?: string };

/** Whether a LoRA runs with this family: yes unless its note says it was made for another. */
export const fits = (name: string, notes: readonly Note[], family: string | undefined) => {
  const made = notes.find((n) => n.name === name)?.family;
  return !made || !family || made === family;
};

/** The switched-on LoRAs that run with this family, as the server takes them. */
/** The switched-on LoRAs that run with this family, each file once: the first in stack order wins, so a LoRA that both
 * a character and the stack bring is not loaded twice. */
const live = (loras: StackLora[], notes: readonly Note[], family: string | undefined) =>
  loras.filter(
    (l, i) => l.on && fits(l.name, notes, family) && loras.findIndex((x) => x.on && x.name === l.name) === i,
  );

export const runnable = (loras: StackLora[], notes: readonly Note[], family: string | undefined) =>
  live(loras, notes, family).map(({ name, strength }) => ({ name, strength }));

/** The trigger words of the switched-on LoRAs that run with this family, in stack order. */
export function triggersOf(loras: StackLora[], notes: readonly Note[], family?: string): Triggers {
  const out: Triggers = { lead: [], of: {} };
  for (const l of live(loras, notes, family)) {
    const t = notes.find((n) => n.name === l.name)?.trigger.trim();
    if (!t) continue;
    if (l.from) (out.of[l.from] ??= []).push(t);
    else out.lead.push(t);
  }
  return out;
}

const same = (a: StackLora[], b: StackLora[]) =>
  a.length === b.length &&
  a.every(
    (l, i) =>
      l.name === b[i].name && l.from === b[i].from && l.strength === b[i].strength && l.on === b[i].on,
  );

/**
 * The stack with the cast's character LoRAs for `family`: one joins at the top when its person comes in, keeps the
 * place, strength and switch it was given while the person stays, and goes when the person leaves or the family
 * changes. The user's own LoRAs are never touched. The same array comes back when nothing changes.
 */
export function syncCastLoras(
  loras: StackLora[],
  cast: Pick<Person, "savedId">[],
  saved: Pick<Saved, "id" | "loras">[],
  family: string | undefined,
): StackLora[] {
  const ids = [...new Set(cast.flatMap((c) => (c.savedId ? [c.savedId] : [])))];
  const wanted = ids.flatMap((id) =>
    (saved.find((s) => s.id === id)?.loras?.[family ?? ""] ?? []).map((l) => ({ ...l, on: true, from: id })),
  );
  // `saved` must be loaded: a character missing from it was deleted, and what it brought goes
  const has = (l: StackLora) => wanted.some((w) => w.from === l.from && w.name === l.name);
  const kept = loras.filter((l) => !l.from || has(l));
  const added = wanted.filter((w) => !kept.some((l) => l.from === w.from && l.name === w.name));
  const next = [...added, ...kept];
  return same(next, loras) ? loras : next;
}

/** A LoRA's index moved to `to`, for the stack's drag and its move up and down. */
export function moved<T>(xs: readonly T[], from: number, to: number): T[] {
  if (from === to || to < 0 || to >= xs.length) return [...xs];
  const out = [...xs];
  const [x] = out.splice(from, 1);
  out.splice(to, 0, x);
  return out;
}
