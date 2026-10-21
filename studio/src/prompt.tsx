// The prompt as the people in the picture and its scene. A tab is a person (or the scene), linked to
// a saved character (or scene) or new, and says which. Each row holds phrases, one idea each; a
// phrase can carry versions, and every version is its own render. The prompt underneath is what is sent.
import { useState, type Dispatch, type SetStateAction } from "react";
import { db, deleteSaved, putSaved, usePresets, useSaved, useSpace, type Saved } from "./db";
import {
  axes, compose, MAX_PEOPLE, newPerson, PERSON_ROWS, phrase, PRESETS, ROWS, SCENE_ROWS, SIDES,
  type Depth, type Person, type Phrase, type Recipe, type RowId, type Scene,
} from "./recipe";
import { notify } from "./toast";
import { Btn, Check, Seg, Sheet } from "./ui";

type Set = Dispatch<SetStateAction<Recipe>>;
type Key = string; // a person's id, or "scene"
type Kind = "person" | "scene";
type Open = { kind: "row"; key: Key; row: RowId; target: string } | { kind: "link"; key: Key } | null;

const rowOf = (id: RowId) => ROWS.find((r) => r.id === id)!;
const ownerOf = (r: Recipe, key: Key): (Person | Scene) | undefined => (key === "scene" ? r.scene : r.cast.find((c) => c.id === key));
const phrasesOf = (r: Recipe, key: Key, row: RowId) => ((ownerOf(r, key) as Record<RowId, Phrase[]> | undefined)?.[row] ?? []);
const withOwner = (r: Recipe, key: Key, change: (o: any) => any): Recipe =>
  key === "scene" ? { ...r, scene: change(r.scene) } : { ...r, cast: r.cast.map((c) => (c.id === key ? change(c) : c)) };
const withRow = (r: Recipe, key: Key, row: RowId, ps: Phrase[]) => withOwner(r, key, (o) => ({ ...o, [row]: ps }));

// ---- the link to a saved character or scene ----------------------------------------------------------------

const defsOf = (kind: Kind) => (kind === "scene" ? SCENE_ROWS : PERSON_ROWS);
const snap = (ps: Phrase[] | undefined) => JSON.stringify((ps ?? []).map(({ t, on, versions }) => [t, on, versions]));
const rowsToSave = (kind: Kind, o: any) => Object.fromEntries(defsOf(kind).map((d) => [d.id, (o[d.id] as Phrase[]).filter((p) => p.t.trim())]));
const freshRows = (kind: Kind, s: Saved) => Object.fromEntries(defsOf(kind).map((d) => [d.id, (s.rows[d.id] ?? []).map((p) => ({ ...p, id: crypto.randomUUID() }))]));

function linkState(kind: Kind, o: Person | Scene, saved: Saved[]) {
  const s = saved.find((x) => x.kind === kind && x.id === o.savedId);
  const rows = o as unknown as Record<RowId, Phrase[]>;
  const diff = s ? [...(s.name !== o.name ? ["name"] : []), ...defsOf(kind).filter((d) => snap(rows[d.id]) !== snap(s.rows[d.id])).map((d) => d.label.toLowerCase())] : [];
  return { s, diff, changed: diff.length > 0 };
}

// ---- the panel ---------------------------------------------------------------------------------------------

export function PromptPanel({ recipe, set, triggers, onRenders }: { recipe: Recipe; set: Set; triggers: string[]; onRenders: () => void }) {
  const [tab, setTab] = useState<Key>(recipe.cast[0].id);
  const [open, setOpen] = useState<Open>(null);
  const saved = useSaved() ?? [];
  const key = tab === "scene" || recipe.cast.some((c) => c.id === tab) ? tab : recipe.cast[0].id; // a Reuse can replace the people
  const person = recipe.cast.find((c) => c.id === key);

  const addPerson = () => {
    let k = 1;
    while (recipe.cast.some((c) => c.name === `Person ${k}`)) k++;
    const p = newPerson(`Person ${k}`);
    set({ ...recipe, cast: [...recipe.cast, p] });
    setTab(p.id);
    requestAnimationFrame(() => document.getElementById(`tab-${p.id}`)?.scrollIntoView({ inline: "nearest", block: "nearest" }));
  };

  return (
    <div>
      <CastTabs recipe={recipe} saved={saved} active={key} onTab={(k) => (k === key ? setOpen({ kind: "link", key: k }) : setTab(k))} onMenu={() => setOpen({ kind: "link", key })} onAdd={addPerson} />
      <section className="flex flex-col gap-3 border-b border-line px-4 py-3">
        {person && recipe.cast.length > 1 && <Placement person={person} set={(p) => set((r) => withOwner(r, p.id, () => p))} />}
        {(person ? PERSON_ROWS : SCENE_ROWS).map((row) => (
          <Row key={row.id} phrases={phrasesOf(recipe, key, row.id)} label={row.label} hint={row.hint} onOpen={(shown) => {
            // the sheet always opens adding a new phrase; a tapped chip only brings its card into view
            setOpen({ kind: "row", key, row: row.id, target: "new" });
            if (shown) setTimeout(() => flash(shown), 60);
          }} />
        ))}
      </section>
      <PromptBox recipe={recipe} triggers={triggers} onRenders={onRenders} />
      <RowSheet open={open?.kind === "row" ? open : null} recipe={recipe} set={set} onTarget={(target) => open?.kind === "row" && setOpen({ ...open, target })} onClose={() => setOpen(null)} />
      <LinkSheet
        open={open?.kind === "link" ? open.key : null}
        recipe={recipe}
        set={set}
        saved={saved}
        onRemoved={(next) => setTab(next)}
        onClose={() => setOpen(null)}
      />
    </div>
  );
}

function CastTabs({ recipe, saved, active, onTab, onMenu, onAdd }: {
  recipe: Recipe;
  saved: Saved[];
  active: Key;
  onTab: (k: Key) => void;
  onMenu: () => void;
  onAdd: () => void;
}) {
  const varied = new Set(axes(recipe).map((a) => a.owner));
  const tab = (key: Key, name: string, kind: Kind, o: Person | Scene) => {
    const st = linkState(kind, o, saved);
    const on = key === active;
    return (
      <div key={key} id={`tab-${key}`} className={`flex shrink-0 ${on ? "bg-raised shadow-[inset_0_-2px_0_var(--color-ink)]" : ""}`}>
        <button onClick={() => onTab(key)} aria-pressed={on} className={`flex h-11 items-center gap-1.5 pr-2 pl-3 text-[13px] ${on ? "text-ink" : "text-muted"}`}>
          {varied.has(kind === "scene" ? "Scene" : name) && <span className="size-1.5 bg-warn" title="has versions" />}
          {name}
          {!st.s ? (
            <span className="border border-line px-1 font-mono text-[10px] text-faint" title="not saved">new</span>
          ) : st.changed ? (
            <span className="border border-edge px-1 font-mono text-[10px] text-ink" title="changed since saved">edited</span>
          ) : null}
        </button>
        {on && (
          <button onClick={onMenu} aria-label={`${name}: name, save, use a saved one`} className="h-11 w-10 border-l border-line text-lg text-muted hover:text-ink">⋯</button>
        )}
      </div>
    );
  };
  return (
    <div className="sticky top-[calc(2.75rem+env(safe-area-inset-top))] z-[5] flex border-b border-line bg-bg lg:top-0">
      <div className="flex min-w-0 flex-1 overflow-x-auto [scrollbar-width:none]">{recipe.cast.map((c) => tab(c.id, c.name, "person", c))}</div>
      <div className="flex shrink-0 border-l border-edge">
        {tab("scene", "Scene", "scene", recipe.scene)}
        <button onClick={onAdd} disabled={recipe.cast.length >= MAX_PEOPLE} aria-label="Add a person" title={recipe.cast.length >= MAX_PEOPLE ? `At most ${MAX_PEOPLE} people` : "Add a person"} className="h-11 w-11 border-l border-line text-lg text-muted hover:text-ink disabled:opacity-35">+</button>
      </div>
    </div>
  );
}

function Placement({ person, set }: { person: Person; set: (p: Person) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">Side</span>
      <div className="flex gap-1.5">
        {SIDES.map((s) => {
          const on = person.side.includes(s);
          return (
            <button key={s} onClick={() => set({ ...person, side: on ? person.side.filter((x) => x !== s) : [...person.side, s] })} aria-pressed={on}
              className={`h-10 border px-3 text-[13px] fine:h-8 ${on ? "border-ink bg-ink text-bg" : "border-edge bg-panel text-ink"}`}>{s}</button>
          );
        })}
      </div>
      <span className="label">Depth</span>
      <Seg value={person.depth} options={(["auto", "front", "back"] as Depth[]).map((d) => ({ value: d, label: d }))} onChange={(depth) => set({ ...person, depth })} />
      <p className="text-xs text-faint">{person.side.length ? "Others can share the same spot." : "No side picked: placed anywhere."}</p>
    </div>
  );
}

function Row({ phrases, label, hint, onOpen }: { phrases: Phrase[]; label: string; hint: string; onOpen: (shown?: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="label">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {phrases.filter((p) => p.t.trim()).map((p) => (
          <button key={p.id} onClick={() => onOpen(p.id)}
            className={`flex min-h-10 max-w-full items-center gap-2 border bg-panel px-2.5 py-1.5 text-left text-[13px] fine:min-h-8 ${p.on ? "border-edge text-ink" : "border-line text-faint line-through"} ${p.on && p.versions.length ? "border-l-[3px] border-l-warn" : ""}`}>
            <span className="min-w-0 break-words">{p.t}</span>
            {p.on && p.versions.length > 0 && <span className="bg-warn/15 px-1.5 font-mono text-[10.5px] text-warn no-underline" title={`${p.versions.length + 1} versions`}>{p.versions.length + 1}</span>}
          </button>
        ))}
        <button onClick={() => onOpen()} className="min-h-10 border border-dashed border-edge px-2.5 text-[13px] text-faint hover:text-ink fine:min-h-8">
          + {phrases.length ? "add" : hint}
        </button>
      </div>
    </div>
  );
}

function PromptBox({ recipe, triggers, onRenders }: { recipe: Recipe; triggers: string[]; onRenders: () => void }) {
  const varied = axes(recipe).length > 0;
  // the varied phrases inline with all their versions, marked so they can be drawn apart
  const text = compose(recipe, triggers, (p) => (p.versions.length ? `\u0001${[p.t, ...p.versions].join(" / ")}\u0002` : p.t));
  const plain = compose(recipe, triggers);
  return (
    <section className="flex flex-col gap-2 border-b border-line px-4 py-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="label">Prompt · {plain.length} chars</h3>
        {varied ? (
          <button onClick={onRenders} className="h-11 px-2 font-mono text-[10.5px] text-muted uppercase underline underline-offset-4 hover:text-ink fine:h-8">see each render</button>
        ) : (
          <button disabled={!plain} onClick={() => navigator.clipboard?.writeText(plain).then(() => notify("Prompt copied"), () => notify("Could not copy the prompt", { bad: true }))}
            className="h-11 px-2 font-mono text-[10.5px] text-muted uppercase hover:text-ink disabled:opacity-35 fine:h-8">copy</button>
        )}
      </div>
      <p className="min-h-10 border border-line bg-bg p-2.5 font-mono text-xs leading-relaxed text-muted">
        {plain
          ? text.split(/(\u0001[^\u0002]*\u0002)/).map((part, i) =>
              part.startsWith("\u0001") ? <span key={i} className="bg-warn/15 text-warn">[{part.slice(1, -1)}]</span> : part)
          : "Add a phrase to a row to build the prompt."}
      </p>
      {triggers.length > 0 && <p className="text-xs text-faint">Starts with the trigger words of the active LoRAs.</p>}
    </section>
  );
}

// ---- one sheet per row: its phrases to edit, and a pinned picker that adds ---------------------------------

function flash(id: string) {
  const el = document.getElementById(`card-${id}`);
  if (!el) return;
  el.scrollIntoView({ block: "center" });
  el.classList.remove("flash-card");
  void el.offsetWidth; // restart the animation
  el.classList.add("flash-card");
}

function RowSheet({ open, recipe, set, onTarget, onClose }: {
  open: { key: Key; row: RowId; target: string } | null;
  recipe: Recipe;
  set: Set;
  onTarget: (target: string) => void;
  onClose: () => void;
}) {
  const presets = usePresets() ?? [];
  const [subs, setSubs] = useState<Record<string, string>>({}); // the subcategory last open, per row and per phrase
  const [keep, setKeep] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [typed, setTyped] = useState("");
  const owner = open && ownerOf(recipe, open.key);
  if (!open || !owner) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const { key, row } = open;
  const def = rowOf(row);
  const ps = phrasesOf(recipe, key, row);
  const target = ps.find((p) => p.id === open.target);
  const put = (next: Phrase[]) => set((r) => withRow(r, key, row, next));
  const change = (id: string, f: (p: Phrase) => Phrase) => put(ps.map((p) => (p.id === id ? f(p) : p)));
  const remove = (p: Phrase) => {
    const at = ps.findIndex((x) => x.id === p.id);
    put(ps.filter((x) => x.id !== p.id));
    // Undo puts back this phrase alone, so edits made since stay
    notify(`Removed “${p.t}”`, { action: { label: "Undo", run: () => set((r) => {
      const now = phrasesOf(r, key, row);
      return withRow(r, key, row, [...now.slice(0, at), p, ...now.slice(at)]);
    }) } });
  };

  const mine = presets.filter((p) => p.block === row);
  const groups: [string, string[]][] = [...(mine.length ? [["Yours", mine.map((p) => p.text)] as [string, string[]]] : []), ...Object.entries(PRESETS[row])];
  const subKey = target ? `${row}:${target.id}` : row;
  const home = target && groups.find(([g, xs]) => g !== "Yours" && xs.includes(target.t))?.[0];
  const sub = groups.find(([g]) => g === subs[subKey])?.[0] ?? home ?? groups.find(([g]) => g !== "Yours")?.[0] ?? groups[0]?.[0];
  const items = groups.find(([g]) => g === sub)?.[1] ?? [];
  const has = (x: string) => (target ? x === target.t || target.versions.includes(x) : ps.some((p) => p.t === x));
  const add = (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (target) {
      if (t !== target.t && !target.versions.includes(t)) change(target.id, (p) => ({ ...p, versions: [...p.versions, t] }));
    } else if (!ps.some((p) => p.t === t)) put([...ps, phrase(t)]);
  };
  const who = key === "scene" ? "Scene" : (owner as Person).name;
  const close = () => (setTyped(""), setRemoving(false), onClose()); // typed text never follows into another row

  return (
    <Sheet open onClose={close} title={`${who} · ${def.label}`}>
      <div className="flex flex-col gap-2">
        {ps.length === 0 && <p className="text-xs text-faint">Nothing in {def.label} yet. Pick from below or type one.</p>}
        {ps.map((p) => (
          <div key={p.id} id={`card-${p.id}`} className={`border bg-bg ${p.id === open.target ? "border-warn" : "border-line"}`}>
            <div className="flex items-center">
              <button onClick={() => change(p.id, (x) => ({ ...x, on: !x.on }))} role="checkbox" aria-checked={p.on}
                aria-label={p.on ? "In the prompt; tap to leave it out" : "Left out; tap to use it"} className="grid size-11 shrink-0 place-items-center">
                <span className={`block size-3.5 border ${p.on ? "border-ink bg-ink" : "border-control"}`} />
              </button>
              <input
                value={p.t}
                onChange={(e) => change(p.id, (x) => ({ ...x, t: e.target.value }))}
                onBlur={(e) => !e.target.value.trim() && remove({ ...p, t: p.t || "phrase" })}
                aria-label="Phrase"
                className={`field h-11 min-w-0 flex-1 border-transparent bg-transparent px-1 focus:border-control fine:h-9 ${p.on ? "" : "text-faint line-through"}`}
              />
              <button onClick={() => remove(p)} aria-label={`Remove ${p.t}`} className="size-11 shrink-0 text-lg text-faint hover:text-bad">×</button>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 pr-2 pb-2 pl-11">
              {p.versions.map((v, i) => (
                <span key={v + i} className="inline-flex max-w-full items-center border border-warn bg-warn/10 text-warn">
                  <span className="min-w-0 py-1.5 pl-2.5 text-xs break-words">or {v}</span>
                  <button
                    onClick={() => {
                      change(p.id, (x) => ({ ...x, versions: x.versions.filter((_, j) => j !== i) }));
                      notify(`Removed the version “${v}”`, { action: { label: "Undo", run: () => set((r) => withRow(r, key, row,
                        phrasesOf(r, key, row).map((x) => (x.id === p.id ? { ...x, versions: [...x.versions.slice(0, i), v, ...x.versions.slice(i)] } : x)))) } });
                    }}
                    aria-label={`Remove the version ${v}`}
                    className="size-9 shrink-0"
                  >×</button>
                </span>
              ))}
              <button onClick={() => onTarget(p.id === open.target ? "new" : p.id)} aria-pressed={p.id === open.target}
                className={`min-h-9 border px-2.5 text-xs ${p.id === open.target ? "border-warn text-warn" : "border-dashed border-edge text-muted"}`}>
                {p.id === open.target ? "adding versions below" : p.versions.length ? "+ version" : "+ versions to compare"}
              </button>
            </div>
          </div>
        ))}
        {ps.some((p) => p.versions.length) && <p className="text-xs text-faint">Each version is a separate render with the same seed; nothing else changes between them.</p>}
      </div>

      <div className="sticky bottom-[calc(-1*max(1rem,env(safe-area-inset-bottom)))] -mx-4 -mb-[max(1rem,env(safe-area-inset-bottom))] flex flex-col gap-2 border-t border-warn bg-raised px-4 pt-2.5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="flex min-h-9 items-center gap-2 text-[13px] text-warn">
          <span className="min-w-0 flex-1">{target ? `Adding versions of “${target.t}”` : `Adding to ${def.label}`}</span>
          {target && <button onClick={() => onTarget("new")} className="font-mono text-[11px] text-muted underline underline-offset-4">add a phrase instead</button>}
        </div>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {groups.map(([g]) => (
              <button key={g} onClick={() => (setSubs({ ...subs, [subKey]: g }), setRemoving(false))} aria-pressed={g === sub}
                className={`h-8 border px-2.5 font-mono text-[11px] ${g === sub ? "border-ink bg-ink text-bg" : "border-line text-muted"}`}>{g}</button>
            ))}
          </div>
        )}
        {items.length > 0 && (
          <div className="flex max-h-[24dvh] flex-wrap gap-1.5 overflow-y-auto overscroll-contain">
            {items.map((x) =>
              removing && sub === "Yours" ? (
                <button key={x} onClick={() => {
                  const p = mine.find((m) => m.text === x)!;
                  db.presets.delete(p.id);
                  if (mine.length === 1) setRemoving(false);
                  notify(`Removed the preset “${x}”`, { action: { label: "Undo", run: () => db.presets.put(p) } });
                }} className="min-h-9 border border-dashed border-edge px-2.5 text-xs text-muted hover:border-bad hover:text-bad">{x} ×</button>
              ) : has(x) ? (
                <button key={x} onClick={() => { const p = ps.find((y) => y.t === x || y.versions.includes(x)); if (p) flash(p.id); }} title="Already added"
                  className="min-h-9 border border-ink bg-ink px-2.5 text-xs text-bg">✓ {x}</button>
              ) : (
                <button key={x} onClick={() => add(x)} className="min-h-9 border border-dashed border-edge px-2.5 text-xs text-muted hover:text-ink">+ {x}</button>
              ),
            )}
            {sub === "Yours" && (
              <button onClick={() => setRemoving(!removing)} className="min-h-9 px-1 font-mono text-[11px] text-muted underline underline-offset-4">{removing ? "done removing" : "remove some of yours"}</button>
            )}
          </div>
        )}
        <form className="flex gap-1.5" onSubmit={(e) => {
          e.preventDefault();
          const t = typed.trim();
          if (!t) return;
          add(t);
          if (keep && !presets.some((p) => p.block === row && p.text === t) && !Object.values(PRESETS[row]).some((xs) => xs.includes(t)))
            db.presets.put({ id: crypto.randomUUID(), block: row, text: t, at: Date.now() });
          setTyped("");
        }}>
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={target ? "or type a version" : `or type one: ${def.hint}`} className="field h-11 min-w-0 flex-1 px-2.5 placeholder:text-faint fine:h-9" />
          <Btn disabled={!typed.trim()}>Add</Btn>
        </form>
        <Check on={keep} onChange={setKeep} label={<span className="text-xs text-muted">Keep what I type as a preset (under Yours, in every workspace)</span>} />
      </div>
    </Sheet>
  );
}

// ---- the ⋯ menu: name, the saved link, and the other saved ones ------------------------------------------------

function LinkSheet({ open, recipe, set, saved, onRemoved, onClose }: {
  open: Key | null;
  recipe: Recipe;
  set: Set;
  saved: Saved[];
  onRemoved: (next: Key) => void;
  onClose: () => void;
}) {
  const space = useSpace();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const o = open ? ownerOf(recipe, open) : undefined;
  if (!open || !o) return <Sheet open={false} onClose={onClose} title="">{null}</Sheet>;

  const kind: Kind = open === "scene" ? "scene" : "person";
  const what = kind === "person" ? "character" : "scene";
  const { s, diff, changed } = linkState(kind, o, saved);
  const list = saved.filter((x) => x.kind === kind);
  const inUse = (x: Saved) => kind === "person" && recipe.cast.some((c) => c !== o && c.savedId === x.id);
  const label = kind === "person" ? o.name : "This scene";
  const close = () => (setNaming(false), setError(""), onClose());
  const replace = (next: Person | Scene) => set((r) => withOwner(r, open, () => next));
  const saveNew = async (n: string) => {
    if (!n || (kind === "person" && /^Person \d+$/.test(n))) return setError(`Give the ${what} a name first${naming ? "" : ", in the Name field above"}.`);
    if (list.some((x) => x.name === n)) return setError(`A saved ${what} is already called “${n}”. Pick another name.`);
    const entry: Saved = { id: crypto.randomUUID(), name: n, kind, rows: rowsToSave(kind, o), updatedAt: Date.now() };
    await putSaved(space, entry);
    replace({ ...o, name: n, savedId: entry.id });
    setNaming(false);
    setError("");
    notify(`Saved the ${what} “${n}”`);
  };

  return (
    <Sheet open onClose={close} title={kind === "person" ? "Person in this picture" : "Scene"}>
      <label className="flex flex-col gap-1">
        <span className="label">Name</span>
        <input
          value={o.name}
          onChange={(e) => (replace({ ...o, name: e.target.value }), setError(""))}
          onBlur={(e) => !e.target.value.trim() && replace({ ...o, name: s?.name ?? (kind === "person" ? "Person" : "") })}
          placeholder={kind === "scene" ? "name this scene" : "name"}
          className="field h-11 px-2.5 placeholder:text-faint fine:h-9"
        />
      </label>
      <p className="font-mono text-xs text-muted">
        {!s ? <><b className="font-medium text-ink">New</b> · not saved as a {what}</> : <><b className="font-medium text-ink">Saved {what} “{s.name}”</b> · {changed ? `changed: ${diff.join(", ")}` : "no changes"}</>}
      </p>
      {!s || naming ? (
        <form className="flex gap-1.5" onSubmit={(e) => (e.preventDefault(), saveNew((naming ? name : o.name).trim()))}>
          {naming && <input autoFocus value={name} onChange={(e) => (setName(e.target.value), setError(""))} placeholder={`name the new ${what}`} className="field h-11 min-w-0 flex-1 px-2.5 placeholder:text-faint fine:h-9" />}
          <Btn className={naming ? "" : "flex-1"}>{naming ? "Save new" : `Save ${what}${kind === "person" && !/^Person \d+$/.test(o.name) ? ` “${o.name}”` : ""}`}</Btn>
        </form>
      ) : changed ? (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <Btn onClick={async () => {
              if (list.some((x) => x !== s && x.name === o.name)) return setError(`Another saved ${what} is already called “${o.name}”.`);
              const before = s;
              await putSaved(space, { ...s, name: o.name, rows: rowsToSave(kind, o), updatedAt: Date.now() });
              notify(`Updated “${o.name}”`, { action: { label: "Undo", run: () => void putSaved(space, before) } });
            }}>{s.name !== o.name ? `Update and rename to “${o.name}”` : `Update “${s.name}”`}</Btn>
            <Btn onClick={() => {
              replace({ ...o, ...freshRows(kind, s), name: s.name });
              notify("Changes discarded", { action: { label: "Undo", run: () => replace(o) } });
            }}>Discard changes</Btn>
          </div>
          <button onClick={() => (setNaming(true), setName(""))} className="self-start font-mono text-[11px] text-muted underline underline-offset-4">or save as a new {what}…</button>
        </div>
      ) : null}
      {error && <p role="alert" className="text-xs text-bad">{error}</p>}
      <p className="text-xs text-faint">
        {kind === "person"
          ? "A saved character keeps Who, Look, Wearing and Doing, with versions and switched-off phrases. Side and depth stay with this picture; LoRAs stay in the Model tab."
          : "A saved scene keeps Where, Shot, Style and Extra, with versions and switched-off phrases. People are saved on their own."}{" "}
        Names never go into the prompt.
      </p>

      <span className="label">Saved {what}s</span>
      {list.filter((x) => x.id !== s?.id).length === 0 ? (
        <p className="text-xs text-faint">No other saved {what}s yet.</p>
      ) : (
        <>
          {(!s || changed) && <p className="border-l-2 border-edge pl-2 text-xs text-muted">{label}'s edits are not saved. Using a saved {what} replaces them; Undo brings them back.</p>}
          <div className="flex flex-col">
            {list.filter((x) => x.id !== s?.id).map((x) => (
              <div key={x.id} className="flex items-center border-b border-line">
                <button disabled={inUse(x)} onClick={() => {
                  replace({ ...o, ...freshRows(kind, x), name: x.name, savedId: x.id });
                  close();
                  notify(kind === "person" ? `${o.name} is now ${x.name}` : `Using the scene “${x.name}”`, { action: { label: "Undo", run: () => replace(o) } });
                }} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left disabled:opacity-50">
                  <span className="min-w-0 flex-1 break-words">{x.name}</span>
                  <span className="font-mono text-[11px] text-muted">{inUse(x) ? "in this picture" : "use here"}</span>
                </button>
                <button onClick={() => {
                  deleteSaved(x.id);
                  notify(`Deleted the saved ${what} “${x.name}”`, { action: { label: "Undo", run: () => void putSaved(space, x) } });
                }} aria-label={`Delete the saved ${what} ${x.name}`} className="size-11 shrink-0 text-lg text-faint hover:text-bad">×</button>
              </div>
            ))}
          </div>
          <p className="text-xs text-faint">{kind === "person" ? `Using one here: ${o.name} becomes that character, name and rows. Side and depth stay.` : "Using one here replaces Where, Shot, Style and Extra."}</p>
        </>
      )}
      {kind === "person" && recipe.cast.length > 1 && (
        <Btn variant="danger" onClick={() => {
          const at = recipe.cast.findIndex((c) => c.id === open);
          set((r) => ({ ...r, cast: r.cast.filter((c) => c.id !== open) }));
          onRemoved(recipe.cast[at === 0 ? 1 : at - 1].id);
          close();
          notify(`Removed ${o.name} from this picture`, { action: { label: "Undo", run: () => set((r) => ({ ...r, cast: [...r.cast.slice(0, at), o as Person, ...r.cast.slice(at)] })) } });
        }}>Remove {o.name} from this picture</Btn>
      )}
    </Sheet>
  );
}
