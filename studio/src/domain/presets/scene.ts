// The scene: where it is, how it is shot and how it looks.
import type { Group } from "@/domain/presets/gender";

export const WHERE: readonly Group[] = [
  {
    name: "Home",
    items: [
      "sunlit bedroom with white linen",
      "cozy living room sofa",
      "kitchen in morning light",
      "walk-in wardrobe",
      "unmade bed with rumpled sheets",
    ],
  },
  {
    name: "Bathroom",
    items: [
      "minimalist bathroom with marble",
      "steamy bathroom mirror",
      "freestanding bathtub",
      "rain shower with glass walls",
      "vanity with warm bulbs",
    ],
  },
  {
    name: "Studio",
    items: [
      "seamless white backdrop",
      "warm beige backdrop",
      "textured plaster wall",
      "soft grey backdrop",
      "colored paper backdrop",
    ],
  },
  {
    name: "Hotel",
    items: ["boutique hotel room", "by a tall window with sheer curtains", "hotel bed with crisp sheets"],
  },
  {
    name: "Urban",
    items: [
      "city apartment with a view",
      "industrial loft with brick walls",
      "balcony at night, city lights",
      "fire escape",
    ],
  },
  {
    name: "Outdoor",
    items: ["beach at golden hour", "rooftop terrace", "poolside on a sun lounger", "garden with soft shade"],
  },
  {
    name: "Nature",
    items: ["sand dunes", "forest clearing", "rocky coastline", "wildflower meadow", "lakeside dock"],
  },
];

export const SHOT: readonly Group[] = [
  {
    name: "Framing",
    items: [
      "full body shot",
      "three-quarter body shot",
      "waist-up shot",
      "close-up of the fabric detail",
      "back view",
      "tight portrait",
    ],
  },
  {
    name: "Angle",
    items: [
      "eye-level camera",
      "slightly low angle",
      "overhead shot",
      "mirror reflection",
      "high angle",
      "side profile",
    ],
  },
  {
    name: "Composition",
    items: [
      "centered composition",
      "subject off-center, negative space",
      "shot through a doorway",
      "foreground blur",
    ],
  },
  {
    name: "Light",
    items: [
      "soft window light",
      "golden hour sunlight",
      "bright high-key studio light",
      "soft diffused flash",
      "moody low-key light",
      "dappled shadows",
      "hard direct flash",
      "rim light",
    ],
  },
  { name: "Time", items: ["early morning", "midday sun", "blue hour", "late at night"] },
  {
    name: "Lens",
    items: ["50mm lens", "85mm lens, shallow depth of field", "35mm, environmental", "wide-angle 24mm"],
  },
];

export const STYLE: readonly Group[] = [
  {
    name: "Photo",
    items: [
      "e-commerce catalog photo",
      "lingerie campaign editorial",
      "candid lifestyle photo",
      "film photo with natural grain",
      "instant film snapshot",
      "fashion magazine editorial",
    ],
  },
  {
    name: "Film",
    items: ["Kodak Portra 400 look", "Fujifilm color", "Ilford black and white", "35mm point-and-shoot"],
  },
  {
    name: "Mood",
    items: [
      "intimate and quiet",
      "playful and bright",
      "sultry and moody",
      "fresh and airy",
      "lazy Sunday morning",
    ],
  },
  {
    name: "Finish",
    items: [
      "true-to-life colors",
      "natural skin texture, no retouching",
      "muted pastel grade",
      "warm color grade",
      "high-contrast black and white",
    ],
  },
];
