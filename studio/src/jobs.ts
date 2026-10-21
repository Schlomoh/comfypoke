// Renders in flight. Each job is an EventSource on /api/jobs/<id>/events; the ids are kept with
// the workspace (db.ts) so a reload, or iOS killing the app mid-render, picks the job up again.
// Only the open workspace's jobs are followed: another workspace's finish on the server and are
// collected when it is next opened, within the server's job TTL.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Params, type Request } from "./api";
import { addPending, dropPending, pendingIds, pendingMeta, saveRender, useSpace, type JobMeta } from "./db";

export type Job = {
  id: string;
  params?: Params;
  startedAt: number;
  stage?: string;
  step: number;
  steps: number;
  preview?: string;
  error?: string;
  image?: Blob; // set only when storing it on this device failed: the user can still download it
};

export function useJobs(onSaved: (id: string) => void) {
  const space = useSpace();
  const [jobs, setJobs] = useState<Job[]>([]);
  const sources = useRef(new Map<string, EventSource>());
  const retries = useRef(new Set<number>()); // cleared on unmount: a closed workspace must not reattach
  const saved = useRef(onSaved);
  saved.current = onSaved;

  const update = useCallback((id: string, patch: Partial<Job>) => {
    setJobs((js) => js.map((j) => (j.id === id ? { ...j, ...patch } : j)));
  }, []);

  const finish = useCallback((id: string, error?: string) => {
    sources.current.get(id)?.close();
    sources.current.delete(id);
    dropPending(id);
    api.forget(id).catch(() => {});
    if (error) update(id, { error });
    else setJobs((js) => js.filter((j) => j.id !== id));
  }, [update]);

  const attach = useCallback((id: string, retry = true) => {
    if (sources.current.has(id)) return;
    setJobs((js) => (js.some((j) => j.id === id) ? js : [{ id, startedAt: Date.now(), step: 0, steps: 0 }, ...js]));
    const es = new EventSource(`/api/jobs/${id}/events`);
    sources.current.set(id, es);
    let params: Params | undefined;
    let image = "";
    const on = (name: string, fn: (data: any) => void) =>
      es.addEventListener(name, (e) => fn(JSON.parse((e as MessageEvent).data)));

    on("queued", (d: Params & { started: number }) => {
      params = d;
      update(id, { params: d, startedAt: d.started * 1000 });
    });
    on("stage", (stage: string) => update(id, { stage }));
    on("progress", (p: { value: number; max: number }) => update(id, { stage: "sampling", step: p.value, steps: p.max }));
    on("preview", (b64: string) => update(id, { preview: `data:image/jpeg;base64,${b64}` }));
    on("image", (b64: string) => (image = b64));
    on("done", async ({ seconds }: { seconds: number }) => {
      es.close(); // before the await: the server ends the stream and EventSource would reconnect
      if (!image || !params) return finish(id, "The render finished but no image came back.");
      const blob = await (await fetch(`data:image/png;base64,${image}`)).blob();
      try {
        const meta = await pendingMeta(space, id);
        await saveRender(space, { ...params, id, createdAt: Date.now(), seconds, recipe: meta.recipe, characterName: meta.characterName }, blob);
      } catch (e) {
        // Not finish(): that would delete the server's copy. The job stays listed, so a reload retries the save.
        sources.current.delete(id);
        return update(id, { error: `Could not store the image on this device: ${e}`, image: blob });
      }
      finish(id);
      saved.current(id);
    });
    on("failed", ({ message }: { message: string }) => finish(id, message === "cancelled" ? undefined : message));
    es.onerror = () => {
      // CONNECTING means EventSource is retrying by itself (the server ends each stream after 100 s).
      // CLOSED is a 404, or Chrome aborting the stream because the page is being left, which it
      // reports before pagehide. One more try tells them apart: a leaving page never runs the timer.
      if (es.readyState !== EventSource.CLOSED) return;
      sources.current.delete(id);
      if (retry) retries.current.add(window.setTimeout(() => attach(id, false), 1500));
      else finish(id, "Lost this render: the studio restarted before it finished.");
    };
  }, [space, finish, update]);

  useEffect(() => {
    const map = sources.current;
    const resume = () => pendingIds(space).then((ids) => ids.forEach((id) => attach(id)));
    const timers = retries.current;
    const leave = () => {
      timers.forEach(clearTimeout);
      timers.clear();
      map.forEach((es) => es.close()); // a page restored from the back/forward cache gets fresh ones
      map.clear();
    };
    resume();
    window.addEventListener("pageshow", resume);
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pageshow", resume);
      window.removeEventListener("pagehide", leave);
      leave();
    };
  }, [space, attach]);

  const generate = useCallback(async (p: Request, meta: JobMeta) => {
    const r = await api.generate(p);
    await addPending(space, r.id, meta);
    attach(r.id);
    return r;
  }, [space, attach]);

  const cancel = useCallback((id: string) => api.cancel(id).catch(() => finish(id)), [finish]);
  const dismiss = useCallback((id: string) => setJobs((js) => js.filter((j) => j.id !== id)), []);

  return { jobs, generate, cancel, dismiss };
}
