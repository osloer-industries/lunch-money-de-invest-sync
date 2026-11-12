import type { ScalableCapitalProfile, TradeRepublicProfile } from "./config.js";
import { pytrConfigFromProfile, scConfigFromProfile } from "./profile-cli-config.js";
import {
  createDefaultScCliRunner,
  fetchAllScalableCapitalTransactions,
  fetchAllScalableTransactionSummaries,
} from "../scalable-capital/client.js";
import type { ScalableCapitalCliConfig, ScalableCapitalTransaction, ScTransactionSummary } from "../scalable-capital/types.js";
import type { ScCliRunner } from "./subprocess-cli.js";
import { createDefaultPytrCliRunner, fetchTradeRepublicTimeline } from "../trade-republic/client.js";
import type { PytrTimelineEvent } from "../trade-republic/types.js";

export async function fetchTradeRepublicEventsForProfile(
  profile: TradeRepublicProfile,
): Promise<PytrTimelineEvent[]> {
  const pytrConfig = pytrConfigFromProfile(profile);
  const runner = createDefaultPytrCliRunner(pytrConfig);
  return fetchTradeRepublicTimeline(runner, pytrConfig);
}

async function runScalableProfileFetch<TResult>(
  profile: ScalableCapitalProfile,
  fetch: (runner: ScCliRunner, config: ScalableCapitalCliConfig) => Promise<TResult>,
): Promise<TResult> {
  const scConfig = scConfigFromProfile(profile);
  const runner = createDefaultScCliRunner(scConfig);
  return fetch(runner, scConfig);
}

export async function fetchScalableSummariesForProfile(
  profile: ScalableCapitalProfile,
): Promise<ScTransactionSummary[]> {
  return runScalableProfileFetch(profile, fetchAllScalableTransactionSummaries);
}

export async function fetchScalableCashTransactionsForProfile(
  profile: ScalableCapitalProfile,
): Promise<ScalableCapitalTransaction[]> {
  return runScalableProfileFetch(profile, fetchAllScalableCapitalTransactions);
}
