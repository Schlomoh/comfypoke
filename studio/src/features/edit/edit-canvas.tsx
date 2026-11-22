// The stage in the Edit tab: the shown image with its mask over it, one finger painting and two zooming; or the
// body fitted to it, when that is asked for in the tab.
import { useAtom, useAtomValue } from "jotai";

import type { Render } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import { MaskLayer } from "@/features/edit/mask-layer";
import { masksAtom, showBodyAtom } from "@/features/edit/state";
import { usePainter } from "@/features/edit/use-painter";
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
  return (
    <ZoomView
      src={showBody && body.url ? body.url : url}
      alt={showBody ? "The body fitted to the image" : render.prompt}
      view={view}
      setView={setView}
      onSwipe={step}
      paint={showBody ? undefined : paint}
      overlay={!showBody && <MaskLayer ops={ops} width={render.width} height={render.height} bind={bind} />}
    />
  );
}
