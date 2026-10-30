// A person's gender, and the words a preset takes from it. A preset is written once as a template:
// {noun} is woman, man or person; {their} her, his or their; {latin} Latina, Latino or
// Latin American.
export type Gender = "woman" | "man" | "person";
export const GENDERS: readonly Gender[] = ["woman", "man", "person"];

/** A subcategory of presets; `only` keeps it to the genders it fits (bras, facial hair). */
export type Group = { name: string; items: readonly string[]; only?: readonly Gender[] };

const WORDS: Record<Gender, Record<string, string>> = {
  woman: { noun: "woman", nouns: "women", their: "her", latin: "Latina" },
  man: { noun: "man", nouns: "men", their: "his", latin: "Latino" },
  person: { noun: "person", nouns: "people", their: "their", latin: "Latin American" },
};

export const noun = (g: Gender) => WORDS[g].noun;
export const nouns = (g: Gender) => WORDS[g].nouns;

/** A preset as written for one gender. */
export const fill = (template: string, g: Gender) =>
  template.replace(/\{(noun|their|latin)\}/g, (_, w: string) => WORDS[g][w] ?? w);

export const isGendered = (template: string) => /\{(noun|their|latin)\}/.test(template);
