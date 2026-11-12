import {
  createDefaultScCliRunner,
  fetchAllScalableTransactionSummaries,
} from "../scalable-capital/client.js";
import { observeScalableSummaries } from "../scalable-capital/classify.js";
import type { SyncConfig } from "./config.js";
import type { TypeObservation } from "./canonical-type.js";
import { createDefaultPytrCliRunner, fetchTradeRepublicTimeline } from "../trade-republic/client.js";
import { observeTradeRepublicEvents } from "../trade-republic/classify.js";

function pytrConfigFromProfile(profile: SyncConfig["tradeRepublicProfiles"][number]) {
  return {
    ...(profile.pytrCommand ? { pytrCommand: profile.pytrCommand } : {}),
    ...(profile.pytrHome ? { pytrHome: profile.pytrHome } : {}),
    ...(profile.loginV2 !== undefined ? { loginV2: profile.loginV2 } : {}),
    ...(profile.wafTokenMode ? { wafTokenMode: profile.wafTokenMode } : {}),
    ...(profile.account ? { account: profile.account } : {}),
    ...(profile.pytrMinVersion ? { pytrMinVersion: profile.pytrMinVersion } : {}),
  };
}

function scConfigFromProfile(profile: SyncConfig["scalableCapitalProfiles"][number]) {
  return {
    ...(profile.scBinaryPath ? { scBinaryPath: profile.scBinaryPath } : {}),
    ...(profile.scConfigDir ? { scConfigDir: profile.scConfigDir } : {}),
    ...(profile.portfolioId ? { portfolioId: profile.portfolioId } : {}),
  };
}

/** Read-only broker fetch for type discovery (no Lunch Money writes). */
export async function collectTypeObservations(config: SyncConfig): Promise<TypeObservation[]> {
  const observations: TypeObservation[] = [];
  for (const profile of config.tradeRepublicProfiles) {
    const pytrConfig = pytrConfigFromProfile(profile);
    const runner = createDefaultPytrCliRunner(pytrConfig);
    const events = await fetchTradeRepublicTimeline(runner, pytrConfig);
    observations.push(...observeTradeRepublicEvents(events));
  }
  for (const profile of config.scalableCapitalProfiles) {
    const scConfig = scConfigFromProfile(profile);
    const runner = createDefaultScCliRunner(scConfig);
    const summaries = await fetchAllScalableTransactionSummaries(runner, scConfig);
    observations.push(...observeScalableSummaries(summaries));
  }
  return observations;
}
