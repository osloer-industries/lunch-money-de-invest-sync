import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { LunchMoneyMockServer } from "../support/lunch-money-mock.js";
import { PtySession } from "../support/pty-session.js";
import {
  createE2eWorkspace,
  destroyE2eWorkspace,
  cliEntryArgs,
  readWorkspaceConfig,
  type E2eWorkspace,
} from "../support/workspace.js";

describe("e2e setup --non-interactive", () => {
  const mock = new LunchMoneyMockServer(4712);
  let workspace: E2eWorkspace | undefined;

  beforeAll(async () => {
    await mock.start();
  });

  afterAll(async () => {
    await mock.stop();
  });

  afterEach(async () => {
    if (workspace) {
      await destroyE2eWorkspace(workspace);
      workspace = undefined;
    }
  });

  it("writes config.json for both brokers without a TTY", async () => {
    workspace = await createE2eWorkspace({ mock, pytrScenario: "ok", scScenario: "ok" });
    const cli = cliEntryArgs("setup", [
      "--non-interactive",
      "--yes",
      "--trade-republic",
      "--scalable-capital",
      "--owner",
      "operator-a",
      "--lunch-money-asset-id",
      "9100",
      "--scalable-asset-id",
      "9101",
      "--skip-broker-check",
    ]);
    const session = PtySession.start(cli.command, cli.args, { cwd: workspace.dir, env: workspace.env });
    const result = await session.finish(60_000);
    expect(result.exitCode).toBe(0);
    const config = await readWorkspaceConfig(workspace);
    expect(config.tradeRepublicProfiles).toHaveLength(1);
    expect(config.scalableCapitalProfiles).toHaveLength(1);
  });
});