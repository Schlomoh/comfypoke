// The workspace dialog behind its name in the Library's header: switch, hide images, rename, password, delete.
import { useAtom } from "jotai";
import { useState } from "react";

import type { Workspace } from "@/data/db/schema";
import { useSpace } from "@/data/db/space";
import {
  deleteWorkspace,
  renameWorkspace,
  setPassword,
  useImageCount,
  useWorkspace,
} from "@/data/db/workspaces";
import { errorText } from "@/domain/format";
import { NewPassword, NO_RESET } from "@/features/workspaces/new-password";
import { Purge } from "@/features/workspaces/purge";
import { layerAtom, veilAtom } from "@/state/studio";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Input } from "@/ui/field";
import { Sheet } from "@/ui/modal";
import { notify } from "@/ui/notify";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

export function WorkspaceMenu({ onSwitch }: { onSwitch: () => void }) {
  const [layer, setLayer] = useAtom(layerAtom);
  const w = useWorkspace(useSpace().id);
  return (
    <Sheet center open={layer === "workspace" && !!w} onClose={() => setLayer(null)} title="Workspace">
      {/* mounted on each opening, so every field starts fresh */}
      {w && <MenuBody w={w} onSwitch={onSwitch} />}
    </Sheet>
  );
}

function MenuBody({ w, onSwitch }: { w: Workspace; onSwitch: () => void }) {
  const space = useSpace();
  const count = useImageCount(space.id);
  const [name, setName] = useState(w.name);
  const [current, setCurrent] = useState(""); // a protected workspace's key is unsealed again with it to change it
  const [password, setPw] = useState("");
  const [repeat, setRepeat] = useState("");
  const [note, setNote] = useState("");
  const [sure, setSure] = useState(""); // the name, typed again to delete
  const [veil, setVeil] = useAtom(veilAtom);

  const guard = async (pw: string) => {
    await setPassword(w, current, pw);
    setCurrent("");
    setPw("");
    setRepeat("");
    setNote(pw ? "Password set." : "Password removed.");
  };
  const protect = (pw: string) => guard(pw).catch((err: unknown) => setNote(errorText(err)));

  return (
    // the sections are ruled edge to edge, past the sheet's own margin
    <div className="-mx-4 flex flex-col">
      <div className="flex flex-col gap-2 border-b border-line px-4 pb-4">
        <Button onClick={onSwitch} className="w-full">
          Switch workspace
        </Button>
        <Checkbox
          on={veil}
          onChange={setVeil}
          label={
            <span className="text-xs text-muted">Hide all images, for working where others can see (H)</span>
          }
        />
      </div>
      <Section title="Name">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) void renameWorkspace(space.id, name.trim()).then(() => notify("Renamed"));
          }}
        >
          <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
          <Button type="submit" disabled={!name.trim() || name.trim() === w.name}>
            Rename
          </Button>
        </form>
      </Section>
      <Section
        title="Password"
        right={
          <span className="font-mono text-[10.5px] text-faint uppercase">
            {w.lock ? "protected" : "none"}
          </span>
        }
      >
        <form
          className="flex flex-col gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void protect(password);
          }}
        >
          {w.lock && (
            <Input
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="current password"
            />
          )}
          <NewPassword name={w.name} value={password} set={setPw} repeat={repeat} setRepeat={setRepeat} />
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={!password || password !== repeat || (!!w.lock && !current)}
              className="flex-1"
            >
              {w.lock ? "Change password" : "Set password"}
            </Button>
            {w.lock && (
              <Button
                disabled={!current}
                onClick={() => {
                  if (confirm("Remove the password? Anyone using this browser can then open this workspace."))
                    void protect("");
                }}
              >
                Remove
              </Button>
            )}
          </div>
        </form>
        <Note>
          {note ||
            (w.lock
              ? NO_RESET
              : "Protects this workspace from now on; the browser may keep its old unprotected key on disk for a while. " +
                NO_RESET)}
        </Note>
      </Section>
      <Section title="Delete">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void deleteWorkspace(space.id).then(onSwitch);
          }}
        >
          <Input
            value={sure}
            onChange={(e) => setSure(e.target.value)}
            placeholder={`type ${w.name} to confirm`}
            className="flex-1"
          />
          <Button type="submit" variant="danger" disabled={sure !== w.name}>
            Delete
          </Button>
        </form>
        <Note>Removes its {count} images, characters and draft from this device. This cannot be undone.</Note>
      </Section>
      <Purge />
    </div>
  );
}
