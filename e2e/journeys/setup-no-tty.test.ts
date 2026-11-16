import { spawnSync } from "node:child_process";
import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { LunchMoneyMockServer } from "../support/lunch-money-mock.js";
import {
  createE2eWorkspace,
  destroyE2eWorkspace,
  cliEntryArgs,
  type E2eWorkspace,
} from "../support/workspace.js";

describe("e2e setup without a TTY", () => {
  const mock = new LunchMoneyMockServer(4713);
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

  it("fails with a clear message instead of hanging", async () => {
    workspace = await createE2eWorkspace({ mock });
    const cli = cliEntryArgs("setup");
    const result = spawnSync(cli.command, cli.args, {
      cwd: workspace.dir,
      env: workspace.env,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    const combined = `${result.stdout}\n${result.stderr}`;
    expect(combined).toMatch(/Interactive setup requires a TTY/);
    expect(combined).toMatch(/non-interactive/);
    expect(result.status).not.toBe(0);
  });
});