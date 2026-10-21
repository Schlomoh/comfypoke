// The deep purge, at the bottom of the workspace menu.
import { useState } from "react";

import { api, quietly } from "@/data/api";
import { purge, useImageCount } from "@/data/db/workspaces";
import { errorText } from "@/domain/format";
import { Button } from "@/ui/button";
import { Checkbox } from "@/ui/checkbox";
import { Input } from "@/ui/field";
import { notify } from "@/ui/notify";
import { Section } from "@/ui/section";
import { Note } from "@/ui/text";

function purgeLabel(busy: boolean, inputs: boolean, images: number) {
  if (busy) return "Purging…";
  return inputs ? "Purge everything" : `Purge ${images} images`;
}

/** Every generated image on this device, in every workspace; with the toggle, everything else too. */
export function Purge() {
  const images = useImageCount();
  const [inputs, setInputs] = useState(false);
  const [sure, setSure] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      // forget also stops the render on the server; not awaited, a slow worker must not hold up the purge
      for (const id of await purge(inputs)) quietly(api.forget(id));
      if (inputs) return;
      notify(`Purged ${images} images`);
      setSure("");
    } catch (e) {
      notify(`Purge failed: ${errorText(e)}`, { bad: true });
    } finally {
      setBusy(false);
      // the database was closed for deletion, whether or not that worked: start over as a new device
      if (inputs) location.reload();
    }
  };

  return (
    <Section title="Purge this device">
      <div className="flex items-center gap-1">
        <Checkbox
          on={inputs}
          onChange={setInputs}
          label={<span className="text-[13px]">Also delete the inputs</span>}
        />
      </div>
      <Note>
        {inputs
          ? "Deletes everything the studio keeps here: every workspace with its images, characters and draft, the section presets, LoRA trigger words and saved folders. The app starts over as on a new device, with the starter presets."
          : `Deletes all ${images} generated images in every workspace, protected ones included, and stops renders in flight. Workspaces, characters, drafts and presets stay.`}{" "}
        Files already saved to a folder or downloaded are not touched. This cannot be undone.
      </Note>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input
          value={sure}
          onChange={(e) => setSure(e.target.value)}
          placeholder="type purge to confirm"
          className="flex-1"
        />
        <Button type="submit" variant="danger" disabled={sure !== "purge" || busy}>
          {purgeLabel(busy, inputs, images)}
        </Button>
      </form>
    </Section>
  );
}
