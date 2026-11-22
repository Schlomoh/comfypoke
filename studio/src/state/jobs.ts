// Renders in flight. Each job is an EventSource on /api/jobs/<id>/events; the ids are kept with the
// workspace (@/data/db/pending) so a reload, or iOS killing the app mid-render, picks the job up again.
// Only the open workspace's jobs are followed: another workspace's finish on the server and are
// collected when it is next opened, within the server's job TTL.
import { atom, useAtomValue, useStore } from "jotai";
import { useEffect } from "react";

import { api, quietly, type DressRequest, type Request, type Started } from "@/data/api";
import { addPending, dropPending, pendingIds, pendingMeta } from "@/data/db/pending";
import { loadImage, saveRender } from "@/data/db/renders";
import { useSpace, type Space } from "@/data/db/space";
import { imageRef, withImages } from "@/data/images";
import { errorText } from "@/domain/format";
import type { Job } from "@/domain/job";
import { legacyUnet } from "@/domain/recipe";
import type { Edit, JobMeta, Params, Render, Upscale } from "@/domain/render";
import { passOf, retouchOf, type Pass } from "@/domain/setup";
import { focusAtom, jobsAtom } from "@/state/studio";
import { notify } from "@/ui/notify";

type Store = ReturnType<typeof useStore>;

/** The PNG's own size: a retouch's VAE crops to its grid, so the server's estimate can be a few pixels off. */
async function pngSize(blob: Blob) {
  const head = new DataView(await blob.slice(16, 24).arrayBuffer());
  return { width: head.getUint32(0), height: head.getUint32(4) };
}

/** An upscale or an edit is a new image with its source's record, its own size, and a link back. */
type Finished = { id: string; params: Params; seconds: number; size: { width: number; height: number } };

function recordOf({ id, params, seconds, size }: Finished, meta: JobMeta): Render {
  const createdAt = Date.now();
  const from = meta.upscaleOf ?? meta.editOf;
  if (from)
    return {
      ...from,
      id,
      createdAt,
      seconds,
      ...size,
      source: from.id,
      uploaded: meta.upscaleOf ? from.uploaded : undefined, // an upscale of a photo is still the photo; an edit is a render
      upscale: meta.upscale,
      edit: meta.edit,
      // an edit's own: what it ran with, which need not be its source's model
      ...(meta.editOf
        ? (({ unet, family, steps, cfg, loras, reference, seed }) => ({
            unet,
            family,
            steps,
            cfg,
            loras,
            reference,
            seed,
          }))(params)
        : {}),
      best: false,
      passed: undefined,
      title: undefined,
      notes: undefined,
      // a new image: not its source's draft, batch or finish
      ...(meta.editOf ? { finish: undefined } : {}),
      draft: undefined,
      batch: undefined,
      recipe: from.recipe && { ...from.recipe, draft: false }, // Reuse on it must not turn draft mode on
    };
  return {
    ...params,
    id,
    createdAt,
    seconds,
    ...size,
    recipe: meta.recipe,
    characterName: meta.characterName,
    title: meta.title,
    batch: meta.batch,
    draft: meta.draft || undefined,
    source: meta.from?.id,
  };
}

function createRunner(store: Store, space: Space) {
  const sources = new Map<string, EventSource>();
  const retries = new Set<number>();
  const setJobs = (f: (js: Job[]) => Job[]) => store.set(jobsAtom, f(store.get(jobsAtom)));
  const update = (id: string, patch: Partial<Job>) =>
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));

  const finish = (id: string, error?: string, saved?: boolean) => {
    sources.get(id)?.close();
    sources.delete(id);
    quietly(dropPending(id));
    quietly(api.forget(id));
    if (error || saved) update(id, { error, saved });
    else setJobs((js) => js.filter((j) => j.id !== id));
  };

  const keep = async (id: string, params: Params, image: string, seconds: number) => {
    const blob = await (await fetch(`data:image/png;base64,${image}`)).blob();
    let then: (() => Promise<unknown>) | undefined;
    try {
      const meta = await pendingMeta(space, id);
      if (!meta) return finish(id); // purged while it ran: the image is not wanted
      const record = recordOf({ id, params, seconds, size: await pngSize(blob) }, meta);
      await saveRender(space, record, blob);
      if (meta.then) {
        const u = meta.then;
        await dropPending(id); // now, not in finish: a reload in between would resave it and upscale it twice
        then = () => upscale(record, u);
      }
    } catch (e) {
      // Not finish(): that would delete the server's copy. The job stays listed, so a reload retries the save.
      sources.delete(id);
      return update(id, { error: `Could not store the image on this device: ${errorText(e)}`, image: blob });
    }
    finish(id, undefined, true);
    store.set(focusAtom, id);
    then?.().catch((e: unknown) => notify(`Could not start the upscale: ${errorText(e)}`, { bad: true }));
  };

  const attach = (id: string, retry = true) => {
    if (sources.has(id)) return;
    setJobs((js) =>
      js.some((j) => j.id === id) ? js : [{ id, startedAt: Date.now(), step: 0, steps: 0 }, ...js],
    );
    const es = new EventSource(`/api/jobs/${id}/events`);
    sources.set(id, es);
    let params: Params | undefined;
    let image = "";
    const on = (name: string, fn: (data: never) => void) =>
      es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent<string>).data) as never));

    on("queued", (d: Params & { started: number }) => {
      params = d;
      update(id, { params: d, startedAt: d.started * 1000 });
    });
    on("stage", (stage: string) => update(id, { stage }));
    on("progress", (p: { value: number; max: number }) =>
      update(id, { stage: "sampling", step: p.value, steps: p.max }),
    );
    on("preview", (b64: string) => update(id, { preview: `data:image/jpeg;base64,${b64}` }));
    on("image", (b64: string) => (image = b64));
    on("done", ({ seconds }: { seconds: number }) => {
      es.close(); // before the await: the server ends the stream and EventSource would reconnect
      if (!image || !params) return finish(id, "The render finished but no image came back.");
      void keep(id, params, image, seconds);
    });
    on("failed", ({ message }: { message: string }) =>
      finish(id, message === "cancelled" ? undefined : message),
    );
    es.addEventListener("error", () => {
      // CONNECTING means EventSource is retrying by itself (the server ends each stream after 100 s).
      // CLOSED is a 404, or Chrome aborting the stream because the page is being left, which it
      // reports before pagehide. One more try tells them apart: a leaving page never runs the timer.
      if (es.readyState !== EventSource.CLOSED) return;
      sources.delete(id);
      if (retry) retries.add(window.setTimeout(() => attach(id, false), 1500));
      else finish(id, "Lost this render: the studio restarted before it finished.");
    });
  };

  /** A render; `face`, the photo its head swap puts on the person, goes as an image reference. */
  const generate = async (p: Request, meta: JobMeta, face?: Blob) => {
    const r = await withImages(async () =>
      api.generate({ ...p, ...(face ? { reference: await imageRef(face) } : {}) }),
    );
    await addPending(space, r.id, meta);
    attach(r.id);
    return r;
  };

  /** The image goes to the studio, which runs graphs.upscale: SeedVR2, after a retouch when there is a prompt. */
  const upscale = async (r: Render, u: Upscale, stopAfter?: boolean): Promise<Started> => {
    const retouch = retouchOf(r, u);
    const png = await loadImage(space, r.id);
    const res = await withImages(async () =>
      api.upscale({
        image: await imageRef(png),
        megapixels: u.megapixels,
        seed: r.seed,
        retouch,
        stop_after: stopAfter,
      }),
    );
    await addPending(space, res.id, { upscaleOf: r, upscale: u });
    attach(res.id);
    return res;
  };

  /** Repaints the masked part of a render with `o.pass` (its own model unless another is picked), or with `o.dress`
   * puts new clothes on its body; the result links back to it. */
  const inpaint = async (
    r: Render,
    e: Edit,
    o: {
      mask: Blob;
      face?: Blob;
      stopAfter?: boolean;
      pass?: Pass;
      dress?: DressRequest;
    },
  ): Promise<Started> => {
    const { mask, face, stopAfter } = o;
    const pass = o.pass ?? passOf(r);
    const png = await loadImage(space, r.id);
    const res = await withImages(async () =>
      api.inpaint({
        image: await imageRef(png),
        mask: await imageRef(mask),
        target: e.target,
        prompt: e.prompt,
        unet: pass.unet,
        family: pass.family,
        negative: pass.unet === (r.unet ?? legacyUnet(r.model)) ? (r.negative ?? "") : "", // another model, not its negative
        loras: pass.loras,
        steps: pass.steps,
        cfg: pass.cfg,
        seed: null, // a new one each time: Repaint again is how to get another take
        reference: face && (await imageRef(face)),
        stop_after: stopAfter,
        ...(o.dress ? { dress: o.dress } : {}),
      }),
    );
    await addPending(space, res.id, { editOf: r, edit: e });
    attach(res.id);
    return res;
  };

  return {
    generate,
    upscale,
    inpaint,
    cancel: (id: string) => api.cancel(id).catch(() => finish(id)),
    dismiss: (id: string) => setJobs((js) => js.filter((j) => j.id !== id)),
    resume: () => pendingIds(space).then((ids) => ids.forEach((id) => attach(id))),
    /** Job cards still holding an image let go of it after a purge. */
    purged: () => setJobs((js) => js.filter((j) => !j.error)),
    leave: () => {
      for (const t of retries) clearTimeout(t);
      retries.clear();
      for (const es of sources.values()) es.close(); // a page restored from the back/forward cache gets fresh ones
      sources.clear();
    },
  };
}

export type Runner = ReturnType<typeof createRunner>;
const runnerAtom = atom<Runner | null>(null);

/** Follows this workspace's jobs while it is open. Mounted once, by the studio. */
export function useJobRunner() {
  const store = useStore();
  const space = useSpace();
  useEffect(() => {
    const runner = createRunner(store, space);
    store.set(runnerAtom, runner);
    const resume = () => void runner.resume();
    resume();
    window.addEventListener("studio-purged", runner.purged);
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", runner.leave);
    return () => {
      window.removeEventListener("studio-purged", runner.purged);
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", runner.leave);
      runner.leave();
      store.set(runnerAtom, null);
    };
  }, [store, space]);
}

const notRunning = (): never => {
  throw new Error("The workspace is closing.");
};

/** Start, cancel and dismiss jobs. */
export function useJobs() {
  const runner = useAtomValue(runnerAtom);
  return {
    generate: runner?.generate ?? notRunning,
    upscale: runner?.upscale ?? notRunning,
    inpaint: runner?.inpaint ?? notRunning,
    cancel: (id: string) => void runner?.cancel(id),
    dismiss: (id: string) => runner?.dismiss(id),
  };
}
