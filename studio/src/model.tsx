// Everything about how the image is made rather than what is in it.
import { useLiveQuery } from "dexie-react-hooks";
import { useEffect, useRef, useState } from "react";
import type { Catalog } from "./api";
import { db } from "./db";
import { ASPECTS, MEGAPIXELS, size, type Recipe, type StackLora } from "./recipe";
import { shortName } from "./stage";
import { Btn, Check, Section, Seg } from "./ui";

const newSeed = () => Math.floor(Math.random() * 2 ** 32);

/** A field typed into while its value can also change from elsewhere (the slider, a note loading). */
function useEditable(value: string) {
  const ref = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(value);
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(value);
  }, [value]);
  return [ref, text, setText] as const;
}

// Both fields apply on every keystroke: a tap on Generate (or Cmd+Enter) must not race a blur.
function LoraTuning({ lora, trigger, onStrength }: { lora: StackLora; trigger: string; onStrength: (v: number) => void }) {
  const [strengthRef, strength, setStrength] = useEditable(String(lora.strength));
  const [triggerRef, words, setWords] = useEditable(trigger);
  return (
    <>
      <div className="flex items-center gap-2">
        <input
          type="range"
          min={-6}
          max={6}
          step={0.05}
          value={lora.strength}
          onChange={(e) => onStrength(Number(e.target.value))}
          className="h-8 min-w-0 flex-1"
        />
        <input
          ref={strengthRef}
          inputMode="decimal"
          value={strength}
          onChange={(e) => {
            setStrength(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== "" && Number.isFinite(v)) onStrength(Math.max(-8, Math.min(8, v))); // the slider stops at ±6, typing goes to ±8
          }}
          onBlur={() => setStrength(String(lora.strength))}
          className="field h-8 w-16 px-2 text-right font-mono tabular-nums"
        />
      </div>
      <input
        ref={triggerRef}
        value={words}
        onChange={(e) => {
          setWords(e.target.value);
          db.loraNotes.put({ name: lora.name, trigger: e.target.value.trim() });
        }}
        placeholder="trigger words (kept on this device, added to the prompt)"
        className="field h-8 px-2 placeholder:text-faint"
      />
    </>
  );
}

function Loras({ recipe, set, available }: { recipe: Recipe; set: (r: Recipe) => void; available: string[] }) {
  const notes = useLiveQuery(() => db.loraNotes.toArray(), []) ?? [];
  const unused = available.filter((n) => !recipe.loras.some((l) => l.name === n));
  const put = (i: number, patch: Partial<Recipe["loras"][number]>) =>
    set({ ...recipe, loras: recipe.loras.map((l, j) => (j === i ? { ...l, ...patch } : l)) });

  return (
    <Section title={`LoRAs · ${recipe.loras.filter((l) => l.on).length} active`}>
      {recipe.loras.map((l, i) => (
        <div key={l.name} className={`flex flex-col gap-1.5 border border-line bg-bg p-2 ${l.on ? "" : "opacity-45"}`}>
          <div className="flex items-center gap-1">
            <Check on={l.on} onChange={(on) => put(i, { on })} title={l.on ? "Bypass" : "Enable"} />
            <span className="min-w-0 flex-1 truncate font-mono text-xs" title={l.name}>{shortName(l.name)}</span>
            <button
              onClick={() => set({ ...recipe, loras: recipe.loras.filter((_, j) => j !== i) })}
              className="h-11 px-2 font-mono text-[10.5px] fine:h-8 text-faint uppercase hover:text-bad"
            >
              remove
            </button>
          </div>
          <LoraTuning lora={l} trigger={notes.find((n) => n.name === l.name)?.trigger ?? ""} onStrength={(strength) => put(i, { strength })} />
        </div>
      ))}
      {available.length === 0 ? (
        <p className="text-xs text-faint">
          No LoRAs on the volume yet. Upload one with <code className="font-mono text-muted">tools/sync.sh lora file.safetensors</code>.
        </p>
      ) : (
        unused.length > 0 && (
          <select
            value=""
            onChange={(e) => set({ ...recipe, loras: [...recipe.loras, { name: e.target.value, strength: 1, on: true }] })}
            className="field h-11 px-2 text-muted fine:h-8"
          >
            <option value="">+ Add LoRA</option>
            {unused.map((n) => (
              <option key={n} value={n}>{shortName(n)}</option>
            ))}
          </select>
        )
      )}
    </Section>
  );
}

/** What will actually be sent: the family the user picked or the one suggested, and its defaults. */
export function resolve(recipe: Recipe, catalog: Catalog) {
  const model = catalog.models.find((m) => m.file === recipe.unet);
  const family = catalog.families.find((f) => f.id === (recipe.family ?? model?.family ?? "krea2"));
  // a verified model's own settings apply only in the family it was verified in
  const defaults = model && family && model.family === family.id ? model : family;
  const steps = recipe.steps ?? defaults?.steps ?? 8;
  const cfg = recipe.cfg ?? defaults?.cfg ?? 1;
  return { model, family, defaults, steps, cfg, negative: cfg > 1 };
}

export function ModelPanel({ recipe, set, catalog }: { recipe: Recipe; set: (r: Recipe) => void; catalog: Catalog }) {
  const { model, family, defaults, negative } = resolve(recipe, catalog);
  const aspect = size(recipe.aspect, recipe.mp);
  // Empty, zero or nonsense means "the default", the same rule the server applies to a missing value.
  const num = (v: string, whole = false) => {
    const n = whole ? Math.round(Number(v)) : Number(v);
    return v.trim() === "" || !Number.isFinite(n) || n <= 0 ? null : n;
  };
  const loras = catalog.loras;
  const option = (m: Catalog["models"][number]) => (
    <option key={m.file} value={m.file}>{shortName(m.file)}</option>
  );

  return (
    <div>
      <Section title="Model" right={model && !model.verified && <span className="font-mono text-[10.5px] text-warn uppercase">unverified</span>}>
        <select
          value={recipe.unet}
          onChange={(e) => set({ ...recipe, unet: e.target.value, family: null, steps: null, cfg: null })}
          className="field h-11 px-2 font-mono fine:h-8"
        >
          {!model && catalog.models.length > 0 && <option value={recipe.unet}>{shortName(recipe.unet)} (not on the volume)</option>}
          <optgroup label="Verified">{catalog.models.filter((m) => m.verified).map(option)}</optgroup>
          <optgroup label="Unverified, at your own risk">{catalog.models.filter((m) => !m.verified).map(option)}</optgroup>
        </select>
        <div className="flex items-center gap-2">
          <span className="label w-14">Family</span>
          <Seg
            className="flex-1"
            value={family?.id ?? ""}
            options={catalog.families.map((f) => ({ value: f.id, label: f.label }))}
            onChange={(v) => set({ ...recipe, family: v === model?.family ? null : v, steps: null, cfg: null })}
          />
        </div>
        <p className="font-mono text-xs text-faint">
          {defaults?.steps} steps · CFG {defaults?.cfg} · {negative ? "negative prompt on" : "no negative prompt (CFG 1)"}
          {recipe.family && " · family set by hand"}
        </p>
        {model && !model.verified && (
          <p className="text-xs text-warn/80">
            Not tested in the studio. It runs with the {family?.label} text encoder, VAE and sampler, guessed from the file
            name. If the file is another kind of model, the render fails after the GPU has loaded it, and that time is billed.
          </p>
        )}
      </Section>
      {negative && (
        <Section title="Negative prompt">
          <textarea
            value={recipe.negative}
            onChange={(e) => set({ ...recipe, negative: e.target.value })}
            rows={2}
            className="field field-sizing-content min-h-10 resize-none px-2.5 py-2"
          />
        </Section>
      )}
      <Loras recipe={recipe} set={set} available={loras} />
      <Section title="Size" right={<span className="font-mono text-xs text-faint tabular-nums">{aspect.width}×{aspect.height}</span>}>
        <Seg value={recipe.aspect} options={ASPECTS.map((a) => ({ value: a.label, label: a.label }))} onChange={(v) => set({ ...recipe, aspect: v })} />
        <Seg value={recipe.mp} options={MEGAPIXELS.map((m) => ({ value: m, label: `${m} MP` }))} onChange={(v) => set({ ...recipe, mp: v })} />
        {recipe.mp > 1 && (
          <p className="text-xs text-faint">
            Past the 1 MP these models were trained at: expect repeated subjects or stretched bodies, and slower renders.
          </p>
        )}
      </Section>
      <Section title="Seed">
        <div className="flex gap-2">
          <Seg
            className="w-40"
            value={recipe.seed == null ? "random" : "fixed"}
            options={[{ value: "random", label: "Random" }, { value: "fixed", label: "Fixed" }]}
            onChange={(v) => set({ ...recipe, seed: v === "random" ? null : newSeed() })}
          />
          {recipe.seed != null && (
            <>
              <input
                inputMode="numeric"
                value={recipe.seed}
                onChange={(e) => set({ ...recipe, seed: Number(e.target.value.replace(/\D/g, "")) || 0 })}
                className="field h-11 min-w-0 flex-1 px-2 font-mono tabular-nums fine:h-8"
              />
              <Btn onClick={() => set({ ...recipe, seed: newSeed() })} title="New seed">New</Btn>
            </>
          )}
        </div>
        {recipe.seed != null && recipe.count > 1 && (
          <p className="text-xs text-faint">A batch counts up from this seed.</p>
        )}
      </Section>
      <Section title="Batch">
        <Seg value={recipe.count} options={[1, 2, 3, 4].map((n) => ({ value: n, label: `×${n}` }))} onChange={(v) => set({ ...recipe, count: v })} />
      </Section>
      <Section
        title="Sampling"
        right={(recipe.steps != null || recipe.cfg != null) && (
          <button onClick={() => set({ ...recipe, steps: null, cfg: null })} className="h-11 px-2 font-mono text-[10.5px] fine:h-8 text-muted uppercase hover:text-ink">
            reset
          </button>
        )}
      >
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col gap-1">
            <span className="label">Steps</span>
            <input
              inputMode="numeric"
              value={recipe.steps ?? ""}
              placeholder={String(defaults?.steps ?? "")}
              onChange={(e) => set({ ...recipe, steps: num(e.target.value, true) })}
              className="field h-11 px-2 font-mono tabular-nums placeholder:text-faint fine:h-8"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label">CFG</span>
            <input
              inputMode="decimal"
              value={recipe.cfg ?? ""}
              placeholder={String(defaults?.cfg ?? "")}
              onChange={(e) => set({ ...recipe, cfg: num(e.target.value) })}
              className="field h-11 px-2 font-mono tabular-nums placeholder:text-faint fine:h-8"
            />
          </label>
        </div>
        <p className="text-xs text-faint">Empty uses the model's default.</p>
      </Section>
    </div>
  );
}
