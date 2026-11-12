import {
  createDefaultScCliRunner,
  fetchAllScalableTransactionSummaries,
} from "../scalable-capital/client.js";
import { observeScalableSummaries } from "../scalable-capital/classify.js";
import type { SyncConfig } from "./config.js";
import type { TypeObservation } from "./canonical-type.js";
import { pytrConfigFromProfile, scConfigFromProfile } from "./profile-cli-config.js";
import { createDefaultPytrCliRunner, fetchTradeRepublicTimeline } from "../trade-republic/client.js";
import { observeTradeRepublicEvents } from "../trade-republic/classify.js";

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
