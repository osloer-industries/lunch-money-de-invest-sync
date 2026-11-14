import { describe, expect, it, vi } from "vitest";
import { printSuggestedLunchMoneyRules } from "./print-suggested-rules.js";
import type { SetupPrompter } from "./types.js";
import type { SyncConfig } from "../shared/config.js";

describe("printSuggestedLunchMoneyRules", () => {
  it("prints saveback and needs-review rules scoped to synthetic account names", () => {
    const lines: string[] = [];
    const prompter: SetupPrompter = {
      password: vi.fn(),
      input: vi.fn(),
      select: vi.fn(),
      checkbox: vi.fn(),
      search: vi.fn(),
      confirm: vi.fn(),
      print: (line) => {
        lines.push(line);
      },
      waitForEnter: vi.fn(),
    };
    const config: SyncConfig = {
      lunchMoneyApiKey: "k",
      sharedCardLast4: [],
      tradeRepublicProfiles: [{ owner: "operator-a", lunchMoneyAssetId: 1 }],
      scalableCapitalProfiles: [],
      categoryMap: {},
      tagMap: {},
    };
    printSuggestedLunchMoneyRules(prompter, config, { saveback: 55 });
    const output = lines.join("\n");
    expect(output).toContain('Trade Republic (operator-a)');
    expect(output).toContain("saveback");
    expect(output).toContain("needs-review");
    expect(output).toContain("apply_rules=true");
  });
});