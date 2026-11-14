import type { TypeObservation } from "../shared/canonical-type.js";
import type { SyncConfig } from "../shared/config.js";

const SC_SECURITY_SUBTYPE = "BrokerSecurityTransactionSummary";

/**
 * Scalable Capital security trades are classified for discovery but not inserted (cash only).
 * Keep those types out of setup unless Trade Republic will also emit them.
 */
export function filterInsertableTypeObservations(
  observations: readonly TypeObservation[],
  config: SyncConfig,
): TypeObservation[] {
  const tradeRepublicEmitsTrades = config.tradeRepublicProfiles.length > 0;
  return observations.filter((observation) => {
    if (observation.source !== "scalable-capital") {
      return true;
    }
    if (observation.brokerSubtype !== SC_SECURITY_SUBTYPE) {
      return true;
    }
    return tradeRepublicEmitsTrades;
  });
}