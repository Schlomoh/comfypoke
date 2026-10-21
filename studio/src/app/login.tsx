import { useSetAtom } from "jotai";
import { useState } from "react";

import { api, Locked } from "@/data/api";
import { authAtom } from "@/data/queries";
import { errorText } from "@/domain/format";
import { Button } from "@/ui/button";
import { Input } from "@/ui/field";
import { Note } from "@/ui/text";

export function Login() {
  const setAuth = useSetAtom(authAtom);
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const unlock = async () => {
    setPending(true);
    try {
      await api.login(key.trim());
      setAuth("open");
    } catch (err) {
      setError(err instanceof Locked ? "Wrong key." : errorText(err));
      setPending(false);
    }
  };
  return (
    <main className="grid min-h-dvh place-items-center px-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void unlock();
        }}
        className="flex w-full max-w-sm flex-col gap-3 border border-line bg-panel p-5"
      >
        <h1 className="font-mono text-xs font-semibold tracking-[0.2em]">STUDIO</h1>
        <Note tone="muted">Paste the contents of .access_key from the repo you deployed.</Note>
        <Input type="text" name="username" autoComplete="username" value="studio" hidden readOnly />
        <Input
          type="password"
          autoComplete="current-password"
          value={key}
          onChange={(e) => (setKey(e.target.value), setError(""))}
          placeholder="access key"
          autoFocus
          mono
          className="h-11 px-3 fine:h-11"
        />
        {error && (
          <Note tone="bad" mono>
            {error}
          </Note>
        )}
        <Button type="submit" variant="primary" disabled={!key.trim() || pending}>
          {pending ? "Unlocking…" : "Unlock"}
        </Button>
      </form>
    </main>
  );
}
