// The library backup: this workspace's characters, presets and LoRA notes as one JSON file.
import { useRef, useState } from "react";

import { exportLibrary, importLibrary } from "@/data/db/backup";
import { useSpace } from "@/data/db/space";
import { errorText } from "@/domain/format";
import { download } from "@/features/library/files";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

export function BackupSection() {
  const space = useSpace();
  const [note, setNote] = useState("");
  const file = useRef<HTMLInputElement>(null);

  const load = async (f: File) => {
    try {
      setNote(await importLibrary(space, f));
    } catch (err) {
      setNote(errorText(err));
    }
  };

  return (
    <Section title="Backup" className="border-t border-b-0">
      <div className="flex gap-2">
        <Button
          className="flex-1"
          onClick={() => void exportLibrary(space).then((b) => download(b, "studio-library.json"))}
        >
          Export library
        </Button>
        <Button className="flex-1" onClick={() => file.current?.click()}>
          Import
        </Button>
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
          "This workspace's characters, plus section presets and LoRA trigger words. The file is not encrypted."}
      </Note>
    </Section>
  );
}
