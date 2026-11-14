import type { SyncConfig } from "../shared/config.js";
import type { SetupPrompter } from "./types.js";

function brokerageAccountLabels(config: SyncConfig): string[] {
  return [
    ...config.tradeRepublicProfiles.map((profile) => `Trade Republic (${profile.owner})`),
    ...config.scalableCapitalProfiles.map((profile) => `Scalable Capital (${profile.owner})`),
  ];
}

/** v2 has no rules API — print copy-pasteable Lunch Money UI rule ideas only. */
export function printSuggestedLunchMoneyRules(
  prompter: SetupPrompter,
  config: SyncConfig,
  categoryMap: SyncConfig["categoryMap"],
): void {
  const accounts = brokerageAccountLabels(config);
  if (accounts.length === 0) {
    return;
  }
  prompter.print("");
  prompter.print("Suggested Lunch Money UI rules (create manually in the app — the v2 API has no rules CRUD):");
  prompter.print(
    "Warning: sync inserts use apply_rules=true. A broad payee rule (for example payee contains your broker name) can overwrite categoryMap categories on deposits and trades.",
  );
  for (const account of accounts) {
    if (categoryMap.saveback !== undefined) {
      prompter.print(
        `  • Account is "${account}" AND tag includes saveback → set category id ${categoryMap.saveback}`,
      );
    } else {
      prompter.print(
        `  • Account is "${account}" AND tag includes saveback → set category to your Saveback income or excluded Investments choice`,
      );
    }
    prompter.print(
      `  • Account is "${account}" AND tag includes needs-review → leave uncategorised (avoid auto-categorising card spend from payee rules)`,
    );
  }
}