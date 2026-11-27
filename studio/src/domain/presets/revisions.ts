// Built-in presets changed since they were first seeded: the key a device knows one by and the key it became, or
// null when it was dropped. A device follows a revision only for a preset the person left as it was
// (`revise` in domain/prompt-catalog.ts). Append only: a device may run every one of these at any later release.
export type Revision = { from: string; to: string | null };

/** The person's gender switch says the noun: an age is only the age. */
const age = (when: string): Revision => ({
  from: `who/Age/{noun} in {their} ${when}`,
  to: `who/Age/in {their} ${when}`,
});

export const REVISIONS: readonly Revision[] = [
  ...["early twenties", "mid twenties", "late twenties", "thirties", "forties", "fifties"].map(age),
  // a bathroom, with the others in Bathroom rather than in Home
  {
    from: "where/Home/minimalist bathroom with marble",
    to: "where/Bathroom/minimalist bathroom with marble",
  },
];
