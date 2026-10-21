// The studio endpoint (comfy_modal/studio_api.py). Same origin, so the key cookie rides along.

export type Lora = { name: string; strength: number };
export type Params = {
  unet: string; // the diffusion model file
  family: string; // which encoder, VAE and sampling it runs with
  prompt: string;
  negative: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  seed: number;
  loras: Lora[];
};
export type Request = Omit<Params, "family" | "seed" | "steps" | "cfg"> & {
  family: string | null;
  seed: number | null;
  steps: number | null;
  cfg: number | null;
  stop_after?: boolean; // stop the GPU once the queue is empty; the latest request decides, absent leaves it as it is
};
/** An upscale: SeedVR2 to `megapixels`, with an optional prompt retouch at the image's own size first. */
export type UpscaleRequest = {
  image: string; // base64 PNG
  megapixels: number;
  seed?: number | null;
  retouch?: { unet: string; family: string | null; prompt: string; negative: string; loras: Lora[]; denoise: number } | null;
  stop_after?: boolean;
};
export const UPSCALE_MEGAPIXELS = [2, 4, 8] as const; // as graphs.UPSCALE_MEGAPIXELS on the server

export type Model = { file: string; family: string; verified: boolean; steps: number; cfg: number };
export type Family = { id: string; label: string; steps: number; cfg: number };
export type Catalog = { models: Model[]; families: Family[]; loras: string[] };
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
};

export class Locked extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  if (r.status === 401) throw new Locked();
  // Anything but JSON is not the studio answering: a dev server without its proxy serves the
  // app's own index.html with 200, a proxy in trouble serves an error page.
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new Error(r.ok ? "The studio API is not answering. In development, start Vite with STUDIO_URL set." : `HTTP ${r.status}`);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail ?? body.error ?? `HTTP ${r.status}`);
  return body as T;
}

const post = <T>(path: string, data?: unknown) =>
  call<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });

export const api = {
  login: (key: string) => post<{ ok: true }>("/api/login", { key }),
  models: () => call<Catalog>("/api/models"),
  generate: (p: Request) => post<Params & { id: string }>("/api/generate", p),
  upscale: (u: UpscaleRequest) => post<Params & { id: string }>("/api/upscale", u),
  cancel: (id: string) => post(`/api/jobs/${id}/cancel`),
  forget: (id: string) => call(`/api/jobs/${id}`, { method: "DELETE", keepalive: true }), // also cancels; survives a reload right after
  gpu: () => call<Gpu>("/api/gpu"),
  wake: () => post<Gpu>("/api/gpu/wake"),
  stopAfter: (on: boolean) => post<Gpu>(`/api/gpu/stop-after?on=${on}`), // for the queue already running
  stop: (force = false) => post<Gpu>(`/api/gpu/stop${force ? "?force=true" : ""}`), // force ends running renders too
};
