// The Edit tab's action, for the bar at the bottom in place of Generate: People (features/edit/people) or a repaint of
// what the mask covers, with the person's Who, Look and Wearing from the Prompt tab unless that is switched off. Every
// pass runs with its picked setup; the mask is sent exactly as it is shown. A repaint is drawn by a Z-Image look and
// finished by another, as a dressing is.
import { useAtomValue, useSetAtom } from "jotai";
import { useState } from "react";

import { api, FACE_FAMILIES, Locked } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { useSpace } from "@/data/db/space";
import { imageRef } from "@/data/images";
import { lockApp, useGpu } from "@/data/queries";
import { portrait } from "@/domain/compose";
import { errorText, median } from "@/domain/format";
import { legacyUnet } from "@/domain/recipe";
import type { Render } from "@/domain/render";
import { toPass } from "@/domain/setup";
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
  const { edit } = useJobs();
  const { choose } = usePasses(render);
  const faces = useFaceChoices(render);
  const person = recipe.cast.find((p) => p.id === c.person) ?? recipe.cast[0];
  const kept = c.portrait && person ? portrait(person) : "";
  const words = c.repaint.trim().replace(/[\s.,;]+$/, "");
  const text = [words && `${words}.`, kept].filter(Boolean).join(" ");
  const dresser = choose(c.dresser, "zimage").picked;
  const finish = c.finish === "off" ? null : choose(c.finish).picked;
  const face =
    finish && FACE_FAMILIES.includes(finish.pass.family) ? faces.find((f) => f.id === c.face) : undefined;

  const blocked = (() => {
    if (job) return "wait for this one to finish, or pick an image";
    if (!render) return "no image to edit yet";
    if (!hasArea(ops)) return "find or paint what to replace";
    if (!text) return "say what goes there";
    if (!dresser) return "save a Z-Image look to draw with";
    return null;
  })();

  const send = async () => {
    if (blocked || !render || !dresser) return;
    const found = ops.flatMap((o) => (o.kind === "found" ? [o.text] : []));
    const target = [...found, ...(ops.some((o) => o.kind === "stroke") ? ["painted"] : [])].join(", ");
    const mask = await maskPng(ops, render.width, render.height);
    const photo = face ? await loadFace(space, face.face) : undefined;
    const last = finish ?? dresser; // the look that drew the last pixels, as the image records it
    const record = { target, prompt: text, setup: last.name, ...(face ? { face: face.name } : {}) };
    const own = (unet: string) =>
      unet === (render.unet ?? legacyUnet(render.model)) ? (render.negative ?? "") : ""; // another model's: not its negative
    for (let take = 0; take < c.takes; take++)
      await edit(render, record, async (t, image) =>
        api.inpaint(t.wire, {
          image,
          mask: await imageRef(t, mask),
          target,
          prompt: text,
          dresser: toPass(dresser.pass),
          finish: finish
            ? { ...toPass(finish.pass), negative: own(finish.pass.unet), denoise: c.strength }
            : null,
          seed: null, // a new one each take
          reference: photo && (await imageRef(t, photo)),
          stop_after: recipe.stopAfter,
        }),
      );
  };

  return {
    send,
    blocked,
    count: c.takes,
    dressing: false,
    label: `repaint${c.takes > 1 ? ` × ${c.takes}` : ""} · ${(finish ?? dresser)?.name ?? "?"}`,
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
