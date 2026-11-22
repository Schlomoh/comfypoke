// What one person does with another. Each is said of the first person, and "them" and "their" stand for
// the second: compose puts that person's reference in their place, or after a phrase that has neither.
import type { Group } from "@/domain/presets/gender";

export const TOGETHER: readonly Group[] = [
  {
    name: "Close",
    items: [
      "has an arm around them",
      "hugs them from behind",
      "stands close behind them",
      "leans against them",
      "rests against their shoulder",
      "sits beside them",
      "sits on their lap",
      "lies next to them",
      "stands back to back with them",
    ],
  },
  {
    name: "Touch",
    items: [
      "holds their hand",
      "cups their face",
      "touches their arm",
      "brushes hair from their face",
      "has a hand on their waist",
      "kisses them on the cheek",
      "kisses them",
    ],
  },
  {
    name: "Gaze",
    items: [
      "looks at them",
      "smiles at them",
      "looks into their eyes",
      "watches them, smiling",
      "glances back at them",
    ],
  },
  { name: "Talk", items: ["whispers to them", "laughs with them", "talks to them", "listens to them"] },
  {
    name: "Help",
    items: [
      "helps them with a zipper",
      "ties their hair up",
      "does their makeup",
      "fixes their collar",
      "adjusts their strap",
      "helps them into a robe",
    ],
  },
  {
    name: "Play",
    items: [
      "pulls them by the hand",
      "dances with them",
      "carries them piggyback",
      "tickles them",
      "throws a pillow at them",
      "takes a photo of them",
    ],
  },
];
