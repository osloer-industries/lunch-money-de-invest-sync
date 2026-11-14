import { describe, expect, it, vi } from "vitest";
import { APPROVAL_MESSAGE, createAppApprovalWatcher, notifyMacOs } from "./app-approval-alert.js";
import { createLineSplitter } from "../shared/subprocess-cli.js";

describe("createAppApprovalWatcher", () => {
  it("alerts once and relays the countdown when pytr waits for app approval", () => {
    const print = vi.fn();
    const notify = vi.fn();
    const watch = createAppApprovalWatcher({ print, notify });
    watch("13:21:18 Trying to resume websession...");
    watch("13:21:19 Waiting for you to confirm the login in the Trade Republic app...");
    watch("13:21:19 Waiting for you to confirm the login in the Trade Republic app...");
    watch("13:21:31 Still waiting, 107s left...");
    expect(notify).toHaveBeenCalledTimes(1);
    expect(print.mock.calls.map((call) => call[0])).toEqual([
      APPROVAL_MESSAGE,
      "  …still waiting for app approval (107s left)",
    ]);
  });

  it("stays quiet when the session resumes without approval", () => {
    const print = vi.fn();
    const notify = vi.fn();
    const watch = createAppApprovalWatcher({ print, notify });
    watch("Still waiting, 10s left");
    watch("Exporting transactions...");
    expect(print).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not notify off macOS", () => {
    expect(() => notifyMacOs("linux")).not.toThrow();
  });
});

describe("createLineSplitter", () => {
  it("emits complete lines across chunks and flushes the tail", () => {
    const lines: string[] = [];
    const splitter = createLineSplitter((line) => lines.push(line));
    splitter.push("first li");
    splitter.push("ne\r\nsecond\nthi");
    expect(lines).toEqual(["first line", "second"]);
    splitter.flush();
    expect(lines).toEqual(["first line", "second", "thi"]);
  });
});
