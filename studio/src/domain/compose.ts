import type { Person, Phrase, Recipe } from "@/domain/recipe";
import { PERSON_ROWS } from "@/domain/rows";

// The prompt as deterministic sentences, as Krea 2 reads its prompt with Qwen3-VL.

const cap = (s: string) => s && s[0].toUpperCase() + s.slice(1);
const NUM = ["", "One person", "Two people", "Three people", "Four people", "Five people"];
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
  // only people with something written count: a tab just added is nobody yet
  const described = r.cast.filter((c) => PERSON_ROWS.some((row) => on(c[row.id]).length));
  const many = described.length > 1;
  const people = described.map((c) => {
    const parts = [on(c.who), on(c.look), on(c.wear), on(c.doing)];
    const look = parts[1].length ? ` with ${and(parts[1])}` : "";
    const body = [
      (parts[0].join(", ") || "person") + look,
      parts[2].length && `wearing ${and(parts[2])}`,
      parts[3].join(", "),
    ]
      .filter(Boolean)
      .join(", ");
    const where = many ? place(c) : "";
    return cap(where ? `${where}, ${article(body)}` : article(body)) + ".";
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
  return [...lead, many ? NUM[described.length] + "." : "", ...people, ...scene, ...extra]
    .filter(Boolean)
    .join(" ");
}
