import { describe, expect, it, vi } from "vitest";
import { fetchAllScalableCapitalTransactions } from "./client.js";

describe("scalable login events", () => {
  it("emits session_needed on no_session", async () => {
    const events: string[] = [];
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: JSON.stringify({ ok: false, error: { code: "no_session" } }),
        stderr: "",
        exitCode: 0,
      }),
    };
    await expect(
      fetchAllScalableCapitalTransactions(runner, {}, {
        loginEvents: (event) => events.push(event.phase),
      }),
    ).rejects.toThrow(/no active session/);
    expect(events).toEqual(["session_needed", "login_required"]);
  });
});