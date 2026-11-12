import { observeScalableSummaries, observeTradeRepublicEvents } from "./broker-type-classification.js";
import type { SyncConfig } from "./config.js";
import type { TypeObservation } from "./canonical-type.js";
import {
  fetchScalableSummariesForProfile,
  fetchTradeRepublicEventsForProfile,
} from "./broker-profile-transport.js";
import type { PytrTimelineEvent } from "../trade-republic/types.js";
import type { ScTransactionSummary } from "../scalable-capital/types.js";
import { forEachProfileSequentially } from "./sequential-profiles.js";

async function observationsForProfiles<TProfile, TRaw>(
  profiles: readonly TProfile[],
  fetchRaw: (profile: TProfile) => Promise<TRaw>,
  observe: (raw: TRaw) => TypeObservation[],
): Promise<TypeObservation[]> {
  const collected: TypeObservation[] = [];
  await forEachProfileSequentially(profiles, async (profile) => {
    const raw = await fetchRaw(profile);
    collected.push(...observe(raw));
  });
  return collected;
}

/** Read-only broker fetch for type discovery (no Lunch Money writes). */
export async function collectTypeObservations(config: SyncConfig): Promise<TypeObservation[]> {
  return [
    ...(await observationsForProfiles(
      config.tradeRepublicProfiles,
      fetchTradeRepublicEventsForProfile,
      observeTradeRepublicEvents,
    )),
    ...(await observationsForProfiles(
      config.scalableCapitalProfiles,
      fetchScalableSummariesForProfile,
      observeScalableSummaries,
    )),
  ];
}
