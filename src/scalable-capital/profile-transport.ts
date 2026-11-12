import type { ScalableCapitalProfile } from "../shared/config.js";
import { scConfigFromProfile } from "../shared/profile-cli-config.js";
import {
  createDefaultScCliRunner,
  fetchAllScalableCapitalTransactions,
  fetchAllScalableTransactionSummaries,
} from "./client.js";
import type { ScalableCapitalTransaction, ScTransactionSummary } from "./types.js";

export async function fetchScalableSummariesForProfile(
  profile: ScalableCapitalProfile,
): Promise<ScTransactionSummary[]> {
  const scConfig = scConfigFromProfile(profile);
  const runner = createDefaultScCliRunner(scConfig);
  return fetchAllScalableTransactionSummaries(runner, scConfig);
}

export async function fetchScalableCashTransactionsForProfile(
  profile: ScalableCapitalProfile,
): Promise<ScalableCapitalTransaction[]> {
  const scConfig = scConfigFromProfile(profile);
  const runner = createDefaultScCliRunner(scConfig);
  return fetchAllScalableCapitalTransactions(runner, scConfig);
}
