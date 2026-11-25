// The stage in the Edit tab: the shown image with its mask over it, one finger painting and two zooming. The body
// fitted to it, when asked for, lies at half strength between the image and the mask: every tool keeps working. In
// People each person's mask is drawn in their color, the selected one's taking the strokes, and the faces found are
// outlined over all of it, each with whose it is.
import { useAtom, useAtomValue } from "jotai";

import type { Render } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import { MaskLayer } from "@/features/edit/mask-layer";
import { PeopleLayer } from "@/features/edit/people/people-layer";
import { colorOf, peopleAtom } from "@/features/edit/people/state";
import { editAtom, maskKey as keyFor, masksAtom, showBodyAtom, tapsAtom } from "@/features/edit/state";
import { useMaskKey } from "@/features/edit/use-mask-key";
import { usePainter, type LayerHandle } from "@/features/edit/use-painter";
import { useTaps } from "@/features/edit/use-taps";
import { ZoomView } from "@/features/stage/zoom-view";
import { useImageActions } from "@/state/actions";
import { usePreview } from "@/state/preview";
import { viewAtom } from "@/state/studio";

const NONE: Op[] = [];
type Bind = (h: LayerHandle | null) => void;

/** Every person's mask in People, each in their color: the selected one's takes the strokes. */
function PeopleMasks({ render, maskKey, bind }: { render: Render; maskKey: string | null; bind: Bind }) {
  const masks = useAtomValue(masksAtom);
  const taps = useAtomValue(tapsAtom);
  const rows = useAtomValue(peopleAtom)[render.id] ?? [];
  return rows.map((_, i) => {
    const key = keyFor(render.id, i);
    const editing = key === maskKey;
    return (
      <MaskLayer
        key={key}
        ops={masks[key] ?? NONE}
        taps={editing ? taps[key]?.points : undefined}
        width={render.width}
        height={render.height}
        bind={editing ? bind : undefined}
        tint={colorOf(i)}
      />
    );
  });
}

export function EditCanvas({ render, url }: { render: Render; url: string }) {
  const [view, setView] = useAtom(viewAtom);
  const { step } = useImageActions();
  const maskKey = useMaskKey(render);
  const people = useAtomValue(editAtom).mode === "people";
  const ops = useAtomValue(masksAtom)[render.id] ?? NONE; // the same empty list each time: the layer redraws on change only
  const body = usePreview(`body:${render.id}`);
  const showBody = useAtomValue(showBodyAtom) === render.id && !!body.url;
  const { paint, bind } = usePainter(maskKey ?? render.id);
  useTaps(render, maskKey ?? render.id);
  const taps = useAtomValue(tapsAtom)[render.id]?.points;
  return (
    <ZoomView
      src={url}
      alt={render.prompt}
      view={view}
      setView={setView}
      onSwipe={step}
      paint={maskKey ? paint : undefined}
      overlay={
        <>
          {showBody && body.url && (
            <img
              src={body.url}
              alt=""
              className="pointer-events-none absolute inset-0 size-full opacity-50"
            />
          )}
          {people ? (
            <>
              <PeopleMasks render={render} maskKey={maskKey} bind={bind} />
              <PeopleLayer render={render} />
            </>
          ) : (
            <MaskLayer ops={ops} taps={taps} width={render.width} height={render.height} bind={bind} />
          )}
        </>
      }
    />
  );
}
