// The face match in the inspector: how much this image's face looks like the face photo of the person it was made
// with. Asked once with a tap, a few seconds on the GPU, then kept on the image.
import { useState } from "react";

import { api } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { loadImage, updateRender } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { imageRef, withImages } from "@/data/images";
import { faceFor } from "@/domain/cast";
import { faceToMatch, keptMatch, matchLabel } from "@/domain/face";
import { errorText } from "@/domain/format";
import { status } from "@/domain/job";
import type { Render } from "@/domain/render";
import { faceScore } from "@/state/preview";
import { Button } from "@/ui/button";
import { notify } from "@/ui/notify";
import { Heading } from "@/ui/text";

export function FaceMatch({ render }: { render: Render }) {
  const space = useSpace();
  const [stage, setStage] = useState<string | null>(null);
  const face = faceToMatch(render);
  if (!face) return null;
  const who = (render.recipe && faceFor(render.recipe)?.name) || "the person";
  const kept = keptMatch(render, face);

  const compare = async () => {
    setStage("queued");
    try {
      const [png, photo] = await Promise.all([loadImage(space, render.id), loadFace(space, face)]);
      const score = await faceScore(
        () =>
          withImages(space, async (t) => api.face(t.wire, await imageRef(t, png), await imageRef(t, photo))),
        setStage,
      );
      await updateRender(space, render.id, (r) => ({ ...r, faceMatch: { face, score } }));
    } catch (e) {
      notify(`Could not compare the faces: ${errorText(e)}`, { bad: true });
    } finally {
      setStage(null);
    }
  };

  return (
    <section className="flex flex-col gap-1.5" aria-live="polite">
      <Heading>Face match</Heading>
      {kept ? (
        <p className="font-mono text-muted">
          {kept.score === null ? "–" : kept.score.toFixed(2)} · {matchLabel(kept.score)}, against {who}'s face
          photo
        </p>
      ) : (
        <Button disabled={stage !== null} onClick={() => void compare()}>
          {stage
            ? status({ id: "", startedAt: 0, step: 0, steps: 0, stage })
            : `Compare with ${who}'s face photo`}
        </Button>
      )}
    </section>
  );
}
