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

/** A PNG that came back (base64) as a Blob, to show or send on. */
export const pngBlob = async (b64: string) => (await fetch(`data:image/png;base64,${b64}`)).blob();

/** A PNG (base64) as RGBA pixels, with its size. */
export async function pixelsOf(b64: string) {
  const img = await createImageBitmap(await pngBlob(b64));
  const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d");
  if (!ctx) throw new Error("This browser cannot read what came back.");
  ctx.drawImage(img, 0, 0);
  return { px: ctx.getImageData(0, 0, img.width, img.height).data, width: img.width, height: img.height };
}

/** `n` white-on-black masks side by side (StudioMaskStrip, or one from /api/mask) cut apart, each as an area: white
 * where found, its coverage as alpha; null for one where nothing was found. */
export function splitStrip(px: Uint8ClampedArray, width: number, height: number, n: number) {
  const w = Math.floor(width / n);
  return Array.from({ length: n }, (_, k) => {
    const out = new Uint8ClampedArray(w * height * 4);
    let any = false;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < w; x++) {
        const v = px[(y * width + k * w + x) * 4];
        const i = (y * w + x) * 4;
        any ||= v > 0;
        out[i] = out[i + 1] = out[i + 2] = 255;
        out[i + 3] = v;
      }
    return any ? out : null;
  });
}

/** What came back as `n` areas, ready to draw; null for one where nothing was found. */
export async function areasOf(b64: string, n: number): Promise<(ImageBitmap | null)[]> {
  const { px, width, height } = await pixelsOf(b64);
  const w = Math.floor(width / n);
  return Promise.all(
    splitStrip(px, width, height, n).map((a) =>
      a ? createImageBitmap(new ImageData(a, w, height)) : Promise.resolve(null),
    ),
  );
}

/** What /api/mask sends back (white on black) as an area; null when nothing was found. */
export const areaOf = async (b64: string) => (await areasOf(b64, 1))[0];

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
