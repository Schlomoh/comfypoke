// A render in flight, as its event stream reports it.
import type { Params } from "@/domain/render";

export type Job = {
  id: string;
  params?: Params;
  startedAt: number;
  stage?: string;
  step: number;
  steps: number;
  preview?: string;
  error?: string;
  image?: Blob; // set only when storing it on this device failed: the person can still download it
  saved?: boolean; // stored as a render under the same id; dropped once the library shows it
  source?: string; // the image an edit or upscale is made from
};

export const running = (j: Job) => !j.error;
export const isUpscale = (j: Job) => j.params?.family === "seedvr2";

export function status(job: Job, booted?: boolean) {
  switch (job.stage) {
    case "loading":
      return "Loading model";
    case "encoding":
      return "Encoding prompt";
    case "sampling":
      return job.steps ? `Step ${job.step}/${job.steps}` : "Sampling";
    case "upscaling":
      return "Upscaling";
    case "masking":
      return "Finding the area";
    case "fitting":
      return "Fitting the body";
    case "dressing":
      return "Dressing";
    case "swapping":
      return job.steps ? `Swapping the face ${job.step}/${job.steps}` : "Swapping the face";
    case "decoding":
      return "Decoding";
    default:
      return booted === false ? "Booting GPU, up to 2 min" : "Queued";
  }
}

export function progress(job: Job) {
  if (job.stage === "decoding") return 1;
  return job.steps ? job.step / job.steps : 0;
}
