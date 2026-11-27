import { describe, expect, it } from "vitest";

import { MIN_PASSWORD, passwordOk } from "@/domain/password";

describe("a new password", () => {
  it("is none, or at least MIN_PASSWORD characters typed twice the same", () => {
    expect(passwordOk("", "")).toBe(true);
    expect(passwordOk("a", "a")).toBe(false);
    expect(passwordOk("x".repeat(MIN_PASSWORD - 1), "x".repeat(MIN_PASSWORD - 1))).toBe(false);
    expect(passwordOk("x".repeat(MIN_PASSWORD), "x".repeat(MIN_PASSWORD))).toBe(true);
    expect(passwordOk("x".repeat(MIN_PASSWORD), "y".repeat(MIN_PASSWORD))).toBe(false);
  });
});
