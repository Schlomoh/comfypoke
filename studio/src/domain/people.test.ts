import { describe, expect, it } from "vitest";

import { facesOf, peopleSaid, sideBySide } from "@/domain/people";

/** A label image `w` wide with rectangles filled at gray levels, as RGBA. */
function labels(w: number, h: number, boxes: [number, [number, number, number, number]][]) {
  const px = new Uint8ClampedArray(w * h * 4);
  for (const [level, [x0, y0, x1, y1]] of boxes)
    for (let y = y0; y < y1; y++)
      for (let x = x0; x < x1; x++) px.fill(level * 25, (y * w + x) * 4, (y * w + x) * 4 + 3);
  return px;
}

describe("facesOf", () => {
  it("reads each face's box and whose it is, left to right", () => {
    const px = labels(20, 10, [
      [2, [12, 1, 16, 5]], // the second person sent, on the right
      [5, [2, 2, 6, 6]], // a face nobody was taken for
      [1, [7, 1, 10, 4]],
    ]);
    expect(facesOf(px, 20)).toEqual([
      { box: [2, 2, 6, 6], guess: null },
      { box: [7, 1, 10, 4], guess: 0 },
      { box: [12, 1, 16, 5], guess: 1 },
    ]);
  });

  it("finds nothing on black", () => {
    expect(facesOf(new Uint8ClampedArray(4 * 4 * 4), 4)).toEqual([]);
  });
});

describe("sideBySide", () => {
  it("pairs the nth outfits and keeps the last of a shorter row", () => {
    expect(
      sideBySide([
        ["a1", "a2", "a3"],
        ["b1", "b2"],
      ]),
    ).toEqual([
      ["a1", "b1"],
      ["a2", "b2"],
      ["a3", "b2"],
    ]);
  });

  it("is one render when nobody is dressed", () => {
    expect(sideBySide([])).toEqual([[]]);
  });
});

describe("peopleSaid", () => {
  it("says who is dressed and how many faces", () => {
    expect(peopleSaid(["Mia"], 2)).toBe("Dress Mia, redraw 2 faces");
    expect(peopleSaid(["Mia", "Ana"], 0)).toBe("Dress Mia and Ana");
    expect(peopleSaid([], 1)).toBe("Redraw 1 face");
    expect(peopleSaid(["A", "B", "C"], 0)).toBe("Dress 3 people");
  });
});
