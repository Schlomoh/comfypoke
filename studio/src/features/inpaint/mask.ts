// The mask as strokes. They are kept as fractions of the image, so the mask is drawn again at the image's
// own size when it is sent (maskPng), whatever size it was painted at.

/** One stroke: its width and points as fractions of the image's width and height. */
export type Stroke = { size: number; points: [number, number][] };

export function draw(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  strokes: Stroke[],
  w: number,
  h: number,
) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of strokes) {
    const [first, ...rest] = s.points;
    ctx.lineWidth = s.size * w;
    ctx.beginPath();
    ctx.moveTo(first[0] * w, first[1] * h);
    // a tap is a dot: a path back to where it started draws the round cap
    for (const [x, y] of rest.length ? rest : [first]) ctx.lineTo(x * w, y * h);
    ctx.stroke();
  }
}

/** The mask as the server wants it: white where to repaint, on black, at the image's size. */
export async function maskPng(strokes: Stroke[], width: number, height: number) {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the mask.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "#fff";
  draw(ctx, strokes, width, height);
  return canvas.convertToBlob({ type: "image/png" });
}
