import { describe, expect, it, vi } from "vitest";
import { detectFirstSyncForAccount } from "./first-sync-for-account.js";

describe("detectFirstSyncForAccount", () => {
  it("marks first sync when no broker external ids exist", async () => {
    const client = {
      transactions: {
        getAll: vi.fn().mockResolvedValue({
          transactions: [{ external_id: "manual:other" }],
          hasMore: false,
        }),
      },
    };
    const result = await detectFirstSyncForAccount(client as never, 42, ["trade-republic:"]);
    expect(result.firstSyncForAccount).toBe(true);
    expect(result.existingBrokerExternalIds).toBe(0);
  });

  it("detects existing broker rows", async () => {
    const client = {
      transactions: {
        getAll: vi.fn().mockResolvedValue({
          transactions: [{ external_id: "trade-republic:evt-1" }],
          hasMore: false,
        }),
      },
    };
    const result = await detectFirstSyncForAccount(client as never, 42, ["trade-republic:"]);
    expect(result.firstSyncForAccount).toBe(false);
    expect(result.existingBrokerExternalIds).toBe(1);
  });
});