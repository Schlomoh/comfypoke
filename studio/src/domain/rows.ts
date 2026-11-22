// The rows a person and the scene are written in, and the Together list of who does what with whom.
// Their built-in presets are in presets/.
export const PERSON_ROWS = [
  { id: "who", label: "Who", hint: "age, build, skin" },
  { id: "look", label: "Look", hint: "hair, face" },
  { id: "wear", label: "Wearing", hint: "clothes" },
  { id: "doing", label: "Doing", hint: "pose, expression" },
] as const;
export const SCENE_ROWS = [
  { id: "where", label: "Where", hint: "setting" },
  { id: "shot", label: "Shot", hint: "framing, light" },
  { id: "style", label: "Style", hint: "medium, finish" },
  { id: "extra", label: "Extra", hint: "anything else, verbatim" },
] as const;
export const TOGETHER = { id: "together", label: "Together", hint: "what one does with another" } as const;

export type PersonRow = (typeof PERSON_ROWS)[number]["id"];
export type SceneRow = (typeof SCENE_ROWS)[number]["id"];
export type RowId = PersonRow | SceneRow;
/** A row presets are offered in: one of a person's or the scene's, or Together. */
export type PresetRow = RowId | typeof TOGETHER.id;
export const ROWS: readonly { id: RowId; label: string; hint: string }[] = [...PERSON_ROWS, ...SCENE_ROWS];
export const PRESET_ROWS: readonly { id: PresetRow; label: string; hint: string }[] = [...ROWS, TOGETHER];
