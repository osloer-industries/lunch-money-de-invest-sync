import { describe, expect, it, vi } from "vitest";
import { forEachSequentially } from "./sequential-profiles.js";

describe("forEachSequentially", () => {
  it("runs callbacks in list order, one at a time", async () => {
    const order: number[] = [];
    const run = vi.fn(async (value: number) => {
      order.push(value);
    });
    await forEachSequentially([1, 2, 3], run);
    expect(order).toEqual([1, 2, 3]);
    expect(run).toHaveBeenCalledTimes(3);
  });
});
