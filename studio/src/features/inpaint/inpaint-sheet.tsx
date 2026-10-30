// Repaint part of a render: paint over it, or name it for SAM to find, or both, and say what goes there.
// The server cuts a box around the mask, renders it again with the image's own model and settings, and
// blends it back (graphs.inpaint); a face photo from the render's people keeps that person's identity.
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { FACE_FAMILIES, Locked } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { useImage, useObjectUrl } from "@/data/db/renders";
import { useSpace } from "@/data/db/space";
import { lockApp } from "@/data/queries";
import { errorText } from "@/domain/format";
import type { Render } from "@/domain/render";
import { maskPng, type Stroke } from "@/features/inpaint/mask";
import { MaskCanvas } from "@/features/inpaint/mask-canvas";
import { useJobs } from "@/state/jobs";
import { recipeAtom, viewerAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Input, Labeled, Select, Textarea } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { Segmented } from "@/ui/segmented";
import { Note } from "@/ui/text";

const BRUSHES = [
  { value: 0.03, label: "fine" },
  { value: 0.07, label: "medium" },
  { value: 0.14, label: "broad" },
] as const;

function Form({ render, onDone }: { render: Render; onDone: () => void }) {
  const space = useSpace();
  const stopAfter = useAtomValue(recipeAtom).stopAfter;
  const setViewer = useSetAtom(viewerAtom);
  const { inpaint } = useJobs();
  const url = useObjectUrl(useImage(render.id));
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [brush, setBrush] = useState<number>(BRUSHES[1].value);
  const [target, setTarget] = useState("");
  const [prompt, setPrompt] = useState("");
  const [face, setFace] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // the people in this render who have a face photo, when its model can use one
  const faces = FACE_FAMILIES.includes(render.family)
    ? (render.recipe?.cast ?? []).filter((c) => c.face)
    : [];
  const ready = (strokes.length > 0 || target.trim() !== "") && prompt.trim() !== "";

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError("");
    try {
      const who = faces.find((c) => c.id === face);
      const started = await inpaint(
        render,
        { target: target.trim(), prompt: prompt.trim(), ...(who ? { face: who.name } : {}) },
        {
          mask: await maskPng(strokes, render.width, render.height),
          face: who?.face ? await loadFace(space, who.face) : undefined,
          stopAfter,
        },
      );
      onDone();
      setViewer(started.id); // follow it in the viewer; it becomes the new image when it lands
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {url && (
        <MaskCanvas
          src={url}
          width={render.width}
          height={render.height}
          strokes={strokes}
          size={brush}
          onStroke={(s) => setStrokes((xs) => [...xs, s])}
        />
      )}
      <div className="flex items-center gap-2">
        <Segmented className="flex-1" value={brush} options={BRUSHES} onChange={setBrush} />
        <Button disabled={!strokes.length} onClick={() => setStrokes((xs) => xs.slice(0, -1))}>
          Undo
        </Button>
        <Button disabled={!strokes.length} onClick={() => setStrokes([])}>
          Clear
        </Button>
      </div>
      <Labeled label="Also find by name (optional)">
        <Input
          value={target}
          onChange={(e) => setTarget(e.target.value)}
          placeholder="her face, the jacket"
        />
      </Labeled>
      <Labeled label="What goes there">
        <Textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="only what is inside the mask: a red silk slip dress"
        />
      </Labeled>
      {faces.length > 0 && (
        <Labeled label="Keep a face">
          <Select value={face} onChange={(e) => setFace(e.target.value)}>
            <option value="">none</option>
            {faces.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Labeled>
      )}
      <Note>
        {strokes.length || target.trim()
          ? "Only the marked area and a margin around it are rendered again, with this image's model and settings."
          : "Paint over what to change, or name it above."}
      </Note>
      {error && <Note tone="bad">{error}</Note>}
      <Button variant="primary" size="lg" disabled={!ready || busy} onClick={() => void submit()}>
        {busy ? "Sending…" : "Repaint"}
      </Button>
    </>
  );
}

export function InpaintSheet({
  render,
  open,
  onClose,
}: {
  render: Render;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Repaint part of it">
      {open && <Form key={render.id} render={render} onDone={onClose} />}
    </Sheet>
  );
}
