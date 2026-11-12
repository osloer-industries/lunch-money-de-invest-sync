import { fetchScalableSummariesForProfile } from "../scalable-capital/profile-transport.js";
import { observeScalableSummaries } from "../scalable-capital/classify.js";
import type { SyncConfig } from "./config.js";
import type { TypeObservation } from "./canonical-type.js";
import { fetchTradeRepublicEventsForProfile } from "../trade-republic/profile-transport.js";
import { observeTradeRepublicEvents } from "../trade-republic/classify.js";

/** Read-only broker fetch for type discovery (no Lunch Money writes). */
export async function collectTypeObservations(config: SyncConfig): Promise<TypeObservation[]> {
  const observations: TypeObservation[] = [];
  for (const profile of config.tradeRepublicProfiles) {
    const events = await fetchTradeRepublicEventsForProfile(profile);
    observations.push(...observeTradeRepublicEvents(events));
  }
  for (const profile of config.scalableCapitalProfiles) {
    const summaries = await fetchScalableSummariesForProfile(profile);
    observations.push(...observeScalableSummaries(summaries));
  }
  return observations;
}
