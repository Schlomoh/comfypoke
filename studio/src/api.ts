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
};
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
};

export class Locked extends Error {}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const r = await fetch(path, { ...init, headers: init.body ? { "Content-Type": "application/json" } : undefined });
  if (r.status === 401) throw new Locked();
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
  cancel: (id: string) => post(`/api/jobs/${id}/cancel`),
  forget: (id: string) => call(`/api/jobs/${id}`, { method: "DELETE" }),
  gpu: () => call<Gpu>("/api/gpu"),
  wake: () => post<Gpu>("/api/gpu/wake"),
  stop: () => post<Gpu>("/api/gpu/stop"),
};
