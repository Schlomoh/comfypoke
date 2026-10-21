// The GPU readout in the header and its sheet on a phone. Polls only while the page is visible: every request
// keeps the studio container awake, and a phone in a pocket should let it sleep.
import { useEffect, useRef, useState } from "react";
import { api, Locked, type Gpu, type GpuState } from "./api";
import { Btn, errorText } from "./ui";

const LABEL: Record<GpuState, string> = { cold: "OFF", starting: "BOOTING", warm: "WARM", busy: "BUSY" };
const TONE: Record<GpuState, string> = { cold: "text-faint", starting: "text-warn", warm: "text-ok", busy: "text-ok" };

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

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/** Header readout plus controls. On a phone it collapses to the state and opens a sheet. */
export function GpuBar({ gpu, at, set }: { gpu: Gpu | null; at: number; set: (g: Gpu) => void }) {
  const sheet = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const now = useNow(gpu?.state === "warm");
  if (!gpu) return <span className="font-mono text-xs text-faint">GPU …</span>;

  const idles = gpu.idles_in == null ? null : Math.max(0, gpu.idles_in - (now - at) / 1000);
  const act = async (fn: () => Promise<Gpu>) => {
    setError("");
    setPending(true);
    try {
      set(await fn());
    } catch (e) {
      setError(errorText(e));
    } finally {
      setPending(false);
    }
  };
  const state = (
    <span className="flex items-center gap-2 font-mono text-xs tabular-nums">
      <span className="text-faint">{gpu.gpu}</span>
      <span className={TONE[gpu.state]}>{LABEL[gpu.state]}</span>
      {idles != null && <span className="text-muted" title="Sleeps in">{clock(idles)}</span>}
    </span>
  );
  const facts = [
    ["rate", `$${gpu.rate_per_hour.toFixed(2)}/h`],
    ["session", `$${gpu.session_cost.toFixed(3)}`],
    ...(gpu.credits ? [["credits left", `$${gpu.credits.left.toFixed(2)} / $${gpu.credits.monthly}`]] : []),
  ];
  const controls = (
    <>
      <Btn disabled={pending || gpu.state === "starting" || gpu.state === "busy"} onClick={() => act(api.wake)}>
        {gpu.state === "warm" ? "Extend" : "Wake"}
      </Btn>
      <Btn disabled={pending || gpu.state !== "warm"} onClick={() => act(api.stop)}>Stop</Btn>
    </>
  );

  return (
    <>
      <div className="hidden items-center gap-4 lg:flex">
        {state}
        {facts.map(([k, v]) => (
          <span key={k} className="font-mono text-xs text-faint tabular-nums">
            {k} <span className="text-muted">{v}</span>
          </span>
        ))}
        {error && <span className="max-w-60 truncate font-mono text-xs text-bad" title={error}>{error}</span>}
        <div className="flex gap-1">{controls}</div>
      </div>
      <button onClick={() => sheet.current?.showModal()} className="flex h-10 items-center border border-line px-3 lg:hidden">
        {state}
      </button>
      <dialog
        ref={sheet}
        onClick={(e) => e.target === sheet.current && sheet.current.close()}
        className="mx-0 mt-auto mb-0 w-screen max-w-none border-t border-line bg-panel p-0 text-ink"
      >
        <div className="flex flex-col gap-3 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between">
            <h2 className="label">GPU worker</h2>
            {state}
          </div>
          <dl className="grid grid-cols-2 border-t border-line font-mono text-xs tabular-nums">
            {facts.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="border-b border-line py-2 text-faint">{k}</dt>
                <dd className="border-b border-line py-2 text-right">{v}</dd>
              </div>
            ))}
          </dl>
          {error && <p className="font-mono text-xs text-bad">{error}</p>}
          <div className="grid grid-cols-2 gap-2">{controls}</div>
          <p className="text-xs text-faint">Wakes by itself on render, sleeps after 5 idle minutes. Stop ends the idle billing now.</p>
        </div>
      </dialog>
    </>
  );
}
