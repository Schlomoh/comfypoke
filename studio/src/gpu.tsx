// The GPU worker's state, polled only while the page is visible: every request keeps the studio
// container awake, and a phone in a pocket should let it sleep. Shown in the activity sheet (activity.tsx).
import { useEffect, useRef, useState } from "react";
import { api, Locked, type Gpu, type GpuState } from "./api";
import { Btn, Check, errorText } from "./ui";

export const LABEL: Record<GpuState, string> = { cold: "OFF", starting: "BOOTING", warm: "WARM", busy: "BUSY" };
export const TONE: Record<GpuState, string> = { cold: "text-faint", starting: "text-warn", warm: "text-ok", busy: "text-ok" };

export function useGpu(onLocked: () => void) {
  const [gpu, setGpu] = useState<Gpu | null>(null);
  const [at, setAt] = useState(0);
  const locked = useRef(onLocked);
  locked.current = onLocked;

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      api.gpu().then(
        (g) => {
          setGpu(g);
          setAt(Date.now());
        },
        (e) => e instanceof Locked && locked.current(),
      );
    };
    refresh();
    const timer = setInterval(refresh, 5000);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const set = (g: Gpu) => {
    setGpu(g);
    setAt(Date.now());
  };
  return { gpu, at, set };
}

export type GpuHandle = ReturnType<typeof useGpu>;

/** Seconds until the worker sleeps, counted down between polls. */
export function idlesIn({ gpu, at }: GpuHandle, now: number) {
  return gpu?.idles_in == null ? null : Math.max(0, gpu.idles_in - (now - at) / 1000);
}

export function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

export const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Facts and controls. Stop waits for nothing to run; Force stop, once armed, ends renders mid-way. */
export function GpuPanel(handle: GpuHandle) {
  const { gpu, set } = handle;
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [armed, setArmed] = useState(false);
  const now = useNow(gpu?.state === "warm");
  const busy = gpu?.state === "busy" || gpu?.state === "starting";
  useEffect(() => setArmed(false), [busy]); // armed for this run only
  if (!gpu) return <p className="font-mono text-xs text-faint">GPU …</p>;

  const idles = idlesIn(handle, now);
  const act = async (fn: () => Promise<Gpu>) => {
    setError("");
    setPending(true);
    try {
      set(await fn());
      setArmed(false);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  const facts = [
    ["state", <span className={TONE[gpu.state]}>{LABEL[gpu.state]}{idles != null && <span className="text-muted"> · sleeps in {clock(idles)}</span>}</span>],
    ["gpu", gpu.gpu],
    ["rate", `$${gpu.rate_per_hour.toFixed(2)}/h`],
    ["session", `$${gpu.session_cost.toFixed(3)}`],
    ...(gpu.credits ? [["credits left", `$${gpu.credits.left.toFixed(2)} / $${gpu.credits.monthly}`]] : []),
  ];
  return (
    <div className="flex flex-col gap-3">
      <dl className="grid grid-cols-2 border-t border-line font-mono text-xs tabular-nums">
        {facts.map(([k, v]) => (
          <div key={String(k)} className="contents">
            <dt className="border-b border-line py-2 text-faint">{k}</dt>
            <dd className="border-b border-line py-2 text-right">{v}</dd>
          </div>
        ))}
      </dl>
      {error && <p role="alert" className="font-mono text-xs break-words text-bad">{error}</p>}
      <div className="grid grid-cols-2 gap-2">
        <Btn disabled={pending || busy} onClick={() => act(api.wake)}>{gpu.state === "warm" ? "Extend" : "Wake"}</Btn>
        {busy ? (
          <Btn variant="danger" disabled={pending || !armed} onClick={() => act(() => api.stop(true))}>Force stop</Btn>
        ) : (
          <Btn disabled={pending || gpu.state !== "warm"} onClick={() => act(() => api.stop())}>Stop</Btn>
        )}
      </div>
      {busy ? (
        <Check on={armed} onChange={setArmed} label={<span className="text-xs text-muted">Allow a force stop: running renders are lost and the worker exits now</span>} />
      ) : (
        <p className="text-xs text-faint">Wakes by itself on render, sleeps after 5 idle minutes. Stop ends the idle billing now.</p>
      )}
    </div>
  );
}
