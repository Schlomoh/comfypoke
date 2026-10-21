// The prompt as blocks: the character half is what a saved character keeps, the scene half is
// what changes between shots. The composed prompt underneath is exactly what is sent.
import { useLiveQuery } from "dexie-react-hooks";
import { useRef, useState } from "react";
import { db, deleteCharacter, putCharacter, useCharacters, useSpace, type Character, type Preset } from "./db";
import { BLOCKS, characterBlocks, compose, hasPhrase, togglePhrase, type BlockId, type Recipe } from "./recipe";
import { notify } from "./toast";
import { Btn, Check, Section } from "./ui";

export function sameCharacter(c: Character, r: Recipe) {
  return JSON.stringify(c.blocks) === JSON.stringify(characterBlocks(r.blocks)) && JSON.stringify(c.loras) === JSON.stringify(r.loras);
}

function CharacterBar({ recipe, set }: { recipe: Recipe; set: (r: Recipe) => void }) {
  const space = useSpace();
  const characters = useCharacters() ?? [];
  const current = characters.find((c) => c.id === recipe.character);
  const edited = current && !sameCharacter(current, recipe);

  const load = (id: string) => {
    if (edited && !confirm(`Discard the unsaved changes to "${current.name}"?`)) return;
    const c = characters.find((x) => x.id === id);
    if (!c) return set({ ...recipe, character: null });
    set({ ...recipe, character: c.id, blocks: { ...recipe.blocks, ...c.blocks }, loras: c.loras });
  };
  const save = async (asNew: boolean) => {
    let { id, name } = current ?? { id: "", name: "" };
    if (asNew || !current) {
      const typed = prompt("Name this character", current ? `${current.name} 2` : "")?.trim();
      if (!typed) return;
      id = crypto.randomUUID();
      name = typed;
    }
    await putCharacter(space, { id, name, blocks: characterBlocks(recipe.blocks), loras: recipe.loras, updatedAt: Date.now() });
    set({ ...recipe, character: id });
    notify(`Saved ${name}`);
  };
  const remove = async () => {
    if (!current || !confirm(`Delete the character "${current.name}"? Renders made with it stay.`)) return;
    await deleteCharacter(current.id);
    set({ ...recipe, character: null });
  };

  return (
    <Section
      title="Character"
      right={edited && <span className="font-mono text-[10.5px] text-warn uppercase">edited, not saved</span>}
    >
      <div className="flex gap-2">
        <select
          value={recipe.character ?? ""}
          onChange={(e) => load(e.target.value)}
          className="field h-11 min-w-0 flex-1 px-2 fine:h-8"
        >
          <option value="">None (unsaved)</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <Btn onClick={() => save(false)} disabled={!!current && !edited}>Save</Btn>
        {current && <Btn onClick={() => save(true)}>Save as</Btn>}
        {current && <Btn variant="danger" onClick={remove} title="Delete character">Delete</Btn>}
      </div>
      <p className="text-xs text-faint">A character keeps the subject, face, outfit and LoRAs. Pose, setting, camera and style stay with the scene.</p>
    </Section>
  );
}

function BlockField({ id, recipe, set, presets }: { id: BlockId; recipe: Recipe; set: (r: Recipe) => void; presets: Preset[] }) {
  const def = BLOCKS.find((b) => b.id === id)!;
  const block = recipe.blocks[id];
  const [editing, setEditing] = useState(false);
  const toggle = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState("");
  const put = (patch: Partial<typeof block>) => set({ ...recipe, blocks: { ...recipe.blocks, [id]: { ...block, ...patch } } });
  const addPreset = (text: string, label?: string) =>
    text.trim() && db.presets.put({ id: crypto.randomUUID(), block: id, text: text.trim(), label, at: Date.now() });
  const saveSection = () => {
    const label = prompt(`Name this ${def.label.toLowerCase()} preset (empty uses the text)`, "");
    if (label !== null) addPreset(block.text, label.trim() || undefined);
  };
  const tool = "h-11 px-2 font-mono text-[10.5px] fine:h-8 uppercase text-faint hover:text-ink";

  return (
    <div className={`flex flex-col gap-1.5 ${block.on ? "" : "opacity-45"}`}>
      <div className="flex items-center gap-1">
        <Check on={block.on} onChange={(on) => put({ on })} title={block.on ? "Leave out of the prompt" : "Use in the prompt"} />
        <span className="flex-1 text-[13px] font-medium">{def.label}</span>
        <button ref={toggle} onClick={() => setEditing(!editing)} aria-pressed={editing} className={`${tool} aria-pressed:text-ink`}>
          {editing ? "done" : "edit presets"}
        </button>
        {block.text && (
          <button onClick={() => put({ text: "" })} className={tool}>clear</button>
        )}
      </div>
      <textarea
        value={block.text}
        onChange={(e) => put({ text: e.target.value })}
        placeholder={def.hint}
        rows={1}
        className="field field-sizing-content min-h-11 resize-none fine:min-h-10 px-2.5 py-2 placeholder:text-faint"
      />
      {(presets.length > 0 || editing) && (
        <div className={editing ? "flex flex-wrap gap-1" : "-mx-4 flex gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"}>
          {presets.map((p) => {
            const on = hasPhrase(block.text, p.text);
            return (
              <button
                key={p.id}
                title={editing ? `Delete "${p.text}"` : p.text}
                onClick={() => {
                  if (!editing) return put({ text: togglePhrase(block.text, p.text), on: true });
                  db.presets.delete(p.id);
                  toggle.current?.focus(); // the chip that had focus is gone
                  notify(`Deleted "${p.label ?? p.text}"`, { action: { label: "Undo", run: () => db.presets.put(p) } });
                }}
                aria-pressed={!editing && on}
                className={`flex h-9 max-w-64 shrink-0 items-center gap-1.5 border px-2 text-xs fine:h-6 ${
                  editing
                    ? "border-line text-muted hover:border-bad hover:text-bad"
                    : on
                      ? "border-ink bg-ink text-bg"
                      : "border-line text-muted hover:border-edge hover:text-ink"
                }`}
              >
                <span className="truncate">{p.label ?? p.text}</span>
                {editing && <span aria-hidden>×</span>}
              </button>
            );
          })}
        </div>
      )}
      {editing && (
        <div className="flex flex-col gap-1.5 border border-line bg-bg p-2">
          <form
            className="flex gap-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              addPreset(draft);
              setDraft("");
            }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={`new ${def.label.toLowerCase()} preset`}
              className="field h-11 min-w-0 flex-1 px-2 placeholder:text-faint fine:h-8"
            />
            <Btn disabled={!draft.trim()}>Add</Btn>
          </form>
          <div className="flex items-center gap-2">
            <Btn onClick={saveSection} disabled={!block.text.trim()}>Save section as preset</Btn>
            <span className="text-xs text-faint">Tap a preset to delete it. Presets are shared by all workspaces.</span>
          </div>
        </div>
      )}
    </div>
  );
}

export function PromptPanel({ recipe, set, triggers }: { recipe: Recipe; set: (r: Recipe) => void; triggers: string[] }) {
  const text = compose(recipe.blocks, triggers);
  const presets = useLiveQuery(() => db.presets.orderBy("at").toArray(), []) ?? [];
  return (
    <div>
      <CharacterBar recipe={recipe} set={set} />
      <Section title="Character blocks">
        <div className="flex flex-col gap-4">
          {BLOCKS.filter((b) => b.character).map((b) => <BlockField key={b.id} id={b.id} recipe={recipe} set={set} presets={presets.filter((p) => p.block === b.id)} />)}
        </div>
      </Section>
      <Section title="Scene blocks">
        <div className="flex flex-col gap-4">
          {BLOCKS.filter((b) => !b.character).map((b) => <BlockField key={b.id} id={b.id} recipe={recipe} set={set} presets={presets.filter((p) => p.block === b.id)} />)}
        </div>
      </Section>
      <Section
        title={`Sent prompt · ${text.length} chars`}
        right={
          <button
            disabled={!text}
            onClick={() =>
              navigator.clipboard?.writeText(text).then(() => notify("Prompt copied"), () => notify("Could not copy the prompt", { bad: true }))
            }
            className="h-11 px-2 font-mono text-[10.5px] fine:h-8 text-muted uppercase hover:text-ink disabled:opacity-35"
          >
            copy
          </button>
        }
      >
        <p className="min-h-10 border border-line bg-bg p-2.5 font-mono text-xs leading-relaxed text-muted">
          {text || "Fill in a block to build the prompt."}
        </p>
        {triggers.length > 0 && <p className="text-xs text-faint">Starts with the trigger words of the active LoRAs.</p>}
      </Section>
    </div>
  );
}
