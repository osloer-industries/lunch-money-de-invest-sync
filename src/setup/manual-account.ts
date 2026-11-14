import type { LunchMoneySetupClient, SetupPrompter } from "./types.js";
import { isDuplicateAssetDisplayName } from "./lunch-money-errors.js";

/** Lunch Money v2 account type (and optional subtype) for a manual account created by setup. */
export interface ManualAccountKind {
  readonly type: "investment" | "cash";
  readonly subtype?: string;
}

export async function createManualAccountOrReuse(
  prompter: SetupPrompter,
  client: LunchMoneySetupClient,
  displayName: string,
  brokerLabel: string,
  kind: ManualAccountKind = { type: "investment" },
): Promise<number | null> {
  try {
    const created = await client.manualAccounts.create({
      name: displayName,
      currency: "eur",
      institution_name: brokerLabel,
      type: kind.type,
      ...(kind.subtype ? { subtype: kind.subtype } : {}),
      balance: "0",
    });
    return created.id;
  } catch (error) {
    if (!isDuplicateAssetDisplayName(error)) {
      throw error;
    }
    const reuse = await prompter.confirm(
      `Manual account "${displayName}" already exists in Lunch Money. Use it?`,
      true,
    );
    if (!reuse) {
      return null;
    }
    const refreshed = await client.manualAccounts.getAll();
    const existing = refreshed.find((account) => account.name === displayName);
    return existing?.id ?? null;
  }
}
