// What a person is doing: pose, hands, expression and where they look.
import type { Group } from "@/domain/presets/gender";

export const DOING: readonly Group[] = [
  {
    name: "Standing",
    items: [
      "standing, weight on one hip",
      "standing with arms relaxed",
      "leaning against a wall",
      "walking toward the camera",
      "turned away, looking over the shoulder",
      "standing by the window",
      "arms loosely crossed",
    ],
  },
  {
    name: "Sitting",
    items: [
      "sitting on the edge of the bed",
      "sitting cross-legged on the floor",
      "curled up on the sofa",
      "perched on a stool",
      "sitting on a stool, leaning forward",
    ],
  },
  {
    name: "Lying",
    items: [
      "lying on the bed, propped on one elbow",
      "lying on {their} back, looking up",
      "lying on {their} stomach, feet up",
      "stretched out on the sofa",
    ],
  },
  {
    name: "Moving",
    items: [
      "mid-stride",
      "stretching {their} arms overhead",
      "turning, hair in motion",
      "pulling on a shirt",
      "dancing loosely",
    ],
  },
  {
    name: "Hands",
    items: [
      "hands in {their} hair",
      "adjusting a strap",
      "hand resting on {their} hip",
      "holding a coffee mug",
      "fingers touching {their} collarbone",
      "thumb hooked in {their} waistband",
      "running a hand through {their} hair",
    ],
  },
  {
    name: "Expression",
    items: [
      "soft smile",
      "confident gaze into the camera",
      "laughing naturally",
      "calm, neutral expression",
      "looking away, relaxed",
      "playful grin",
      "serious, editorial look",
      "eyes closed, relaxed",
    ],
  },
  {
    name: "Gaze",
    items: [
      "looking straight into the camera",
      "looking off-camera",
      "looking down",
      "glancing over {their} shoulder",
    ],
  },
];
