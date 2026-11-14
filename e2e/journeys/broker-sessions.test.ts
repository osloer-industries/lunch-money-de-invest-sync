import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { LunchMoneyMockServer } from "../support/lunch-money-mock.js";
import { PtySession } from "../support/pty-session.js";
import {
  createE2eWorkspace,
  destroyE2eWorkspace,
  cliEntryArgs,
  writeWorkspaceConfig,
  type E2eWorkspace,
} from "../support/workspace.js";

describe("e2e broker session flows", () => {
  const mock = new LunchMoneyMockServer(4714);
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

  it("surfaces Trade Republic app-approval wait text during sync (regression)", async () => {
    workspace = await createE2eWorkspace({ mock, pytrScenario: "approval_wait", scScenario: "ok" });
    await writeWorkspaceConfig(workspace, {
      sharedCardLast4: [],
      tradeRepublicProfiles: [
        {
          owner: "operator-a",
          lunchMoneyAssetId: 9100,
          pytrCommand: ["pytr"],
        },
      ],
      scalableCapitalProfiles: [],
    });

    const cli = cliEntryArgs("sync", ["--dry-run", "--broker", "trade-republic"]);
    const session = PtySession.start(cli.command, cli.args, { cwd: workspace.dir, env: workspace.env });
    await session.waitFor(/Trade Republic: approve the login request/, 60_000);
    const result = await session.finish(120_000);
    expect(result.output).toMatch(/still waiting for app approval/i);
    expect(result.exitCode).toBe(0);
  });

  it("re-checks an expired Scalable session when setup resumes config.json", async () => {
    workspace = await createE2eWorkspace({ mock, pytrScenario: "ok", scScenario: "no_session_then_ok" });
    await writeWorkspaceConfig(workspace, {
      sharedCardLast4: [],
      tradeRepublicProfiles: [],
      scalableCapitalProfiles: [
        {
          owner: "operator-a",
          lunchMoneyAssetId: 9101,
        },
      ],
    });

    const cli = cliEntryArgs("setup");
    const session = PtySession.start(cli.command, cli.args, { cwd: workspace.dir, env: workspace.env });
    await session.waitFor(/Which brokers should this config include/, 90_000);
    session.write("\x1b[B");
    session.write(" ");
    session.sendEnter();
    await session.waitFor(/Using existing Scalable Capital profile/, 60_000);
    await session.waitFor(/sc login/, 60_000);
    session.sendEnter();
    await session.waitFor(/Shared card last-4/, 120_000);
    session.sendEnter();
    await session.confirmYes(60_000);
    await session.waitFor(/Run a dry-run sync now/, 60_000);
    session.sendNo();
    const result = await session.finish(30_000);
    expect(result.output).toMatch(/Scalable CLI session is missing or expired/i);
    expect(result.output).toMatch(/Using existing Scalable Capital profile/);
    expect(result.exitCode).toBe(0);
  });

  it("re-checks an expired Trade Republic session when setup resumes config.json", async () => {
    workspace = await createE2eWorkspace({ mock, pytrScenario: "missing_session_then_ok", scScenario: "ok" });
    await writeWorkspaceConfig(workspace, {
      sharedCardLast4: [],
      tradeRepublicProfiles: [
        {
          owner: "operator-a",
          lunchMoneyAssetId: 9100,
          pytrCommand: ["pytr"],
        },
      ],
      scalableCapitalProfiles: [],
    });

    const cli = cliEntryArgs("setup");
    const session = PtySession.start(cli.command, cli.args, { cwd: workspace.dir, env: workspace.env });
    await session.waitFor(/Which brokers should this config include/, 90_000);
    session.write(" ");
    session.sendEnter();
    await session.waitFor(/Using existing Trade Republic profile/, 60_000);
    await session.waitFor(/pytr session is missing or expired/, 90_000);
    session.sendEnter();
    await session.waitFor(/Shared card last-4/, 120_000);
    session.sendEnter();
    await session.confirmYes(60_000);
    await session.waitFor(/Run a dry-run sync now/, 60_000);
    session.sendNo();
    const result = await session.finish(30_000);
    expect(result.output).toMatch(/Using existing Trade Republic profile/);
    expect(result.exitCode).toBe(0);
  });
});