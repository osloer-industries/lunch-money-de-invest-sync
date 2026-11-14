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

  it("names unrecognized config keys without echoing secrets", () => {
    const parsed = z
      .object({ tradeRepublicProfiles: z.array(z.object({ owner: z.string() }).strict()) })
      .strict()
      .safeParse({
        tradeRepublicProfiles: [{ owner: "operator-a", phoneNumber: "+490000000000" }],
      });
    expect(parsed.success).toBe(false);
    if (parsed.success) {
      throw new Error("expected validation failure");
    }
    const message = formatConfigLoadError(parsed.error);
    expect(message).toMatch(/phoneNumber/);
    expect(message).not.toMatch(/\+49/);
  });

  it("maps invalid JSON errors", () => {
    expect(formatConfigLoadError(new Error("config.json contains invalid JSON"))).toBe(
      "Saved settings could not be read — setup can back them up and start fresh.",
    );
  });
});
