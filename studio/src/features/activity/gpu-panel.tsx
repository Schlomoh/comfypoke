// The GPU worker's facts and controls, in the activity sheet. Its state is polled by useGpu
// (@/data/queries) only while the page is visible.
import { useState, type ReactNode } from "react";

import { api, type Gpu } from "@/data/api";
import { idlesIn, useGpu, useGpuAction } from "@/data/queries";
import { clock, errorText } from "@/domain/format";
import { LABEL, TONE } from "@/features/activity/gpu-state";
import { useNow } from "@/features/activity/use-now";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Facts, Note } from "@/ui/text";

/** Facts and controls. Stop waits for nothing to run; Force stop, once armed, ends renders mid-way. */
export function GpuPanel() {
  const handle = useGpu();
  const { gpu } = handle;
  const action = useGpuAction();
  const [armed, setArmed] = useState(false);
  const now = useNow(gpu?.state === "warm");
  const busy = gpu?.state === "busy" || gpu?.state === "starting";
  // armed for this run only: the run starting or ending disarms it
  const [armedRun, setArmedRun] = useState(busy);
  if (armedRun !== busy) {
    setArmedRun(busy);
    setArmed(false);
  }
  if (!gpu) return <Note mono>GPU …</Note>;

  const idles = idlesIn(handle, now);
  const pending = action.isPending;
  const act = (fn: () => Promise<Gpu>) => action.mutate(fn, { onSuccess: () => setArmed(false) });
  const facts: [string, ReactNode][] = [
    [
      "state",
      <span key="state" className={TONE[gpu.state]}>
        {LABEL[gpu.state]}
        {idles != null && <span className="text-muted"> · sleeps in {clock(idles)}</span>}
      </span>,
    ],
    ["gpu", gpu.gpu],
    ...(gpu.stop_after ? [["after the queue", "stops by itself"] as [string, ReactNode]] : []),
    ["rate", `$${gpu.rate_per_hour.toFixed(2)}/h`],
    ["session", `$${gpu.session_cost.toFixed(3)}`],
    ...(gpu.credits
      ? [["credits left", `$${gpu.credits.left.toFixed(2)} / $${gpu.credits.monthly}`] as [string, ReactNode]]
      : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <Facts rows={facts} />
      {action.error && (
        <Note tone="bad" mono>
          {errorText(action.error)}
        </Note>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button disabled={pending || busy} onClick={() => act(api.wake)}>
          {gpu.state === "warm" ? "Extend" : "Wake"}
        </Button>
        {busy ? (
          <Button variant="danger" disabled={pending || !armed} onClick={() => act(() => api.stop(true))}>
            Force stop
          </Button>
        ) : (
          <Button disabled={pending || gpu.state !== "warm"} onClick={() => act(() => api.stop())}>
            Stop
          </Button>
        )}
      </div>
      {busy ? (
        <Checkbox
          on={armed}
          onChange={setArmed}
          label={
            <span className="text-xs text-muted">
              Allow a force stop: running renders are lost and the worker exits now
            </span>
          }
        />
      ) : (
        <Note>Wakes by itself on render, sleeps after 5 idle minutes. Stop ends the idle billing now.</Note>
      )}
    </div>
  );
}
