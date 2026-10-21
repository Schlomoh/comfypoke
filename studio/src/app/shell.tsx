// No workspace open means nothing shown: the start screen lists names and nothing else.
import { useEffect, useState } from "react";

import { Column, Splash } from "@/app/splash";
import { Studio } from "@/app/studio";
import { migrate } from "@/data/db/migrate";
import { closeSpace, type Space } from "@/data/db/space";
import { errorText } from "@/domain/format";
import type { Recipe } from "@/domain/recipe";
import { WorkspaceList } from "@/features/workspaces/workspace-list";
import { WorkspaceProvider } from "@/state/provider";
import { Button } from "@/ui/button";
import { Note } from "@/ui/text";

export function Shell() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<{ space: Space; draft: Recipe } | null>(null);
  useEffect(() => {
    migrate().then(
      () => setReady(true),
      (e: unknown) => setError(`Could not move the library into a workspace: ${errorText(e)}`),
    );
  }, []);

  if (error && !ready)
    return (
      <Column>
        <Note tone="bad" mono>
          {error}
        </Note>
        <Note>What was not moved stays where it was and is tried again on the next reload.</Note>
        <Button onClick={() => setReady(true)}>Continue</Button>
      </Column>
    );
  if (!ready) return <Splash text="Opening the library" />;
  if (!open) return <WorkspaceList onOpen={(space, draft) => setOpen({ space, draft })} />;
  return (
    <WorkspaceProvider key={open.space.id} space={open.space} draft={open.draft}>
      <Studio
        onClose={() => {
          closeSpace();
          setOpen(null);
        }}
      />
    </WorkspaceProvider>
  );
}
