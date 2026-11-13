import type { SyncConfig } from "./config.js";

export function pytrConfigFromProfile(profile: SyncConfig["tradeRepublicProfiles"][number]) {
  return {
    ...(profile.pytrCommand ? { pytrCommand: profile.pytrCommand } : {}),
    ...(profile.pytrHome ? { pytrHome: profile.pytrHome } : {}),
    ...(profile.loginV2 !== undefined ? { loginV2: profile.loginV2 } : {}),
    ...(profile.wafTokenMode ? { wafTokenMode: profile.wafTokenMode } : {}),
    ...(profile.account ? { account: profile.account } : {}),
    ...(profile.pytrMinVersion ? { pytrMinVersion: profile.pytrMinVersion } : {}),
    ...(profile.cliSubprocessTimeoutMs !== undefined
      ? { cliSubprocessTimeoutMs: profile.cliSubprocessTimeoutMs }
      : {}),
  };
}

export function scConfigFromProfile(profile: SyncConfig["scalableCapitalProfiles"][number]) {
  return {
    ...(profile.scBinaryPath ? { scBinaryPath: profile.scBinaryPath } : {}),
    ...(profile.scConfigDir ? { scConfigDir: profile.scConfigDir } : {}),
    ...(profile.portfolioId ? { portfolioId: profile.portfolioId } : {}),
    ...(profile.cliSubprocessTimeoutMs !== undefined
      ? { cliSubprocessTimeoutMs: profile.cliSubprocessTimeoutMs }
      : {}),
  };
}
