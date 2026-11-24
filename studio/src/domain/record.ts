// What a finished job becomes in the library: a render of its own, or a new image linked back to its source.
import type { JobMeta, Params, Render } from "@/domain/render";

/** An upscale or an edit is a new image with its source's record, its own size, and a link back. */
type Finished = { id: string; params: Params; seconds: number; size: { width: number; height: number } };

export function recordOf({ id, params, seconds, size }: Finished, meta: JobMeta): Render {
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
