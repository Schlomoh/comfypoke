// The Edit tab's People: everyone on an image, found by their faces (/api/faces), each told who they are, and edited
// together in one render (/api/people): an outfit from their Wearing row, their face redrawn, or both.

/** A face found on an image: its box in the image's pixels (x0, y0, x1, y1), and the cast's person it was taken for
 * by face photo or side, by their place in the cast sent, or null. */
export type Found = { box: [number, number, number, number]; guess: number | null };

// comfy_nodes/studio_face/assign.py: each face's box is one gray level, LEVEL apart; levels 1 to PEOPLE are the people
// sent, those after are faces nobody was taken for.
const LEVEL = 25;
const PEOPLE = 4;

/** The faces in the finder's label image (its RGBA pixels), left to right. */
export function facesOf(px: Uint8ClampedArray, width: number): Found[] {
  const boxes = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < px.length; i += 4) {
    const level = Math.round(px[i] / LEVEL);
    if (!level) continue;
    const x = (i / 4) % width;
    const y = Math.floor(i / 4 / width);
    const b = boxes.get(level);
    if (b)
      boxes.set(level, [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x + 1), Math.max(b[3], y + 1)]);
    else boxes.set(level, [x, y, x + 1, y + 1]);
  }
  return [...boxes]
    .map(([level, box]): Found => ({ box, guess: level <= PEOPLE ? level - 1 : null }))
    .toSorted((a, b) => a.box[0] - b.box[0]);
}

/** What is done to one face found: who it is (a cast person's id, or null to leave it), whether they get an outfit
 * from their Wearing row and over which part, and whether their face is redrawn. */
export type Pick = { who: string | null; outfit: boolean; part: string; face: boolean };

/** One render per outfit version, side by side: the nth takes everyone's nth, and someone with fewer keeps their last.
 * `lists` holds each dressed person's outfits; none dressed is one render with nothing. */
export function sideBySide<T>(lists: T[][]): T[][] {
  const n = Math.max(1, ...lists.map((l) => l.length));
  return Array.from({ length: n }, (_, i) => lists.map((l) => l[Math.min(i, l.length - 1)]));
}

/** "Dress Mia and Ana, redraw 2 faces": what a People edit does, for its button and its record. */
export function peopleSaid(dressed: string[], faces: number) {
  const names = dressed.length > 2 ? `${dressed.length} people` : dressed.join(" and ");
  const parts = [
    dressed.length ? `dress ${names}` : "",
    faces ? `redraw ${faces} face${faces === 1 ? "" : "s"}` : "",
  ];
  const said = parts.filter(Boolean).join(", ");
  return said && said[0].toUpperCase() + said.slice(1);
}
