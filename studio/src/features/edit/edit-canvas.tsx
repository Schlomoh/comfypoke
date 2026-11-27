// The stage in the Edit tab: the shown image with its mask over it, one finger painting and two zooming. In People each
// person's fitted body, when there is one, lies between the image and the masks (the selected person's at half strength,
// the others fainter), each person's mask is drawn in their color, the selected one's taking the strokes, and the faces
// found are outlined over all of it, each with whose it is.
import { useAtom, useAtomValue } from "jotai";

import type { Render } from "@/domain/render";
import type { Op } from "@/features/edit/mask";
import { MaskLayer } from "@/features/edit/mask-layer";
import { PeopleLayer } from "@/features/edit/people/people-layer";
import { bodiesAtom, colorOf, peopleAtom, selectedAtom } from "@/features/edit/people/state";
import { editAtom, maskKey as keyFor, masksAtom, tapsAtom } from "@/features/edit/state";
import { useMaskKey } from "@/features/edit/use-mask-key";
import { usePainter, type LayerHandle } from "@/features/edit/use-painter";
import { useTaps } from "@/features/edit/use-taps";
import { ZoomView } from "@/features/stage/zoom-view";
import { useImageActions } from "@/state/actions";
import { viewAtom } from "@/state/studio";
import { cn } from "@/ui/cn";

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

/** Each fitted body in People, depth drawn light on dark, lightened onto the image. */
function PeopleBodies({ render }: { render: Render }) {
  const bodies = useAtomValue(bodiesAtom);
  const selected = useAtomValue(selectedAtom);
  const rows = useAtomValue(peopleAtom)[render.id] ?? [];
  return rows.map((_, i) => {
    const b64 = bodies[keyFor(render.id, i)];
    if (!b64) return null;
    const on = selected?.id === render.id && selected.index === i;
    return (
      <img
        // oxlint-disable-next-line react/no-array-index-key -- the faces are numbered left to right
        key={i}
        src={`data:image/png;base64,${b64}`}
        alt=""
        className={cn(
          "pointer-events-none absolute inset-0 size-full mix-blend-screen",
          on ? "opacity-50" : "opacity-20",
        )}
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
          {people ? (
            <>
              <PeopleBodies render={render} />
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
