// What Generate sends: one render per combination of versions, once per seed, each its own job. With
// shared seeds the versions of one seed differ only by the phrases that vary.
import { api } from "./api";
import { axes, collapse, combos, compose, type Recipe } from "./recipe";
import { Check, Seg, Sheet } from "./ui";

export const randomSeed = () => Math.floor(Math.random() * 2 ** 32);

export type Planned = { prompt: string; seed: number | null; recipe: Recipe; changes: string[]; seedLabel: string };

/** Seeds outermost, so the versions of one seed sit next to each other in the library. */
export function plan(r: Recipe, triggers: string[], base = r.seed ?? randomSeed()): Planned[] {
  const ax = axes(r);
  const out: Planned[] = [];
  for (let s = 0; s < r.count; s++)
    for (const choice of combos(r)) {
      const seed = r.sameSeed ? base + s : r.seed == null ? null : r.seed + out.length;
      out.push({
        prompt: compose(r, triggers, (p) => choice.get(p.id) ?? p.t),
        seed,
        recipe: { ...collapse(r, choice), seed, count: 1 }, // what Reuse brings back: this render exactly
        changes: ax.map((a) => `${a.owner} · ${a.row}: ${choice.get(a.phrase.id)}`),
        seedLabel: r.sameSeed ? (r.count > 1 ? `seed ${s + 1} of ${r.count}` : "one seed") : r.seed == null ? "random seed" : `seed ${seed}`,
      });
    }
  return out;
}

/** "6 renders: 3 wearing × 2 shot", or null for a single render. */
export function summary(r: Recipe) {
  const ax = axes(r);
  const n = ax.reduce((m, a) => m * a.values.length, 1) * r.count;
  if (n === 1) return null;
  return `${n} renders: ${[...ax.map((a) => `${a.values.length} ${a.row.toLowerCase()}`), ...(r.count > 1 ? [`${r.count} seeds`] : [])].join(" × ")}`;
}

export function RenderSheet({ open, onClose, recipe, set, triggers, seconds, rate }: {
  open: boolean;
  onClose: () => void;
  recipe: Recipe;
  set: (r: Recipe) => void;
  triggers: string[];
  seconds: number | null; // one render on this device, or null before the first
  rate: number | null; // dollars per GPU hour
}) {
  const runs = open ? plan(recipe, triggers, 0) : [];
  const total = seconds == null ? null : seconds * runs.length;
  return (
    <Sheet open={open} onClose={onClose} title={`${runs.length} separate render${runs.length === 1 ? "" : "s"}`}>
      <span className="label">Seeds</span>
      <Seg value={recipe.count} options={[1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} onChange={(count) => set({ ...recipe, count })} />
      <Check on={recipe.sameSeed} onChange={(sameSeed) => set({ ...recipe, sameSeed })} label={
        <span className="text-[13px]">Same seeds for every version<br /><span className="text-xs text-faint">{recipe.sameSeed ? "Images differ only by the phrases that vary." : "Every render gets its own seed."}</span></span>
      } className="py-1" />
      <Check on={recipe.stopAfter} onChange={(stopAfter) => (set({ ...recipe, stopAfter }), api.stopAfter(stopAfter).catch(() => {}))} label={
        <span className="text-[13px]">Stop the GPU when the queue is done<br /><span className="text-xs text-faint">Review without paying for idle time; the next render boots it again in about a minute.</span></span>
      } className="py-1" />
      <dl className="grid grid-cols-[1fr_auto] border-t border-line font-mono text-xs tabular-nums">
        <dt className="border-b border-line py-2 text-faint">time, warm GPU</dt>
        <dd className="border-b border-line py-2 text-right">{total == null ? "no estimate yet" : `≈ ${total < 90 ? `${Math.round(total)} s` : `${(total / 60).toFixed(1)} min`}`}</dd>
        <dt className="border-b border-line py-2 text-faint">cost</dt>
        <dd className="border-b border-line py-2 text-right">{total == null || rate == null ? "?" : `≈ $${((total * rate) / 3600).toFixed(3)}`}</dd>
      </dl>
      <span className="label">Each render, one after another</span>
      <div className="flex flex-col gap-2">
        {runs.slice(0, 40).map((run, i) => (
          <div key={i} className="flex flex-col gap-1.5 border border-line bg-bg p-2.5">
            <div className="flex justify-between font-mono text-[11px] text-muted">
              <span>Render {i + 1} of {runs.length}</span>
              <span>{run.seedLabel}</span>
            </div>
            {run.changes.length > 0 && <div className="text-xs text-warn">{run.changes.map((c) => <div key={c}>{c}</div>)}</div>}
            <details className="font-mono text-[11px] leading-relaxed text-faint">
              <summary className="flex min-h-8 cursor-pointer items-center text-muted">full prompt</summary>
              {run.prompt}
            </details>
          </div>
        ))}
        {runs.length > 40 && <p className="text-xs text-faint">and {runs.length - 40} more</p>}
      </div>
    </Sheet>
  );
}
