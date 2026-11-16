import type { ScalableCapitalProfile, TradeRepublicProfile } from "./config.js";
import { pytrConfigFromProfile, scConfigFromProfile } from "./profile-cli-config.js";
import {
  createDefaultScCliRunner,
  fetchAllScalableCapitalTransactions,
  fetchAllScalableTransactionSummaries,
  type ScalableFetchContext,
} from "../scalable-capital/client.js";
import {
  createDefaultPytrCliRunner,
  fetchTradeRepublicTimeline,
  type TradeRepublicFetchContext,
} from "../trade-republic/client.js";
import type { BrokerLoginEventSink } from "./cli-events.js";

export interface BrokerProfileFetchContext {
  readonly loginEvents?: BrokerLoginEventSink;
}

function runProfileCliFetch<TProfile, TConfig, TRunner, TResult, TContext>(
  profile: TProfile,
  configFromProfile: (value: TProfile) => TConfig,
  createRunner: (config: TConfig) => TRunner,
  fetch: (runner: TRunner, config: TConfig, context: TContext) => Promise<TResult>,
  context: TContext,
): Promise<TResult> {
  const config = configFromProfile(profile);
  const runner = createRunner(config);
  return fetch(runner, config, context);
}

export const fetchTradeRepublicEventsForProfile = (
  profile: TradeRepublicProfile,
  brokerContext: BrokerProfileFetchContext = {},
) =>
  runProfileCliFetch(
    profile,
    pytrConfigFromProfile,
    createDefaultPytrCliRunner,
    (runner, config, context) => fetchTradeRepublicTimeline(runner, config, undefined, context),
    (brokerContext.loginEvents ? { loginEvents: brokerContext.loginEvents } : {}) satisfies TradeRepublicFetchContext,
  );

export const fetchScalableSummariesForProfile = (
  profile: ScalableCapitalProfile,
  brokerContext: BrokerProfileFetchContext = {},
) =>
  runProfileCliFetch(
    profile,
    scConfigFromProfile,
    createDefaultScCliRunner,
    (runner, config, context) => fetchAllScalableTransactionSummaries(runner, config, context),
    (brokerContext.loginEvents ? { loginEvents: brokerContext.loginEvents } : {}) satisfies ScalableFetchContext,
  );

export const fetchScalableCashTransactionsForProfile = (
  profile: ScalableCapitalProfile,
  brokerContext: BrokerProfileFetchContext = {},
) =>
  runProfileCliFetch(
    profile,
    scConfigFromProfile,
    createDefaultScCliRunner,
    (runner, config, context) => fetchAllScalableCapitalTransactions(runner, config, context),
    (brokerContext.loginEvents ? { loginEvents: brokerContext.loginEvents } : {}) satisfies ScalableFetchContext,
  );
