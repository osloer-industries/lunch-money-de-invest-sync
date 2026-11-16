import { afterEach, beforeAll, afterAll, describe, expect, it } from "vitest";
import { LunchMoneyMockServer, lunchMoneyE2eInvalidApiKey } from "../support/lunch-money-mock.js";
import { PtySession } from "../support/pty-session.js";
import {
  createE2eWorkspace,
  destroyE2eWorkspace,
  cliEntryArgs,
  type E2eWorkspace,
} from "../support/workspace.js";

describe("e2e Lunch Money API key prompts", () => {
  const mock = new LunchMoneyMockServer(4715);
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

  it("rejects an invalid API key and accepts a valid retry", async () => {
    workspace = await createE2eWorkspace({ mock, pytrScenario: "ok", scScenario: "ok" });
    const cli = cliEntryArgs("setup");
    const session = PtySession.start(cli.command, cli.args, {
      cwd: workspace.dir,
      env: { ...workspace.env, LUNCH_MONEY_API_KEY: "", LM_E2E_PRESET_API_KEY: "" },
    });
    await session.waitFor(/Lunch Money API key/, 60_000);
    session.sendLine(lunchMoneyE2eInvalidApiKey);
    await session.waitFor(/rejected the API key/i, 60_000);
    await session.waitFor(/Lunch Money API key/, 60_000);
    session.sendLine("lm_e2e_valid_key");
    await session.waitFor(/Lunch Money API key verified/, 60_000);
    session.write("\x03");
    const result = await session.finish(5_000);
    expect(result.output).toMatch(/rejected the API key/i);
    expect(result.output).toMatch(/Lunch Money API key verified/);
  });
});