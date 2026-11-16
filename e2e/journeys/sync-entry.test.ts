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

describe("e2e sync CLI entry", () => {
  const mock = new LunchMoneyMockServer(4711);
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

  it("npm run sync -- --help exits zero via the real entry point", async () => {
    workspace = await createE2eWorkspace({ mock });
    const cli = cliEntryArgs("sync", ["--help"]);
    const session = PtySession.start(cli.command, cli.args, { cwd: workspace.dir, env: workspace.env });
    await session.waitFor(/--dry-run/, 20_000);
    const result = await session.finish(10_000);
    expect(result.exitCode).toBe(0);
    expect(result.output).toMatch(/--dry-run/);
  });

  it("npm run sync -- --dry-run completes against the mock API (regression: sync entry runs)", async () => {
    workspace = await createE2eWorkspace({ mock, pytrScenario: "ok", scScenario: "ok" });
    await writeWorkspaceConfig(workspace, {
      sharedCardLast4: [],
      tradeRepublicProfiles: [
        {
          owner: "operator-a",
          lunchMoneyAssetId: 9100,
          pytrCommand: ["pytr"],
        },
      ],
      scalableCapitalProfiles: [
        {
          owner: "operator-a",
          lunchMoneyAssetId: 9101,
        },
      ],
    });

    const cli = cliEntryArgs("sync", ["--dry-run"]);
    const session = PtySession.start(cli.command, cli.args, { cwd: workspace.dir, env: workspace.env });
    await session.waitFor(/dry-run/i, 60_000);
    const result = await session.finish(90_000);
    if (result.exitCode !== 0) {
      throw new Error(`sync dry-run failed:\n${result.output.slice(-4000)}`);
    }
    expect(result.output).not.toMatch(/ZodError/);
    expect(result.output).toMatch(/trade-republic:/i);
  });
});