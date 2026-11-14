import { describe, expect, it } from "vitest";
import { formatKeychainAccessError } from "./lunch-money-api-key-store.js";

describe("Lunch Money API key keychain errors", () => {
  it("wraps keychain failures with operator guidance", () => {
    const error = formatKeychainAccessError("reading the Lunch Money API key", new Error("access denied"));
    expect(error.message).toMatch(/Allow keychain access/);
    expect(error.message).toMatch(/--replace-api-key/);
    expect(error.message).not.toMatch(/lm_/);
  });
});