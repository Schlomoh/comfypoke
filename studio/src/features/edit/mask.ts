// The mask of an edit as a list of steps: areas SAM found by text, brush and eraser strokes, invert and clear.
// Kept as steps, not pixels, so undo is dropping the last one, a found area can be taken out again, and the mask
// is drawn at any size: small over the stage, at the image's own size when it is sent (maskPng).
import type { At } from "@/features/stage/zoom-view";

/** A stroke's width and points are fractions of the image's width and height. */
export type Stroke = { size: number; points: At[]; erase: boolean };
export type Op =
  | { kind: "found"; id: string; text: string; area: ImageBitmap } // white where found, transparent elsewhere
  | ({ kind: "stroke" } & Stroke)
  | { kind: "invert" }
  | { kind: "clear" };

export function drawStroke(ctx: OffscreenCanvasRenderingContext2D, s: Stroke, w: number, h: number) {
  ctx.globalCompositeOperation = s.erase ? "destination-out" : "source-over";
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = s.size * w;
  const [first, ...rest] = s.points;
  ctx.beginPath();
  ctx.moveTo(first[0] * w, first[1] * h);
  for (const [x, y] of rest.length ? rest : [first]) ctx.lineTo(x * w, y * h); // a tap is a dot: the round cap
  ctx.stroke();
}

/** The mask as white over transparent, in whatever color is set as fill and stroke. */
export function drawOps(ctx: OffscreenCanvasRenderingContext2D, ops: Op[], w: number, h: number) {
  for (const op of ops) {
    if (op.kind === "stroke") drawStroke(ctx, op, w, h);
    else if (op.kind === "clear") ctx.clearRect(0, 0, w, h);
    else if (op.kind === "invert") {
      ctx.globalCompositeOperation = "xor"; // with a full fill, every pixel's coverage becomes 1 - itself
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.globalCompositeOperation = "source-over";
      ctx.drawImage(op.area, 0, 0, w, h);
    }
  }
  ctx.globalCompositeOperation = "source-over";
}

/** Whether the steps leave anything to replace; erasing everything by hand still counts, the server then says so. */
export function hasArea(ops: Op[]) {
  let on = false;
  for (const op of ops) {
    if (op.kind === "clear") on = false;
    else if (op.kind === "found" || op.kind === "invert" || !op.erase) on = true; // inverting leaves something unless it was all
  }
  return on;
}

/** What /api/mask sends back (white on black) as an area: white where found, transparent elsewhere; null when
 * nothing was found. */
export async function areaOf(b64: string): Promise<ImageBitmap | null> {
  const img = await createImageBitmap(await (await fetch(`data:image/png;base64,${b64}`)).blob());
  const c = new OffscreenCanvas(img.width, img.height);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the mask.");
  ctx.drawImage(img, 0, 0);
  const px = ctx.getImageData(0, 0, img.width, img.height);
  let any = false;
  for (let i = 0; i < px.data.length; i += 4) {
    any ||= px.data[i] > 0;
    px.data[i + 3] = px.data[i];
    px.data[i] = px.data[i + 1] = px.data[i + 2] = 255;
  }
  if (!any) return null;
  ctx.putImageData(px, 0, 0);
  return c.transferToImageBitmap();
}

/** The mask as the server wants it: white where to replace, on black, at the image's size. */
export async function maskPng(ops: Op[], width: number, height: number) {
  const c = new OffscreenCanvas(width, height);
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the mask.");
  ctx.fillStyle = ctx.strokeStyle = "#fff";
  drawOps(ctx, ops, width, height);
  ctx.globalCompositeOperation = "destination-over";
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  return c.convertToBlob({ type: "image/png" });
}
