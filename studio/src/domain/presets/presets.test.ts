import { describe, expect, it } from "vitest";

import { isOffered, MORE, presetGroups } from "@/domain/presets";

const items = (groups: [string, string[]][], name: string) => groups.find(([g]) => g === name)?.[1];

describe("presetGroups", () => {
  it("adds your own to the subcategory they were added in, at its end", () => {
    const bras = items(presetGroups("wear", "woman", [{ text: "silk bra", group: "Bras" }]), "Bras");
    expect(bras?.at(-1)).toBe("silk bra");
    expect(bras?.[0]).toBe("lace balcony bra");
  });
  it("has no Yours: ungrouped ones go to More, after the built-in subcategories", () => {
    const groups = presetGroups("wear", "woman", [{ text: "old one" }]);
    expect(groups.map(([g]) => g)).not.toContain("Yours");
    expect(groups.at(-1)).toEqual([MORE, ["old one"]]);
  });
  it("hides a removed built-in one, and keeps its subcategory", () => {
    const groups = presetGroups("wear", "woman", [{ text: "lace balcony bra", group: "Bras", hidden: true }]);
    expect(items(groups, "Bras")).not.toContain("lace balcony bra");
    expect(isOffered("wear", "woman", "lace balcony bra", [{ text: "lace balcony bra", hidden: true }])).toBe(
      false,
    );
  });
  it("starts a subcategory that is not built in", () =>
    expect(
      items(presetGroups("wear", "man", [{ text: "a grey suit", group: "Outfits" }]), "Outfits"),
    ).toEqual(["a grey suit"]));
  it("offers a row without built-in ones what was added to it", () =>
    expect(presetGroups("extra", "person", [{ text: "film grain" }])).toEqual([[MORE, ["film grain"]]]));
});

describe("presetGroups, a repeat", () => {
  it("offers a text once, in the subcategory it is first in", () => {
    const groups = presetGroups("wear", "woman", [{ text: "plunge bra" }]);
    expect(groups.filter(([, xs]) => xs.includes("plunge bra")).map(([g]) => g)).toEqual(["Bras"]);
  });
});
