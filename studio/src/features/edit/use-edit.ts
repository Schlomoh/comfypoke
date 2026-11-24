// The Edit tab's action, for the bar at the bottom in place of Generate: dress the stage's image in each outfit of
// a person's Wearing row, or repaint what the mask covers; either way with the person's Who and Look (and Wearing,
// when repainting) from the Prompt tab unless that is switched off. Every pass runs with its picked setup; the mask is sent
// exactly as it is shown.
import { useAtomValue, useSetAtom, useStore } from "jotai";
import { useState } from "react";

import { FACE_FAMILIES, Locked } from "@/data/api";
import { loadFace } from "@/data/db/faces";
import { useSpace } from "@/data/db/space";
import { lockApp, useGpu } from "@/data/queries";
import { portrait } from "@/domain/compose";
import { errorText, median } from "@/domain/format";
import { outfitPieces } from "@/domain/outfits";
import type { Dress } from "@/domain/render";
import { toPass } from "@/domain/setup";
import { useFaceChoices } from "@/features/edit/face-choices";
import { hasArea, maskPng } from "@/features/edit/mask";
import { editAtom, masksAtom } from "@/features/edit/state";
import { usePasses } from "@/features/edit/use-passes";
import { useJobs } from "@/state/jobs";
import { focusAtom, recipeAtom, rendersAtom, stageAtom } from "@/state/studio";

/** Seconds an edit like this one took on this device: the median of the last 15, or null before the first. */
function useEditTime(dressing: boolean) {
  const renders = useAtomValue(rendersAtom) ?? [];
  const times = renders
    .filter((r) => r.edit && !!r.edit.dress === dressing)
    .slice(0, 15)
    .map((r) => r.seconds);
  return times.length ? median(times) : null;
}

export function useEdit() {
  const store = useStore();
  const space = useSpace();
  const { render, job } = useAtomValue(stageAtom);
  const recipe = useAtomValue(recipeAtom);
  const c = useAtomValue(editAtom);
  const ops = useAtomValue(masksAtom)[render?.id ?? ""] ?? [];
  const setFocus = useSetAtom(focusAtom);
  const { inpaint } = useJobs();
  const { gpu } = useGpu();
  const { choose } = usePasses(render);
  const faces = useFaceChoices(render);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const dressing = c.mode === "dress";
  const person = recipe.cast.find((p) => p.id === c.person) ?? recipe.cast[0];
  const wear = dressing && person ? outfitPieces(person) : [];
  // the person kept as the Prompt tab writes them, so a large repaint or a dress stays them
  const kept = (pieces?: string[]) => (c.portrait && person ? portrait(person, pieces) : "");
  const words = c.repaint.trim().replace(/[\s.,;]+$/, "");
  const repaintText = [words && `${words}.`, kept()].filter(Boolean).join(" ");
  const dresser = choose(c.dresser, "zimage").picked;
  const finish = c.finish === "off" ? null : choose(c.finish).picked;
  const repaintWith = choose(c.repaintWith).picked;
  const last = dressing ? finish : repaintWith; // the head swap runs on the model of the last pass
  const face =
    last && FACE_FAMILIES.includes(last.pass.family) ? faces.find((f) => f.id === c.face) : undefined;
  const runs = (dressing ? wear.length : 1) * c.takes;
  const each = useEditTime(dressing);
  const seconds = each == null ? null : each * runs;

  const blocked = (() => {
    if (job) return "wait for this one to finish, or pick an image";
    if (!render) return "no image to edit yet";
    if (!hasArea(ops)) return "find or paint what to replace";
    if (dressing && !person) return "add a person in the Prompt tab";
    if (dressing && !wear.length) return `say what ${person.name || "they"} wear below`;
    if (dressing && !dresser) return "save a Z-Image look to dress with";
    if (!dressing && !repaintText) return "say what goes there";
    if (!dressing && !repaintWith) return "pick a model to repaint with";
    return null;
  })();

  const submit = async () => {
    if (blocked || sending || !render) return;
    setSending(true);
    setError("");
    try {
      const found = ops.flatMap((o) => (o.kind === "found" ? [o.text] : []));
      const target = [...found, ...(ops.some((o) => o.kind === "stroke") ? ["painted"] : [])].join(", ");
      const mask = await maskPng(ops, render.width, render.height);
      const faceBlob = face ? await loadFace(space, face.face) : undefined;
      const stopAfter = store.get(recipeAtom).stopAfter;
      const common = { target, ...(face ? { face: face.name } : {}) };
      // the stage stays on this image and its mask, also while the takes go out; what comes back is in its lineage
      setFocus(render.id);
      if (dressing && dresser) {
        const record: Dress = {
          hold: c.hold,
          dresser: dresser.name,
          finish: finish?.name ?? null,
          strength: finish ? c.strength : undefined,
        };
        const dress = {
          hold: c.hold,
          dresser: dresser.pass,
          finish: finish ? { ...toPass(finish.pass), denoise: c.strength } : null,
        };
        for (const pieces of wear)
          for (let take = 0; take < c.takes; take++) {
            await inpaint(
              render,
              {
                ...common,
                prompt: kept(pieces) || pieces.join(", "),
                dress: { ...record, pieces, who: person.savedId ?? undefined },
              },
              { mask, face: faceBlob, stopAfter, pass: dresser.pass, dress },
            );
          }
      } else if (repaintWith) {
        for (let take = 0; take < c.takes; take++) {
          await inpaint(
            render,
            { ...common, prompt: repaintText, setup: repaintWith.name },
            { mask, face: faceBlob, stopAfter, pass: repaintWith.pass },
          );
        }
      }
    } catch (e) {
      if (e instanceof Locked) lockApp();
      else setError(errorText(e));
    } finally {
      setSending(false);
    }
  };

  const outfits = dressing ? wear.length : 1;
  const times = c.takes > 1 ? ` × ${c.takes}` : "";
  const label = dressing
    ? `${outfits} ${outfits === 1 ? "outfit" : "outfits"}${times} on ${person?.name || "them"} · ${dresser?.name ?? "?"}${finish ? ` → ${finish.name}` : ""}`
    : `repaint${times} · ${repaintWith?.name ?? "?"}`;
  const button = `${dressing ? "Dress" : "Repaint"}${runs > 1 ? ` ${runs}` : ""}`;

  return {
    submit,
    sending,
    error,
    blocked,
    label,
    button,
    seconds,
    cost: seconds != null && gpu ? (seconds * gpu.rate_per_hour) / 3600 : null,
    booting: gpu ? !gpu.booted : false,
    stopAfter: recipe.stopAfter,
  };
}

export type EditAction = ReturnType<typeof useEdit>;
