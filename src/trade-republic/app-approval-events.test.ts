import { describe, expect, it, vi } from "vitest";
import { createAppApprovalWatcher } from "./app-approval-alert.js";

describe("createAppApprovalWatcher events", () => {
  it("emits rejected after approval wait", () => {
    const events: unknown[] = [];
    const watch = createAppApprovalWatcher({
      print: vi.fn(),
      notify: vi.fn(),
      emitLoginEvent: (event) => events.push(event),
    });
    watch("Waiting for you to confirm the login in the Trade Republic app...");
    watch("Approval rejected by user");
    expect(events.at(-1)).toEqual(
      expect.objectContaining({ phase: "rejected" }),
    );
  });

  it("emits timed_out after approval wait", () => {
    const events: unknown[] = [];
    const watch = createAppApprovalWatcher({
      print: vi.fn(),
      notify: vi.fn(),
      emitLoginEvent: (event) => events.push(event),
    });
    watch("Waiting for you to confirm the login in the Trade Republic app...");
    watch("login timed out");
    expect(events.at(-1)).toEqual(
      expect.objectContaining({ phase: "timed_out" }),
    );
  });

  it("emits structured trade republic login phases", () => {
    const events: unknown[] = [];
    const watch = createAppApprovalWatcher({
      print: vi.fn(),
      notify: vi.fn(),
      emitLoginEvent: (event) => events.push(event),
    });
    watch("Waiting for you to confirm the login in the Trade Republic app...");
    watch("Still waiting, 90s left...");
    watch("Exporting transactions...");
    expect(events).toEqual([
      { kind: "broker_login", broker: "trade-republic", phase: "waiting_for_app_approval" },
      { kind: "broker_login", broker: "trade-republic", phase: "approval_countdown", seconds_left: 90 },
      { kind: "broker_login", broker: "trade-republic", phase: "approved" },
    ]);
  });
});