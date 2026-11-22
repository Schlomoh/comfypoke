import { describe, expect, it } from "vitest";

import { outfits } from "@/domain/outfits";
import { newPerson, phrase } from "@/domain/recipe";

const wearing = (...ps: ReturnType<typeof phrase>[]) => ({ ...newPerson("Ana"), wear: ps });

describe("outfits", () => {
  it("is nothing for an empty row", () => expect(outfits(wearing())).toEqual([]));
  it("joins the phrases into one outfit", () =>
    expect(outfits(wearing(phrase("a red coat"), phrase("jeans")))).toEqual(["a red coat, jeans"]));
  it("makes one outfit per version", () =>
    expect(outfits(wearing(phrase("a red coat", ["a blue coat"]), phrase("jeans")))).toEqual([
      "a red coat, jeans",
      "a blue coat, jeans",
    ]));
  it("multiplies versions of two phrases", () =>
    expect(outfits(wearing(phrase("coat", ["parka"]), phrase("jeans", ["skirt"])))).toHaveLength(4));
  it("leaves out switched-off and empty phrases", () =>
    expect(outfits(wearing({ ...phrase("hat"), on: false }, phrase("  "), phrase("boots")))).toEqual([
      "boots",
    ]));
});
