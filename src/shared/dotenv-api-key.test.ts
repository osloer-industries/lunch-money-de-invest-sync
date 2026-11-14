import { describe, expect, it } from "vitest";
import { readApiKeyFromDotenvText, stripApiKeyFromDotenvText } from "./dotenv-api-key.js";

describe("dotenv API key helpers", () => {
  it("reads and strips LUNCH_MONEY_API_KEY lines without logging the value", () => {
    const text = "# local\nLUNCH_MONEY_API_KEY=lm_test_secret\nOTHER=1\n";
    expect(readApiKeyFromDotenvText(text)).toBe("lm_test_secret");
    const stripped = stripApiKeyFromDotenvText(text);
    expect(stripped).not.toContain("lm_test_secret");
    expect(stripped).toContain("OTHER=1");
  });
});