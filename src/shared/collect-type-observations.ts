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

type ProfileObservationCollector<TProfile, TRaw> = {
  readonly profiles: readonly TProfile[];
  readonly fetchRaw: (profile: TProfile) => Promise<TRaw>;
  readonly observe: (raw: TRaw) => TypeObservation[];
};

async function appendProfileObservations<TProfile, TRaw>(
  target: TypeObservation[],
  collector: ProfileObservationCollector<TProfile, TRaw>,
): Promise<void> {
  await forEachProfileSequentially(collector.profiles, async (profile) => {
    const raw = await collector.fetchRaw(profile);
    target.push(...collector.observe(raw));
  });
}

/** Read-only broker fetch for type discovery (no Lunch Money writes). */
export async function collectTypeObservations(config: SyncConfig): Promise<TypeObservation[]> {
  const observations: TypeObservation[] = [];
  await appendProfileObservations<SyncConfig["tradeRepublicProfiles"][number], PytrTimelineEvent[]>(
    observations,
    {
      profiles: config.tradeRepublicProfiles,
      fetchRaw: fetchTradeRepublicEventsForProfile,
      observe: observeTradeRepublicEvents,
    },
  );
  await appendProfileObservations<SyncConfig["scalableCapitalProfiles"][number], ScTransactionSummary[]>(
    observations,
    {
      profiles: config.scalableCapitalProfiles,
      fetchRaw: fetchScalableSummariesForProfile,
      observe: observeScalableSummaries,
    },
  );
  return observations;
}
