import { describe, expect, it } from "vitest";

import { portrait } from "@/domain/compose";
import { newPerson, phrase } from "@/domain/recipe";

const mia = {
  ...newPerson("Mia"),
  gender: "woman" as const,
  who: [phrase("in her thirties")],
  look: [phrase("red hair")],
  wear: [phrase("a green coat"), { ...phrase("a hat"), on: false }],
  doing: [phrase("running")],
};

describe("portrait", () => {
  it("says who, look and wearing, never doing", () =>
    expect(portrait(mia)).toBe("A woman, in her thirties with red hair, wearing a green coat."));
  it("wears the outfit given in place of the row", () =>
    expect(portrait(mia, ["a red dress", "boots"])).toBe(
      "A woman, in her thirties with red hair, wearing a red dress and boots.",
    ));
  it("leaves the clothes out when the outfit is empty", () =>
    expect(portrait(mia, [])).toBe("A woman, in her thirties with red hair."));
  it("is empty when nothing is written", () => expect(portrait(newPerson("Ana"))).toBe(""));
});
