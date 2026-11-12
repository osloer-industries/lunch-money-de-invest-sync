import type { TradeRepublicProfile } from "../shared/config.js";
import { pytrConfigFromProfile } from "../shared/profile-cli-config.js";
import { createDefaultPytrCliRunner, fetchTradeRepublicTimeline } from "./client.js";
import type { PytrTimelineEvent } from "./types.js";

export async function fetchTradeRepublicEventsForProfile(
  profile: TradeRepublicProfile,
): Promise<PytrTimelineEvent[]> {
  const pytrConfig = pytrConfigFromProfile(profile);
  const runner = createDefaultPytrCliRunner(pytrConfig);
  return fetchTradeRepublicTimeline(runner, pytrConfig);
}
