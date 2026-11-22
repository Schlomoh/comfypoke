// Pick the best of a few: two at a time, tap the better one, until one is left, which is marked Best. The others
// are dimmed in the library (`passed`), never deleted. Side by side, both images keep the same zoom and spot, so a
// detail compares directly; "flick" shows one frame and holding shows the other, for differences side by side hides.
import { atom, useAtom, useAtomValue, useSetAtom } from "jotai";
import { useRef, useState } from "react";

import { updateRender, useImage, useObjectUrl } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import type { Render } from "@/domain/render";
import { FIT, type View } from "@/domain/view";
import { ZoomView } from "@/features/stage/zoom-view";
import { pickAtom, rendersAtom, viewerAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Modal } from "@/ui/modal";
import { notify } from "@/ui/notify";
import { Segmented } from "@/ui/segmented";

const pickViewAtom = atom<View>(FIT);

function Side({
  render,
  view,
  setView,
  onPick,
}: {
  render: Render;
  view: View;
  setView: (v: View) => void;
  onPick: () => void;
}) {
  const url = useObjectUrl(useImage(render.id));
  return (
    <div className="relative min-h-0 min-w-0 flex-1 border border-line">
      {url && <ZoomView src={url} alt={render.prompt} view={view} setView={setView} onTap={onPick} />}
    </div>
  );
}

function Round({
  pool,
  onPick,
  onBack,
  round,
}: {
  pool: Render[];
  onPick: (keep: Render, drop: Render) => void;
  onBack?: () => void;
  round: number;
}) {
  const [view, setView] = useAtom(pickViewAtom); // kept across rounds: the same detail, compared each time
  const [mode, setMode] = useState<"side" | "flick">("side");
  const [other, setOther] = useState(false);
  const [a, b] = pool;
  return (
    <div className="flex h-full flex-col gap-2 p-3">
      <div className="flex items-center gap-2 font-mono text-xs text-muted">
        <span className="flex-1">
          Round {round} · {pool.length} left · tap the better one
        </span>
        <Segmented
          className="w-52"
          value={mode}
          options={[
            { value: "side", label: "side by side" },
            { value: "flick", label: "flick" },
          ]}
          onChange={setMode}
        />
      </div>
      {mode === "side" ? (
        <div className="flex min-h-0 flex-1 flex-col gap-2 landscape:flex-row">
          <Side render={a} view={view} setView={setView} onPick={() => onPick(a, b)} />
          <Side render={b} view={view} setView={setView} onPick={() => onPick(b, a)} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          <Side
            render={other ? b : a}
            view={view}
            setView={setView}
            onPick={() => onPick(other ? b : a, other ? a : b)}
          />
          <Button
            onPointerDown={() => setOther(true)}
            onPointerUp={() => setOther(false)}
            onPointerLeave={() => setOther(false)}
            title="Hold to see the other one in the same frame"
          >
            {other ? "showing B" : "hold for B"}
          </Button>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        <Button onClick={() => onPick(a, b)}>{mode === "side" ? "this one ◀" : "keep A"}</Button>
        <Button onClick={onBack} disabled={!onBack}>
          Back
        </Button>
        <Button onClick={() => onPick(b, a)}>{mode === "side" ? "▶ this one" : "keep B"}</Button>
      </div>
    </div>
  );
}

export function PickSheet() {
  const space = useSpace();
  const [ids, setIds] = useAtom(pickAtom);
  const all = useAtomValue(rendersAtom) ?? [];
  const setViewer = useSetAtom(viewerAtom);
  const [history, setHistory] = useState<string[][]>([]);
  const pool = (history.at(-1) ?? ids ?? []).flatMap((id) => all.find((r) => r.id === id) ?? []);
  const picked = useRef(""); // the round already decided: a second tap before the next one shows is ignored

  const close = () => {
    picked.current = "";
    setIds(null);
    setHistory([]);
  };
  const pick = (keep: Render, drop: Render) => {
    const round = pool.map((r) => r.id).join();
    if (picked.current === round) return;
    picked.current = round;
    void updateRender(space, drop.id, (r) => ({ ...r, passed: true, best: false }));
    const next = pool.filter((r) => r !== drop).map((r) => r.id);
    // the kept one stays first, so it meets the next one
    const ordered = [keep.id, ...next.filter((id) => id !== keep.id)];
    if (ordered.length > 1) return setHistory((h) => [...h, ordered]);
    void updateRender(space, keep.id, (r) => ({ ...r, best: true, passed: false }));
    notify("Picked one and marked it best; the others are dimmed in the library");
    close();
    setViewer(keep.id);
  };
  const back = () => {
    picked.current = "";
    const prev = history.at(-2) ?? ids ?? [];
    const returning = pool.length < prev.length ? prev.filter((id) => !pool.some((r) => r.id === id)) : [];
    for (const id of returning) void updateRender(space, id, (r) => ({ ...r, passed: false }));
    setHistory((h) => h.slice(0, -1));
  };

  return (
    <Modal
      open={!!ids && pool.length > 1}
      onClose={close}
      label="Pick the best"
      className="m-0 h-dvh max-h-none w-screen max-w-none overflow-hidden bg-bg pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]"
    >
      <div className="flex h-12 items-center border-b border-line px-3">
        <span className="flex-1 label">Pick the best</span>
        <Button onClick={close}>Close</Button>
      </div>
      {pool.length > 1 && (
        <div className="h-[calc(100%-3rem)]">
          <Round
            key={pool.map((r) => r.id).join()}
            pool={pool}
            round={history.length + 1}
            onPick={pick}
            onBack={history.length ? back : undefined}
          />
        </div>
      )}
    </Modal>
  );
}
