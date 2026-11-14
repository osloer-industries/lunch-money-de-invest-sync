import { describe, expect, it } from "vitest";
import { pytrConfigFromProfile, scConfigFromProfile } from "./profile-cli-config.js";

describe("profile-cli-config", () => {
  it("maps trade republic profile options", () => {
    expect(
      pytrConfigFromProfile({
        owner: "a",
        lunchMoneyAssetId: 1,
        pytrCommand: ["uvx", "pytr"],
        pytrHome: "/tmp/.pytr",
        account: "acct-1",
        pytrMinVersion: "0.4.10",
        cliSubprocessTimeoutMs: 60_000,
      }),
    ).toEqual({
      pytrCommand: ["uvx", "pytr"],
      pytrHome: "/tmp/.pytr",
      account: "acct-1",
      pytrMinVersion: "0.4.10",
      cliSubprocessTimeoutMs: 60_000,
    });
  });

  it("maps scalable capital profile options", () => {
    expect(
      scConfigFromProfile({
        owner: "b",
        lunchMoneyAssetId: 2,
        scBinaryPath: "/opt/bin/sc",
        scConfigDir: "/tmp/sc",
        portfolioId: "p-1",
        cliSubprocessTimeoutMs: 90_000,
      }),
    ).toEqual({
      scBinaryPath: "/opt/bin/sc",
      scConfigDir: "/tmp/sc",
      portfolioId: "p-1",
      cliSubprocessTimeoutMs: 90_000,
    });
  });
});
