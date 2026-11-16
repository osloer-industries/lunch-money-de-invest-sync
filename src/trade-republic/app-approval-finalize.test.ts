import { describe, expect, it, vi } from "vitest";
import { finalizeTradeRepublicApprovalFromRun } from "./app-approval-alert.js";

describe("finalizeTradeRepublicApprovalFromRun", () => {
  it("emits approved on success after waiting", () => {
    const events: string[] = [];
    finalizeTradeRepublicApprovalFromRun(
      (event) => events.push(event.phase),
      { sawApprovalWait: true, approvalSettled: false },
      0,
      "",
    );
    expect(events).toEqual(["approved"]);
  });

  it("emits timed_out when stderr mentions timeout", () => {
    const emit = vi.fn();
    finalizeTradeRepublicApprovalFromRun(
      emit,
      { sawApprovalWait: true, approvalSettled: false },
      1,
      "login timed out waiting",
    );
    expect(emit).toHaveBeenCalledWith(
      expect.objectContaining({ phase: "timed_out" }),
    );
  });

  it("skips when approval already settled", () => {
    const emit = vi.fn();
    finalizeTradeRepublicApprovalFromRun(
      emit,
      { sawApprovalWait: true, approvalSettled: true },
      1,
      "",
    );
    expect(emit).not.toHaveBeenCalled();
  });
});