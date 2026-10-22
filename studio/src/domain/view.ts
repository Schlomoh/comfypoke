// The zoom shared by the stage and the viewer: a scale and the point of the image at the center of the
// frame, as fractions, so it stays put when the image changes.
export type View = { scale: number | null; cx: number; cy: number }; // scale: screen px per image px; null fits
export const FIT: View = { scale: null, cx: 0.5, cy: 0.5 };
