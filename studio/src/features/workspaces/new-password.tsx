// A new password typed twice, for a new workspace and for the workspace menu.
import { Input } from "@/ui/field";
import { Note } from "@/ui/text";

export const NO_RESET =
  "There is no reset: without the password nothing in it can be read again, by you or anyone.";

/** The hidden username is the workspace's name, so a password manager keeps one entry per workspace. */
export function NewPassword({
  name,
  value,
  set,
  repeat,
  setRepeat,
}: {
  name: string;
  value: string;
  set: (v: string) => void;
  repeat: string;
  setRepeat: (v: string) => void;
}) {
  return (
    <>
      <Input type="text" name="username" autoComplete="username" value={`studio: ${name}`} hidden readOnly />
      <Input
        type="password"
        autoComplete="new-password"
        value={value}
        onChange={(e) => set(e.target.value)}
        placeholder="password"
      />
      {value && (
        <Input
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(e) => setRepeat(e.target.value)}
          placeholder="repeat password"
        />
      )}
      {value && repeat && value !== repeat && (
        <Note tone="bad" mono>
          The passwords do not match.
        </Note>
      )}
    </>
  );
}
