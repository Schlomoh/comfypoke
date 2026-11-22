// A lookbook: the selected images on one PNG, a grid of cells, each captioned with its title (or prompt) and what it
// was made with. Drawn on the phone; nothing leaves it.
import { loadImage } from "@/data/db/renders";
import type { Space } from "@/data/db/space";
import { shortName } from "@/domain/format";
import type { Render } from "@/domain/render";

const CELL = { w: 480, h: 600, caption: 64, gap: 16 } as const; // a 4:5 box; others fit inside it
export const LOOKBOOK_MAX = 48;
const INK = "#e8e8ea";
const MUTED = "#8a8a90";

/** The text cut to fit `width`, with an ellipsis when it was cut. */
function fit(ctx: OffscreenCanvasRenderingContext2D, text: string, width: number) {
  if (ctx.measureText(text).width <= width) return text;
  let t = text;
  while (t && ctx.measureText(`${t}…`).width > width) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

// a photo from the device was not made with a model or seed; an edit says what it changed
const caption = (r: Render) => r.title ?? r.edit?.prompt ?? (r.uploaded ? `photo ${r.uploaded}` : r.prompt);
const detail = (r: Render) =>
  (r.uploaded && !r.edit
    ? [`${r.width}×${r.height}`]
    : [r.unet && shortName(r.unet), `${r.width}×${r.height}`, r.seed != null && `seed ${r.seed}`]
  )
    .filter(Boolean)
    .join(" · ");

export async function lookbook(space: Space, renders: Render[]): Promise<Blob> {
  const shown = renders.slice(0, LOOKBOOK_MAX);
  const cols = Math.min(4, Math.ceil(Math.sqrt(shown.length)));
  const rows = Math.ceil(shown.length / cols);
  const stepX = CELL.w + CELL.gap;
  const stepY = CELL.h + CELL.caption + CELL.gap;
  const canvas = new OffscreenCanvas(cols * stepX + CELL.gap, rows * stepY + CELL.gap);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot draw the lookbook.");
  ctx.fillStyle = "#0d0d0f";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  for (const [i, r] of shown.entries()) {
    const x = CELL.gap + (i % cols) * stepX;
    const y = CELL.gap + Math.floor(i / cols) * stepY;
    const bmp = await createImageBitmap(await loadImage(space, r.id));
    const scale = Math.min(CELL.w / bmp.width, CELL.h / bmp.height);
    const w = bmp.width * scale;
    const h = bmp.height * scale;
    ctx.drawImage(bmp, x + (CELL.w - w) / 2, y + (CELL.h - h) / 2, w, h);
    bmp.close();
    ctx.font = "500 17px ui-sans-serif, system-ui, sans-serif";
    ctx.fillStyle = INK;
    ctx.fillText(fit(ctx, caption(r), CELL.w), x, y + CELL.h + 26);
    ctx.font = "13px ui-monospace, monospace";
    ctx.fillStyle = MUTED;
    ctx.fillText(fit(ctx, detail(r), CELL.w), x, y + CELL.h + 48);
  }
  return canvas.convertToBlob({ type: "image/png" });
}
