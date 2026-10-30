import { noun, nouns, type Gender } from "@/domain/presets/gender";
import type { Person, Phrase, Recipe } from "@/domain/recipe";
import { PERSON_ROWS } from "@/domain/rows";

// The prompt as deterministic sentences, as Krea 2 reads its prompt with Qwen3-VL.

const cap = (s: string) => s && s[0].toUpperCase() + s.slice(1);
const COUNT = ["", "one", "two", "three", "four", "five"];
const ORDINAL = ["first", "second", "third", "fourth", "fifth"];
const GENDER_WORD = /\b(woman|women|man|men|person|people|girl|boy|lady|guy|female|male)\b/i;
const and = (xs: string[]) =>
  xs.length < 2 ? xs.join("") : xs.slice(0, -1).join(", ") + " and " + xs.at(-1);
const article = (s: string) =>
  /^(a|an|the|one|two)\b/i.test(s) ? s : (/^[aeiou]/i.test(s) ? "an " : "a ") + s;

export function place(p: Person) {
  const side =
    p.side.length === 3
      ? "across the frame"
      : p.side.map((s) => (s === "center" ? "in the center" : `on the ${s}`)).join(" and ");
  const depth = { back: "in the background", front: "in the foreground", auto: "" }[p.depth];
  return [depth, side].filter(Boolean).join(" ");
}

/** "Two women and a man." */
function headcount(people: Person[]) {
  const by = (["woman", "man", "person"] as Gender[])
    .map((g) => [g, people.filter((p) => p.gender === g).length] as const)
    .filter(([, n]) => n);
  return cap(and(by.map(([g, n]) => (n === 1 ? article(noun(g)) : `${COUNT[n]} ${nouns(g)}`)))) + ".";
}

/** How the prompt tells one person from the others: the man, the woman on the left, the second woman. */
function reference(p: Person, people: Person[]) {
  const same = people.filter((c) => c.gender === p.gender);
  const n = noun(p.gender);
  if (same.length === 1) return `the ${n}`;
  const side = p.side.length === 1 ? p.side[0] : null;
  if (side && same.filter((c) => c.side.length === 1 && c.side[0] === side).length === 1)
    return side === "center" ? `the ${n} in the center` : `the ${n} on the ${side}`;
  return `the ${ORDINAL[same.indexOf(p)]} ${n}`;
}

/** What one person does, said of another: "them" and "their" become that person, or that person follows. */
export const onto = (text: string, b: string) =>
  /\b(them|their)\b/i.test(text)
    ? text.replace(/\btheir\b/gi, `${b}'s`).replace(/\bthem\b/gi, b)
    : `${text} ${b}`;

/** The prompt sent. pick gives the text for a phrase: its own, or one of its versions. */
export function compose(r: Recipe, triggers: string[], pick: (p: Phrase) => string = (p) => p.t) {
  const on = (ps: Phrase[]) =>
    ps
      .filter((p) => p.on && p.t.trim())
      .map((p) =>
        pick(p)
          .trim()
          .replace(/[\s.,;]+$/, ""),
      );
  // only people with something written, or something to do with another, count: a tab just added is nobody yet
  const here = new Set(r.cast.map((c) => c.id));
  const acts = r.together.filter((i) => here.has(i.from) && here.has(i.to) && on([i]).length);
  const described = r.cast.filter(
    (c) =>
      PERSON_ROWS.some((row) => on(c[row.id]).length) || acts.some((i) => i.from === c.id || i.to === c.id),
  );
  const many = described.length > 1;
  const people = described.map((c) => {
    const parts = [on(c.who), on(c.look), on(c.wear), on(c.doing)];
    // the gender is said once, unless a phrase already says it ("woman in her thirties")
    const who = parts[0].some((t) => GENDER_WORD.test(t)) ? parts[0] : [noun(c.gender), ...parts[0]];
    const look = parts[1].length ? ` with ${and(parts[1])}` : "";
    const body = [who.join(", ") + look, parts[2].length && `wearing ${and(parts[2])}`, parts[3].join(", ")]
      .filter(Boolean)
      .join(", ");
    const where = many ? place(c) : "";
    return cap(where ? `${where}, ${article(body)}` : article(body)) + ".";
  });
  const ref = (id: string) => {
    const p = described.find((c) => c.id === id);
    return p && reference(p, described);
  };
  const together = acts.flatMap((i) => {
    const [a, b, [t]] = [ref(i.from), ref(i.to), on([i])];
    return a && b && t ? [cap(`${a} ${onto(t, b)}`) + "."] : [];
  });
  const where = on(r.scene.where).join(", ");
  const scene = [
    where && `In ${article(where)}.`,
    ...[on(r.scene.shot), on(r.scene.style)]
      .map((x) => x.join(", "))
      .filter(Boolean)
      .map((s) => cap(s) + "."),
  ];
  const extra = on(r.scene.extra).map((s) => cap(s) + ".");
  const lead = triggers.filter(Boolean).map((t) => t.trim().replace(/[\s.]+$/, "") + "."); // verbatim: case can matter to a LoRA
  return [...lead, many ? headcount(described) : "", ...people, ...together, ...scene, ...extra]
    .filter(Boolean)
    .join(" ");
}
