// The stage in the Edit tab: the shown image with its mask over it, one finger painting and two zooming. The body
// fitted to it, when asked for, lies at half strength between the image and the mask: every tool keeps working. In
// People the faces found are outlined over all of it, each with whose it is.
import { useAtom, useAtomValue } from "jotai";

import type { Render } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import { MaskLayer } from "@/features/edit/mask-layer";
import { PeopleLayer } from "@/features/edit/people/people-layer";
import { editAtom, masksAtom, showBodyAtom, tapsAtom } from "@/features/edit/state";
import { usePainter } from "@/features/edit/use-painter";
import { useTaps } from "@/features/edit/use-taps";
import { ZoomView } from "@/features/stage/zoom-view";
import { useImageActions } from "@/state/actions";
import { usePreview } from "@/state/preview";
import { viewAtom } from "@/state/studio";

const NONE: Op[] = [];

export function EditCanvas({ render, url }: { render: Render; url: string }) {
  const [view, setView] = useAtom(viewAtom);
  const { step } = useImageActions();
  const ops = useAtomValue(masksAtom)[render.id] ?? NONE; // the same empty list each time: the layer redraws on change only
  const body = usePreview(`body:${render.id}`);
  const showBody = useAtomValue(showBodyAtom) === render.id && !!body.url;
  const { paint, bind } = usePainter(render.id);
  useTaps(render);
  const taps = useAtomValue(tapsAtom)[render.id]?.points;
  const people = useAtomValue(editAtom).mode === "people";
  return (
    <ZoomView
      src={url}
      alt={render.prompt}
      view={view}
      setView={setView}
      onSwipe={step}
      paint={paint}
      overlay={
        <>
          {showBody && body.url && (
            <img
              src={body.url}
              alt=""
              className="pointer-events-none absolute inset-0 size-full opacity-50"
            />
          )}
          <MaskLayer ops={ops} taps={taps} width={render.width} height={render.height} bind={bind} />
          {people && <PeopleLayer render={render} />}
        </>
      }
    />
  );
}
