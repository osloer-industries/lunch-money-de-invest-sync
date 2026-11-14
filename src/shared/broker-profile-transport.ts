import type { ScalableCapitalProfile, TradeRepublicProfile } from "./config.js";
import { pytrConfigFromProfile, scConfigFromProfile } from "./profile-cli-config.js";
import {
  createDefaultScCliRunner,
  fetchAllScalableCapitalTransactions,
  fetchAllScalableTransactionSummaries,
} from "../scalable-capital/client.js";
import { createDefaultPytrCliRunner, fetchTradeRepublicTimeline } from "../trade-republic/client.js";

function runProfileCliFetch<TProfile, TConfig, TRunner, TResult>(
  profile: TProfile,
  configFromProfile: (value: TProfile) => TConfig,
  createRunner: (config: TConfig) => TRunner,
  fetch: (runner: TRunner, config: TConfig) => Promise<TResult>,
): Promise<TResult> {
  const config = configFromProfile(profile);
  const runner = createRunner(config);
  return fetch(runner, config);
}

export const fetchTradeRepublicEventsForProfile = (profile: TradeRepublicProfile) =>
  runProfileCliFetch(profile, pytrConfigFromProfile, createDefaultPytrCliRunner, fetchTradeRepublicTimeline);

export const fetchScalableSummariesForProfile = (profile: ScalableCapitalProfile) =>
  runProfileCliFetch(profile, scConfigFromProfile, createDefaultScCliRunner, fetchAllScalableTransactionSummaries);

export const fetchScalableCashTransactionsForProfile = (profile: ScalableCapitalProfile) =>
  runProfileCliFetch(profile, scConfigFromProfile, createDefaultScCliRunner, fetchAllScalableCapitalTransactions);
