// The library backup: this workspace's characters, presets and LoRA notes as one JSON file, sealed with a password
// when one is given (and always for a protected workspace, whose characters would otherwise leave the seal).
import { useRef, useState } from "react";

import { exportLibrary, importLibrary, needsPassword } from "@/data/db/backup";
import { useSpace } from "@/data/db/space";
import { useWorkspace } from "@/data/db/workspaces";
import { errorText } from "@/domain/format";
import { MIN_PASSWORD } from "@/domain/password";
import { download } from "@/features/library/files";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

export function BackupSection({ className }: { className?: string }) {
  const space = useSpace();
  const locked = !!useWorkspace(space.id)?.lock;
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);
  const short = password.length < MIN_PASSWORD;

  const load = async (f: File) => {
    try {
      if ((await needsPassword(f)) && !password)
        return setNote("This file is sealed with a password: type it above, then import it again.");
      setNote(await importLibrary(space, f, password));
    } catch (err) {
      setNote(errorText(err));
    }
  };

  return (
    <Section title="Backup" className={className}>
      <div className="flex flex-col gap-2">
        <Input
          type="password"
          autoComplete="off"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={locked ? "file password (required)" : "file password (optional)"}
        />
        <div className="flex gap-2">
          <Button
            className="flex-1"
            disabled={(locked || !!password) && short}
            onClick={() =>
              void exportLibrary(space, password).then((b) => download(b, "studio-library.json"))
            }
          >
            Export library
          </Button>
          <Button className="flex-1" onClick={() => file.current?.click()}>
            Import
          </Button>
        </div>
        <Input
          ref={file}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void load(f);
          }}
        />
      </div>
      <Note>
        {note ||
          "This workspace's characters, plus the presets, looks and LoRA trigger words every workspace shares; face " +
            `photos are left out. With a password of ${MIN_PASSWORD} or more characters the file is encrypted, ` +
            (locked
              ? "which this protected workspace requires."
              : "otherwise anyone who has the file can read it.") +
            " An encrypted file asks for its password on import."}
      </Note>
    </Section>
  );
}
