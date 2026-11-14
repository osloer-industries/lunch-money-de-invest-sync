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

describe("e2e doctor and config validation", () => {
  const mock = new LunchMoneyMockServer(4710);
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

  it("doctor reports pytr and sc stubs and validates config.json", async () => {
    workspace = await createE2eWorkspace({ mock });
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

    const cli = cliEntryArgs("doctor");
    const session = PtySession.start(cli.command, cli.args, { cwd: workspace.dir, env: workspace.env });
    await session.waitFor(/pytr-version/, 30_000);
    const result = await session.finish(15_000);
    expect(result.output).toMatch(/pytr-version:.*0\.4\.10|pytr 0\.4\.10/);
    expect(result.output).toMatch(/config-json: config\.json valid/);
    expect(result.output).toMatch(/sc-version:/);
  });

  it("doctor and sync name removed loginV2 profile keys (regression)", async () => {
    workspace = await createE2eWorkspace({ mock });
    await writeWorkspaceConfig(workspace, {
      sharedCardLast4: [],
      tradeRepublicProfiles: [
        {
          owner: "operator-a",
          lunchMoneyAssetId: 9100,
          loginV2: true,
        },
      ],
      scalableCapitalProfiles: [],
    });

    const doctorCli = cliEntryArgs("doctor");
    const doctor = PtySession.start(doctorCli.command, doctorCli.args, {
      cwd: workspace.dir,
      env: workspace.env,
    });
    await doctor.waitFor(/loginV2/, 30_000);
    const doctorResult = await doctor.finish(10_000);
    expect(doctorResult.output).toMatch(/loginV2/);
    expect(doctorResult.exitCode).not.toBe(0);

    const syncCli = cliEntryArgs("sync", ["--dry-run"]);
    const sync = PtySession.start(syncCli.command, syncCli.args, {
      cwd: workspace.dir,
      env: workspace.env,
    });
    await sync.waitFor(/loginV2/, 30_000);
    const syncResult = await sync.finish(20_000);
    expect(syncResult.output).toMatch(/loginV2/);
    expect(syncResult.exitCode).not.toBe(0);
  });
});