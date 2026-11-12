import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  formatConfigLoadError,
  MISSING_LUNCH_MONEY_API_KEY_MESSAGE,
} from "./config-cli-errors.js";

describe("formatConfigLoadError", () => {
  it("maps missing API key zod errors", () => {
    const parsed = z.object({ lunchMoneyApiKey: z.string().min(1) }).safeParse({});
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("expected validation failure");
    }
    expect(formatConfigLoadError(parsed.error)).toBe(MISSING_LUNCH_MONEY_API_KEY_MESSAGE);
  });

  it("maps invalid JSON errors", () => {
    expect(formatConfigLoadError(new Error("config.json contains invalid JSON"))).toBe(
      "config.json is invalid — fix or delete it and run npm run setup again.",
    );
  });
});
