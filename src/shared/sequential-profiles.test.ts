import { describe, expect, it, vi } from "vitest";
import { forEachConfirmedRepeat, forEachSequentially } from "./sequential-profiles.js";

describe("forEachSequentially", () => {
  it("runs callbacks in list order, one at a time", async () => {
    const order: number[] = [];
    const run = vi.fn((value: number) => {
      order.push(value);
      return Promise.resolve();
    });
    await forEachSequentially([1, 2, 3], run);
    expect(order).toEqual([1, 2, 3]);
    expect(run).toHaveBeenCalledTimes(3);
  });
});

describe("forEachConfirmedRepeat", () => {
  it("runs once then stops when confirm is declined", async () => {
    const step = vi.fn();
    const confirm = vi.fn().mockResolvedValueOnce(false);
    await forEachConfirmedRepeat({ confirm }, "again?", true, step);
    expect(step).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledTimes(1);
  });

  it("repeats while confirm is accepted", async () => {
    const step = vi.fn();
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    await forEachConfirmedRepeat({ confirm }, "again?", true, step);
    expect(step).toHaveBeenCalledTimes(2);
    expect(confirm).toHaveBeenCalledTimes(2);
  });
});
