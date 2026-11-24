// The Edit tab's action, for the bar at the bottom in place of Generate: People (features/edit/people) or a repaint of
// what the mask covers, with the person's Who, Look and Wearing from the Prompt tab unless that is switched off. Every
// pass runs with its picked setup; the mask is sent exactly as it is shown.
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { FACE_FAMILIES, Locked } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { useSpace } from "@/data/db/space";
import { lockApp, useGpu } from "@/data/queries";
import { portrait } from "@/domain/compose";
import { errorText, median } from "@/domain/format";
import type { Render } from "@/domain/render";
import { useFaceChoices } from "@/features/edit/face-choices";
import { hasArea, maskPng } from "@/features/edit/mask";
import { usePeopleEdit } from "@/features/edit/people/use-people-edit";
import { editAtom, masksAtom } from "@/features/edit/state";
import { usePasses } from "@/features/edit/use-passes";
import { useJobs } from "@/state/jobs";
import { focusAtom, recipeAtom, rendersAtom, stageAtom } from "@/state/studio";

const dresses = (r: Render) => !!(r.edit?.dress || r.edit?.people?.some((p) => p.outfit));

/** Seconds an edit like this one took on this device: the median of the last 15, or null before the first. */
function useEditTime(dressing: boolean) {
  const renders = useAtomValue(rendersAtom) ?? [];
  const times = renders
    .filter((r) => r.edit && dresses(r) === dressing)
    .slice(0, 15)
    .map((r) => r.seconds);
  return times.length ? median(times) : null;
}

/** Repaint what the mask covers with a few words, the person kept as written, takes times. */
function useRepaint() {
  const space = useSpace();
  const { render, job } = useAtomValue(stageAtom);
  const recipe = useAtomValue(recipeAtom);
  const c = useAtomValue(editAtom);
  const ops = useAtomValue(masksAtom)[render?.id ?? ""] ?? [];
  const { inpaint } = useJobs();
  const { choose } = usePasses(render);
  const faces = useFaceChoices(render);
  const person = recipe.cast.find((p) => p.id === c.person) ?? recipe.cast[0];
  const kept = c.portrait && person ? portrait(person) : "";
  const words = c.repaint.trim().replace(/[\s.,;]+$/, "");
  const text = [words && `${words}.`, kept].filter(Boolean).join(" ");
  const repaintWith = choose(c.repaintWith).picked;
  const face =
    repaintWith && FACE_FAMILIES.includes(repaintWith.pass.family)
      ? faces.find((f) => f.id === c.face)
      : undefined;

  const blocked = (() => {
    if (job) return "wait for this one to finish, or pick an image";
    if (!render) return "no image to edit yet";
    if (!hasArea(ops)) return "find or paint what to replace";
    if (!text) return "say what goes there";
    if (!repaintWith) return "pick a model to repaint with";
    return null;
  })();

  const send = async () => {
    if (blocked || !render || !repaintWith) return;
    const found = ops.flatMap((o) => (o.kind === "found" ? [o.text] : []));
    const target = [...found, ...(ops.some((o) => o.kind === "stroke") ? ["painted"] : [])].join(", ");
    const mask = await maskPng(ops, render.width, render.height);
    const faceBlob = face ? await loadFace(space, face.face) : undefined;
    for (let take = 0; take < c.takes; take++)
      await inpaint(
        render,
        { target, prompt: text, setup: repaintWith.name, ...(face ? { face: face.name } : {}) },
        { mask, face: faceBlob, stopAfter: recipe.stopAfter, pass: repaintWith.pass },
      );
  };

  return {
    send,
    blocked,
    count: c.takes,
    dressing: false,
    label: `repaint${c.takes > 1 ? ` × ${c.takes}` : ""} · ${repaintWith?.name ?? "?"}`,
    button: `Repaint${c.takes > 1 ? ` ${c.takes}` : ""}`,
  };
}

export function useEdit() {
  const { render } = useAtomValue(stageAtom);
  const recipe = useAtomValue(recipeAtom);
  const mode = useAtomValue(editAtom).mode;
  const setFocus = useSetAtom(focusAtom);
  const { gpu } = useGpu();
  const repaint = useRepaint();
  const people = usePeopleEdit();
  const a = mode === "people" ? people : repaint;
  const each = useEditTime(a.dressing);
  const seconds = each == null ? null : each * a.count;
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    if (a.blocked || sending || !render) return;
    setSending(true);
    setError("");
    // the stage stays on this image, also while the takes go out; what comes back is in its lineage
    setFocus(render.id);
    try {
      await a.send();
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  return {
    submit,
    sending,
    error,
    blocked: a.blocked,
    label: a.label,
    button: a.button,
    seconds,
    cost: seconds != null && gpu ? (seconds * gpu.rate_per_hour) / 3600 : null,
    booting: gpu ? !gpu.booted : false,
    stopAfter: recipe.stopAfter,
  };
}

export type EditAction = ReturnType<typeof useEdit>;
