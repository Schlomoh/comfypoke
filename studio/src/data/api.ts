// The studio endpoint (comfy_modal/studio_api.py). Same origin, so the key cookie rides along.
import type { Catalog } from "@/domain/catalog";
import type { Hold, Lora, Params } from "@/domain/render";
import type { Pass } from "@/domain/setup";

export type Request = Omit<Params, "family" | "seed" | "steps" | "cfg" | "reference" | "finish"> & {
  finish?: (Pass & { denoise: number }) | null; // a second pass with a saved setup
  family: string | null;
  seed: number | null;
  steps: number | null;
  cfg: number | null;
  stop_after?: boolean; // stop the GPU once the queue is empty; the latest request decides, absent leaves it as it is
  reference?: ImageRef; // face photo the head swap puts on the person
};
/** An upscale: SeedVR2 to `megapixels`, with an optional prompt retouch at the image's own size first. */
export type UpscaleRequest = {
  image: ImageRef; // PNG
  megapixels: number;
  seed?: number | null;
  retouch?: {
    unet: string;
    family: string | null;
    prompt: string;
    negative: string;
    loras: Lora[];
    denoise: number;
  } | null;
  stop_after?: boolean;
};
export const UPSCALE_MEGAPIXELS = [2, 4, 8] as const; // as graphs.UPSCALE_MEGAPIXELS on the server
export const FACE_FAMILIES: readonly string[] = ["krea2"]; // as graphs.HEADSWAP_FAMILIES: the head swap is a Krea 2 LoRA
/** Repaint the masked part of an image with the settings it was made with (graphs.inpaint). */
export type InpaintRequest = Pick<Params, "unet" | "prompt" | "negative" | "loras"> & {
  family: string | null;
  steps: number | null; // null: the model's default
  cfg: number | null;
  seed: number | null;
  image: ImageRef; // PNG
  mask: ImageRef; // PNG of the image's size, white where to repaint
  target: string; // what the mask was found as, recorded only; the mask is what is replaced
  reference?: ImageRef; // face photo
  stop_after?: boolean;
  dress?: DressRequest; // replace the clothes against the body's mesh (graphs.dress); prompt is the outfit
};
/** The passes of a dressing: Z-Image dresses the body held by its mesh, then optionally another model finishes it. */
export type DressRequest = { hold: Hold; dresser: Pass; finish: (Pass & { denoise: number }) | null };

export type GpuState = "cold" | "starting" | "warm" | "busy";
export type Gpu = {
  state: GpuState;
  booted: boolean; // ComfyUI is up on the worker; "busy" alone may still be a cold boot
  running: number;
  gpu: string;
  rate_per_hour: number;
  idles_in: number | null;
  session_cost: number;
  credits: { used: number; left: number; monthly: number } | null;
  stop_after: boolean; // stops by itself once the queue is done
  build: string; // the app the server serves now: its entry script, "" when unknown
};
export type Started = Params & { id: string };

export class Locked extends Error {}
/** The studio no longer has an image sent before (410: it restarted): send it again (data/images.ts). */
export class Gone extends Error {}

const detail = (body: unknown) => {
  if (typeof body !== "object" || body === null) return undefined;
  const { detail: d, error } = body as { detail?: unknown; error?: unknown };
  if (typeof d === "string") return d;
  return typeof error === "string" ? error : undefined;
};

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, {
    ...init,
    headers: init.body
      ? {
          "Content-Type":
            init.body instanceof Blob ? init.body.type || "application/octet-stream" : "application/json",
        }
      : undefined,
  });
  if (r.status === 401) throw new Locked();
  if (r.status === 410) throw new Gone();
  // Anything but JSON is not the studio answering: a dev server without its proxy serves the
  // app's own index.html with 200, a proxy in trouble serves an error page.
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new Error(
      r.ok
        ? "The studio API is not answering. In development, start Vite with STUDIO_URL set."
        : `HTTP ${r.status}`,
    );
  const body: unknown = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(detail(body) ?? `HTTP ${r.status}`);
  return body as T;
}

/** An image the studio already has, by its hash (data/images.ts); sent in place of the base64 itself. */
export type ImageRef = { ref: string };

const post = <T>(path: string, data?: unknown) =>
  call<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });

/** A point on an image in whole pixels, as SAM takes taps. */
export type Pt = { x: number; y: number };

export const api = {
  login: (key: string) => post<{ ok: true }>("/api/login", { key }),
  models: () => call<Catalog>("/api/models"),
  generate: (p: Request) => post<Started>("/api/generate", p),
  upscale: (u: UpscaleRequest) => post<Started>("/api/upscale", u),
  inpaint: (i: InpaintRequest) => post<Started>("/api/inpaint", i),
  body: (image: ImageRef) => post<Started>("/api/body", { image }), // the fitted body drawn over the picture
  /** What SAM finds by text, by tapped points (pixels) or both, white on black. */
  mask: (image: ImageRef, text: string, points?: { positive: Pt[]; negative: Pt[] }) =>
    post<Started>("/api/mask", { image, text, points }),
  putImage: (png: Blob) => call<ImageRef>("/api/images", { method: "POST", body: png }), // once per image, see data/images.ts
  cancel: (id: string) => post<unknown>(`/api/jobs/${id}/cancel`),
  // also cancels; keepalive so it survives a reload right after
  forget: (id: string) => call<unknown>(`/api/jobs/${id}`, { method: "DELETE", keepalive: true }),
  gpu: () => call<Gpu>("/api/gpu"),
  wake: () => post<Gpu>("/api/gpu/wake"),
  stopAfter: (on: boolean) => post<Gpu>(`/api/gpu/stop-after?on=${on}`), // for the queue already running
  stop: (force = false) => post<Gpu>(`/api/gpu/stop${force ? "?force=true" : ""}`), // force ends running renders too
};

/** For requests whose answer nobody waits on: the server cleans up after itself either way. */
export const quietly = (p: Promise<unknown>) => void p.catch(() => {});
