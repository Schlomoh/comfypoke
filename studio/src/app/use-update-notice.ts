// A page left open across a deploy keeps running the app it loaded, which may send what the new server no longer
// takes. When the server serves another build, this says so once, with Reload; never by itself, so a half-painted
// mask or a typed prompt is not lost.
import { useEffect, useRef } from "react";

import { useGpu } from "@/data/queries";
import { notify } from "@/ui/notify";

/** This page's entry script, as the server names it ("" in development, where there is none). */
const ours = () =>
  document
    .querySelector<HTMLScriptElement>('script[type="module"][src*="assets/"]')
    ?.getAttribute("src")
    ?.replace(/^\//, "") ?? "";

export function useUpdateNotice() {
  const served = useGpu().gpu?.build;
  const told = useRef("");
  useEffect(() => {
    const mine = ours();
    if (!served || !mine || served === mine || told.current === served) return;
    told.current = served;
    notify("A new version of the studio is out.", {
      action: { label: "Reload", run: () => location.reload() },
    });
  }, [served]);
}
