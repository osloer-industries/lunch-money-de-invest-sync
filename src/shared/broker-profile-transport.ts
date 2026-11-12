import type { ScalableCapitalProfile, TradeRepublicProfile } from "./config.js";
import { pytrConfigFromProfile, scConfigFromProfile } from "./profile-cli-config.js";
import {
  createDefaultScCliRunner,
  fetchAllScalableCapitalTransactions,
  fetchAllScalableTransactionSummaries,
} from "../scalable-capital/client.js";
import type { ScalableCapitalTransaction, ScTransactionSummary } from "../scalable-capital/types.js";
import { createDefaultPytrCliRunner, fetchTradeRepublicTimeline } from "../trade-republic/client.js";
import type { PytrTimelineEvent } from "../trade-republic/types.js";

async function runProfileCliFetch<TProfile, TConfig, TRunner, TResult>(
  profile: TProfile,
  configFromProfile: (value: TProfile) => TConfig,
  createRunner: (config: TConfig) => TRunner,
  fetch: (runner: TRunner, config: TConfig) => Promise<TResult>,
): Promise<TResult> {
  const config = configFromProfile(profile);
  const runner = createRunner(config);
  return fetch(runner, config);
}

export async function fetchTradeRepublicEventsForProfile(
  profile: TradeRepublicProfile,
): Promise<PytrTimelineEvent[]> {
  return runProfileCliFetch(
    profile,
    pytrConfigFromProfile,
    createDefaultPytrCliRunner,
    fetchTradeRepublicTimeline,
  );
}

export async function fetchScalableSummariesForProfile(
  profile: ScalableCapitalProfile,
): Promise<ScTransactionSummary[]> {
  return runProfileCliFetch(
    profile,
    scConfigFromProfile,
    createDefaultScCliRunner,
    fetchAllScalableTransactionSummaries,
  );
}

export async function fetchScalableCashTransactionsForProfile(
  profile: ScalableCapitalProfile,
): Promise<ScalableCapitalTransaction[]> {
  return runProfileCliFetch(
    profile,
    scConfigFromProfile,
    createDefaultScCliRunner,
    fetchAllScalableCapitalTransactions,
  );
}
