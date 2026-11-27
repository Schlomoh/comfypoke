// A look at a render before an edit is sent: the fitted body (/api/body) or what SAM finds by text (/api/mask), and the
// face match (/api/face). Each is one GPU job with one image (or a score), outside the library and never stored. The body is kept for the session by
// its render, so it keeps running when the tab that asked for it closes, and reopening it finds the same one.
import { useEffect, useReducer } from "react";

import { api, Locked, quietly, type Started } from "@/data/api";
import { useSpace, type Space } from "@/data/db/space";
import { openBase64 } from "@/data/images";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";

type Entry = { url?: string; stage?: string; error?: string };
const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
const put = (key: string, e: Entry) => {
  entries.set(key, { ...entries.get(key), ...e });
  for (const l of listeners) l();
};
const RETRIES = 5; // reconnects in a row with nothing heard before giving up on the stream

type Result = { image: string; score?: number | null }; // the image as base64, still sealed; a face match's score

/** The job's result, or why it failed; the stage as it goes. */
function follow(id: string, onStage: (stage: string) => void) {
  return new Promise<Result>((resolve, reject) => {
    const es = new EventSource(`/api/jobs/${id}/events`);
    let image = "";
    let score: number | null | undefined;
    let lost = 0;
    const on = (name: string, fn: (data: never) => void) =>
      es.addEventListener(name, (e) => {
        lost = 0;
        fn(JSON.parse((e as MessageEvent<string>).data) as never);
      });
    on("stage", onStage);
    on("image", (b64: string) => (image = b64));
    on("score", (s: number | null) => (score = s));
    on("done", () => {
      es.close();
      resolve({ image, score });
    });
    on("failed", ({ message }: { message: string }) => {
      es.close();
      reject(new Error(message));
    });
    es.addEventListener("error", () => {
      // CONNECTING is EventSource retrying by itself, which the server's 100 s streams make routine
      if (es.readyState !== EventSource.CLOSED && ++lost < RETRIES) return;
      es.close();
      reject(new Error("lost the connection to the studio"));
    });
  }).finally(() => quietly(api.forget(id)));
}

/** One preview job from start to its image (base64 PNG), opened with the workspace's key. */
export const preview = async (
  space: Space,
  start: () => Promise<Started>,
  onStage: (stage: string) => void = () => {},
) => {
  const { image } = await follow((await start()).id, onStage);
  if (!image) throw new Error("the preview finished but no image came back");
  return openBase64(space, image).catch(() => {
    throw new Error("the preview came back but did not open with this workspace's key");
  });
};

/** A face match from start to its score: null when either picture had no face. */
export const faceScore = async (
  start: () => Promise<Started>,
  onStage: (stage: string) => void = () => {},
) => {
  const { score } = await follow((await start()).id, onStage);
  if (score === undefined) throw new Error("the face match finished but no score came back");
  return score;
};

/** The preview for `key` as it stands, and `run` to start it unless it is there or on its way. */
export function usePreview(key: string) {
  const space = useSpace();
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    listeners.add(rerender);
    return () => void listeners.delete(rerender);
  }, []);
  const entry = entries.get(key) ?? {};
  const run = (start: () => Promise<Started>) => {
    const now = entries.get(key); // not the render's copy: two taps before a re-render would start two jobs
    if (now?.url || now?.stage) return;
    put(key, { stage: "queued", error: undefined });
    void (async () => {
      try {
        const b64 = await preview(space, start, (stage) => put(key, { stage }));
        put(key, { url: `data:image/png;base64,${b64}`, stage: undefined });
      } catch (e) {
        if (e instanceof Locked) lockApp();
        put(key, { error: e instanceof Locked ? undefined : errorText(e), stage: undefined });
      }
    })();
  };
  return { ...entry, run };
}
