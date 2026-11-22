// What a person wears: underwear and lingerie campaigns first, then what goes over and around them.
import type { Group } from "@/domain/presets/gender";

export const WEAR: readonly Group[] = [
  {
    name: "Bras",
    only: ["woman"],
    items: [
      "lace balcony bra",
      "cotton triangle bralette",
      "seamless t-shirt bra",
      "plunge bra",
      "strapless bandeau",
      "longline lace bralette",
      "soft-cup sports bra",
    ],
  },
  {
    name: "Bottoms",
    only: ["woman"],
    items: [
      "high-waisted briefs",
      "cotton bikini briefs",
      "lace briefs",
      "seamless briefs",
      "high-cut briefs",
      "boyshorts",
    ],
  },
  {
    name: "Sets",
    only: ["woman"],
    items: [
      "matching lace lingerie set",
      "ribbed cotton bralette and briefs",
      "satin slip dress",
      "lace bodysuit",
      "silk camisole and shorts",
      "ribbed loungewear set",
    ],
  },
  {
    name: "Underwear",
    only: ["man"],
    items: [
      "black boxer briefs",
      "white cotton briefs",
      "grey trunks",
      "ribbed cotton boxer briefs",
      "loose cotton boxers",
      "trunks with a wide logo waistband",
    ],
  },
  {
    name: "Underwear",
    only: ["person"],
    items: [
      "cotton boxer briefs",
      "seamless briefs",
      "high-waisted briefs",
      "ribbed tank and briefs set",
      "sports bralette and shorts",
    ],
  },
  {
    name: "Undershirts",
    only: ["man", "person"],
    items: ["white ribbed tank top", "fitted crew-neck undershirt", "v-neck undershirt"],
  },

  {
    name: "Loungewear",
    items: [
      "cotton jogger pants",
      "oversized hoodie",
      "soft lounge shorts",
      "waffle-knit long-sleeve top",
      "knit socks",
    ],
  },
  {
    name: "Sleepwear",
    only: ["woman"],
    items: ["silk pajama set", "satin nightgown", "oversized sleep shirt"],
  },
  {
    name: "Sleepwear",
    only: ["man", "person"],
    items: ["flannel pajama pants", "cotton pajama set", "sleep shorts and a t-shirt"],
  },
  {
    name: "Swimwear",
    only: ["woman"],
    items: ["triangle bikini", "one-piece swimsuit", "high-waisted bikini"],
  },
  { name: "Swimwear", only: ["man"], items: ["swim trunks", "square-cut swim shorts", "board shorts"] },
  { name: "Swimwear", only: ["person"], items: ["one-piece swimsuit", "swim shorts"] },
  {
    name: "Layers",
    items: [
      "oversized white button-down shirt",
      "open silk robe",
      "cropped knit cardigan",
      "loose linen shirt",
      "cotton bathrobe",
      "unbuttoned denim shirt",
    ],
  },
  {
    name: "Color",
    items: [
      "in black",
      "in ivory",
      "in white",
      "in nude tones",
      "in sage green",
      "in dusty rose",
      "in navy",
      "in charcoal",
      "in terracotta",
    ],
  },
  {
    name: "Fabric",
    items: [
      "ribbed cotton",
      "fine lace",
      "soft satin",
      "sheer mesh panels",
      "brushed modal",
      "silk",
      "waffle knit",
    ],
  },
];
