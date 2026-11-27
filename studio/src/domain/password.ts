// The rule for a new password: a workspace's, or a backup file's.

/** PBKDF2 slows a guess down, but a short password is still found offline from a copy of the device's storage. */
export const MIN_PASSWORD = 8;

/** A new password that may be set: none at all where that is allowed, or one of MIN_PASSWORD characters typed twice. */
export const passwordOk = (value: string, repeat: string) =>
  !value || (value.length >= MIN_PASSWORD && value === repeat);
