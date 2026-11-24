// Renders in flight. Each job is an EventSource on /api/jobs/<id>/events; the ids are kept with the
// workspace (@/data/db/pending) so a reload, or iOS killing the app mid-render, picks the job up again.
// Only the open workspace's jobs are followed: another workspace's finish on the server and are
// collected when it is next opened, within the server's job TTL.
import { atom, useAtomValue, useStore } from "jotai";
import { useEffect } from "react";

import { api, quietly, type ImageRef, type PeopleRequest, type Request, type Started } from "@/data/api";
import { addPending, dropPending, pendingIds, pendingMeta } from "@/data/db/pending";
import { loadImage, saveRender } from "@/data/db/renders";
import { useSpace, type Space } from "@/data/db/space";
import { imageRef, openImage, openPreview, pngSize, withImages, type Transport } from "@/data/images";
import type { FacePerson } from "@/domain/face";
import { errorText } from "@/domain/format";
import { isUpscale, type Job } from "@/domain/job";
import { legacyUnet } from "@/domain/recipe";
import { recordOf } from "@/domain/record";
import type { Edit, JobMeta, Params, Render, Upscale } from "@/domain/render";
import { passOf, retouchOf, type Pass } from "@/domain/setup";
import { jobsAtom, viewerAtom } from "@/state/studio";
import { notify } from "@/ui/notify";

type Store = ReturnType<typeof useStore>;
/** A person of the face pass and their face photo, when they have one. */
export type FaceOf = { person: FacePerson; photo?: Blob };
/** Stages that count steps of their own: a step keeps them on screen instead of reading as the render's sampling. */
const STEPPED = new Set(["swapping", "refining"]);

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
    const job = store.get(jobsAtom).find((j) => j.id === id);
    if (error || saved) update(id, { error, saved });
    else setJobs((js) => js.filter((j) => j.id !== id));
    if (job?.source) settled(job, !!saved);
  };

  /** The last image saved from each source while others from it still ran: what the toast's View opens. */
  const lastFrom = new Map<string, string>();
  /** An edit or upscale ended (saved, failed or cancelled). Once nothing more from its source is running, and one of
   * them was saved, a toast says so: the stage stays where it is. */
  const settled = (job: Job, saved: boolean) => {
    const source = job.source as string;
    if (saved) lastFrom.set(source, job.id);
    if (store.get(jobsAtom).some((j) => j.source === source && !j.saved && !j.error)) return;
    const id = lastFrom.get(source);
    lastFrom.delete(source);
    if (!id) return;
    notify(`${isUpscale(job) ? "Upscaled" : "Edited"}: in the lineage of the image it was made from`, {
      action: { label: "View", run: () => store.set(viewerAtom, id) },
    });
  };

  const keep = async (id: string, params: Params, image: string, seconds: number) => {
    const blob = await openImage(space, image).catch(() => null);
    if (!blob) return finish(id, "The image came back but did not open with this workspace's key.");
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
    finish(id, undefined, true); // the stage stays where it is: see settled
    then?.().catch((e: unknown) => notify(`Could not start the upscale: ${errorText(e)}`, { bad: true }));
  };

  const attach = (id: string, retry = true, source?: string) => {
    if (sources.has(id)) return;
    setJobs((js) =>
      js.some((j) => j.id === id)
        ? js
        : [{ id, startedAt: Date.now(), step: 0, steps: 0, ...(source ? { source } : {}) }, ...js],
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
      setJobs((js) =>
        js.map((j) =>
          j.id === id
            ? { ...j, stage: STEPPED.has(j.stage ?? "") ? j.stage : "sampling", step: p.value, steps: p.max }
            : j,
        ),
      ),
    );
    on("preview", (sealed: string) => openPreview(space, sealed, (preview) => update(id, { preview })));
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

  /** After a reload: each pending job again, with the image it is made from. */
  let visit = 0; // a leave ends the visit: a resume still reading pending jobs then attaches no more
  const resume = async () => {
    const at = visit;
    for (const id of await pendingIds(space)) {
      const meta = await pendingMeta(space, id).catch(() => null);
      if (visit !== at) return;
      attach(id, true, (meta?.editOf ?? meta?.upscaleOf)?.id);
    }
  };

  /** A render; `face`, the photo its head swap puts on the person, goes as an image reference, as do the face photos
   * the face pass tells `people` apart by. */
  const generate = async (p: Request, meta: JobMeta, face?: Blob, people?: FaceOf[]) => {
    const r = await withImages(space, async (t) =>
      api.generate(t.wire, {
        ...p,
        ...(face ? { reference: await imageRef(t, face) } : {}),
        ...(people
          ? {
              face_people: await Promise.all(
                people.map(async ({ person: { text, loras, side }, photo }) => ({
                  text,
                  loras,
                  side,
                  ...(photo ? { face: await imageRef(t, photo) } : {}),
                })),
              ),
            }
          : {}),
      }),
    );
    await addPending(space, r.id, meta);
    attach(r.id);
    return r;
  };

  /** The image goes to the studio, which runs graphs.upscale: SeedVR2, after a retouch when there is a prompt. */
  const upscale = async (r: Render, u: Upscale, stopAfter?: boolean): Promise<Started> => {
    const retouch = retouchOf(r, u);
    const png = await loadImage(space, r.id);
    const res = await withImages(space, async (t) =>
      api.upscale(t.wire, {
        image: await imageRef(t, png),
        megapixels: u.megapixels,
        seed: r.seed,
        retouch,
        stop_after: stopAfter,
      }),
    );
    await addPending(space, res.id, { upscaleOf: r, upscale: u });
    attach(res.id, true, r.id);
    return res;
  };

  /** An edit of a render: `send` gets its image as sent; the result links back to it. */
  const edit = async (r: Render, e: Edit, send: (t: Transport, image: ImageRef) => Promise<Started>) => {
    const png = await loadImage(space, r.id);
    const res = await withImages(space, async (t) => send(t, await imageRef(t, png)));
    await addPending(space, res.id, { editOf: r, edit: e });
    attach(res.id, true, r.id);
    return res;
  };

  /** Repaints the masked part of a render with `o.pass`, its own model unless another is picked. */
  const inpaint = async (
    r: Render,
    e: Edit,
    o: { mask: Blob; face?: Blob; stopAfter?: boolean; pass?: Pass },
  ) => {
    const { mask, face, stopAfter } = o;
    const pass = o.pass ?? passOf(r);
    return edit(r, e, async (t, image) =>
      api.inpaint(t.wire, {
        image,
        mask: await imageRef(t, mask),
        target: e.target,
        prompt: e.prompt,
        unet: pass.unet,
        family: pass.family,
        negative: pass.unet === (r.unet ?? legacyUnet(r.model)) ? (r.negative ?? "") : "", // another model, not its negative
        loras: pass.loras,
        steps: pass.steps,
        cfg: pass.cfg,
        seed: null, // a new one each time: Repaint again is how to get another take
        reference: face && (await imageRef(t, face)),
        stop_after: stopAfter,
      }),
    );
  };

  /** Everyone on a render at once, dressed and their faces redrawn (the Edit tab's People). */
  const people = async (r: Render, e: Edit, p: Omit<PeopleRequest, "image" | "mask">, mask?: Blob | null) =>
    edit(r, e, async (t, image) =>
      api.people(t.wire, { ...p, image, ...(mask ? { mask: await imageRef(t, mask) } : {}) }),
    );

  return {
    generate,
    upscale,
    inpaint,
    people,
    cancel: (id: string) => api.cancel(id).catch(() => finish(id)),
    dismiss: (id: string) => setJobs((js) => js.filter((j) => j.id !== id)),
    resume,
    /** Job cards still holding an image let go of it after a purge. */
    purged: () => setJobs((js) => js.filter((j) => !j.error)),
    leave: () => {
      visit++;
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
    people: runner?.people ?? notRunning,
    cancel: (id: string) => void runner?.cancel(id),
    dismiss: (id: string) => runner?.dismiss(id),
  };
}
