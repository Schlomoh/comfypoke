// The rows a person and the scene are written in, and the built-in presets offered in each.
export const PERSON_ROWS = [
  { id: "who", label: "Who", hint: "who she is" },
  { id: "look", label: "Look", hint: "face, hair" },
  { id: "wear", label: "Wearing", hint: "clothes" },
  { id: "doing", label: "Doing", hint: "pose, expression" },
] as const;
export const SCENE_ROWS = [
  { id: "where", label: "Where", hint: "setting" },
  { id: "shot", label: "Shot", hint: "framing, light" },
  { id: "style", label: "Style", hint: "medium, finish" },
  { id: "extra", label: "Extra", hint: "anything else, verbatim" },
] as const;
export type PersonRow = (typeof PERSON_ROWS)[number]["id"];
export type SceneRow = (typeof SCENE_ROWS)[number]["id"];
export type RowId = PersonRow | SceneRow;
export const ROWS: readonly { id: RowId; label: string; hint: string }[] = [...PERSON_ROWS, ...SCENE_ROWS];

// The built-in presets by row and subcategory: women, real-life scenes, underwear and lingerie
// campaigns. One idea each. Your own presets are in IndexedDB and shown first, as Yours.
export const PRESETS: Record<RowId, Record<string, string[]>> = {
  who: {
    Age: [
      "woman in her early twenties",
      "woman in her mid twenties",
      "woman in her thirties",
      "woman in her forties",
    ],
    Build: [
      "slim build",
      "athletic build",
      "curvy build",
      "petite frame",
      "tall and long-legged",
      "plus-size figure",
      "soft natural body",
    ],
    Skin: [
      "fair skin with freckles",
      "light olive skin",
      "warm tan skin",
      "golden brown skin",
      "deep brown skin",
      "natural skin texture, visible pores",
    ],
    Background: [
      "Scandinavian features",
      "Mediterranean features",
      "East Asian features",
      "South Asian features",
      "Latina features",
      "Black woman",
      "mixed heritage",
    ],
    Presence: [
      "natural, approachable look",
      "confident model presence",
      "relaxed and candid",
      "editorial poise",
    ],
  },
  look: {
    Hair: [
      "long straight hair",
      "long loose waves",
      "shoulder-length wavy hair",
      "sleek bob",
      "pixie cut",
      "curly hair",
      "high ponytail",
      "messy low bun",
      "hair tucked behind one ear",
    ],
    "Hair color": [
      "platinum blonde",
      "honey blonde",
      "light brown",
      "chestnut brown",
      "dark brown",
      "jet black",
      "auburn",
      "copper red",
    ],
    Face: ["green eyes", "hazel eyes", "brown eyes", "light freckles", "defined brows", "soft smile lines"],
    Makeup: [
      "no-makeup look",
      "dewy natural makeup",
      "soft glam makeup",
      "bold red lips",
      "nude lip gloss",
      "subtle winged liner",
    ],
    Details: [
      "delicate gold necklace",
      "small hoop earrings",
      "fine-line tattoo on the forearm",
      "short natural nails",
      "manicured nude nails",
    ],
  },
  wear: {
    Bras: [
      "lace balcony bra",
      "cotton triangle bralette",
      "seamless t-shirt bra",
      "plunge bra",
      "strapless bandeau",
      "longline lace bralette",
      "soft-cup sports bra",
    ],
    Bottoms: [
      "high-waisted briefs",
      "cotton bikini briefs",
      "lace briefs",
      "seamless briefs",
      "high-cut briefs",
      "boyshorts",
    ],
    Sets: [
      "matching lace lingerie set",
      "ribbed cotton bralette and briefs",
      "satin slip dress",
      "lace bodysuit",
      "silk camisole and shorts",
      "ribbed loungewear set",
    ],
    Layers: [
      "oversized white button-down shirt",
      "open silk robe",
      "cropped knit cardigan",
      "loose linen shirt",
      "cotton bathrobe",
    ],
    Color: ["in black", "in ivory", "in white", "in nude tones", "in sage green", "in dusty rose", "in navy"],
    Fabric: ["ribbed cotton", "fine lace", "soft satin", "sheer mesh panels", "brushed modal", "silk"],
  },
  doing: {
    Standing: [
      "standing, weight on one hip",
      "standing with arms relaxed",
      "leaning against a wall",
      "walking toward the camera",
      "turned away, looking over the shoulder",
      "standing by the window",
    ],
    Sitting: [
      "sitting on the edge of the bed",
      "sitting cross-legged on the floor",
      "curled up on the sofa",
      "perched on a stool",
    ],
    Hands: [
      "hands in her hair",
      "adjusting a strap",
      "hand resting on her hip",
      "holding a coffee mug",
      "fingers touching her collarbone",
    ],
    Expression: [
      "soft smile",
      "confident gaze into the camera",
      "laughing naturally",
      "calm, neutral expression",
      "looking away, relaxed",
    ],
  },
  where: {
    Home: [
      "sunlit bedroom with white linen",
      "minimalist bathroom with marble",
      "cozy living room sofa",
      "kitchen in morning light",
      "walk-in wardrobe",
    ],
    Studio: [
      "seamless white backdrop",
      "warm beige backdrop",
      "textured plaster wall",
      "soft grey backdrop",
      "colored paper backdrop",
    ],
    Hotel: ["boutique hotel room", "by a tall window with sheer curtains", "hotel bed with crisp sheets"],
    Outdoor: [
      "beach at golden hour",
      "rooftop terrace",
      "poolside on a sun lounger",
      "garden with soft shade",
    ],
  },
  shot: {
    Framing: [
      "full body shot",
      "three-quarter body shot",
      "waist-up shot",
      "close-up of the fabric detail",
      "back view",
    ],
    Angle: ["eye-level camera", "slightly low angle", "overhead shot", "mirror reflection"],
    Light: [
      "soft window light",
      "golden hour sunlight",
      "bright high-key studio light",
      "soft diffused flash",
      "moody low-key light",
      "dappled shadows",
    ],
    Lens: ["50mm lens", "85mm lens, shallow depth of field", "35mm, environmental"],
  },
  style: {
    Photo: [
      "e-commerce catalog photo",
      "lingerie campaign editorial",
      "candid lifestyle photo",
      "film photo with natural grain",
      "instant film snapshot",
    ],
    Finish: [
      "true-to-life colors",
      "natural skin texture, no retouching",
      "muted pastel grade",
      "warm color grade",
      "high-contrast black and white",
    ],
  },
  extra: {},
};
