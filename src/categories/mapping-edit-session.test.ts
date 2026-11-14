import { describe, expect, it, vi } from "vitest";
import type { CategoryMappingSetupClient, SetupPrompter } from "../setup/types.js";
import { runMappingEditSession } from "./mapping-edit-session.js";

function prompter(overrides: Partial<SetupPrompter> = {}): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn().mockResolvedValue(""),
    select: vi.fn(),
    checkbox: vi.fn().mockResolvedValue([]),
    search: vi.fn(),
    confirm: vi.fn(),
    print: vi.fn(),
    waitForEnter: vi.fn(),
    ...overrides,
  };
}

function client(): CategoryMappingSetupClient {
  return {
    categories: {
      getAll: vi.fn().mockResolvedValue([{ id: 5, name: "Investments", is_group: false, group_id: null }]),
      create: vi.fn(),
      get: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    tags: {
      getAll: vi.fn().mockResolvedValue([{ id: 1, name: "dividend" }]),
    },
  };
}

describe("runMappingEditSession", () => {
  it("exits without saving when the operator declines the first prompt", async () => {
    const result = await runMappingEditSession(
      prompter({ confirm: vi.fn().mockResolvedValue(false) }),
      client(),
      { categoryMap: {}, tagMap: {} },
    );
    expect(result.saved).toBe(false);
  });

  it("persists after a successful edit", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const select = vi
      .fn()
      .mockResolvedValueOnce("deposit")
      .mockResolvedValueOnce("keep");
    const search = vi.fn().mockResolvedValue("5");
    const onPersist = vi.fn().mockResolvedValue(undefined);
    const result = await runMappingEditSession(
      prompter({ confirm, select, search }),
      client(),
      { categoryMap: {}, tagMap: {} },
      { onPersist },
    );
    expect(onPersist).toHaveBeenCalledTimes(1);
    expect(result.maps.categoryMap.deposit).toBe(5);
    expect(result.saved).toBe(true);
  });

  it("removes a saved category when the operator picks remove", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const onPersist = vi.fn().mockResolvedValue(undefined);
    const result = await runMappingEditSession(
      prompter({
        confirm,
        select: vi.fn().mockResolvedValueOnce("withdrawal").mockResolvedValueOnce("keep"),
        search: vi.fn().mockResolvedValue("__remove__"),
      }),
      client(),
      { categoryMap: { withdrawal: 8 }, tagMap: { withdrawal: ["xfer"] } },
      { onPersist },
    );
    expect(result.maps.categoryMap.withdrawal).toBeUndefined();
    expect(result.maps.tagMap.withdrawal).toEqual(["xfer"]);
  });

  it("stores comma-separated tags when no tag checkbox choices exist", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const onPersist = vi.fn().mockResolvedValue(undefined);
    const clientWithoutTags: CategoryMappingSetupClient = {
      categories: client().categories,
    };
    const result = await runMappingEditSession(
      prompter({
        confirm,
        select: vi.fn().mockResolvedValueOnce("fee").mockResolvedValueOnce("edit"),
        search: vi.fn().mockResolvedValue("__skip__"),
        input: vi.fn().mockResolvedValue("manual, bank"),
      }),
      clientWithoutTags,
      { categoryMap: {}, tagMap: {} },
      { onPersist },
    );
    expect(result.maps.tagMap.fee).toEqual(["manual", "bank"]);
    expect(onPersist).toHaveBeenCalled();
  });

  it("clears category and tags when the operator confirms full removal", async () => {
    const confirm = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const onPersist = vi.fn().mockResolvedValue(undefined);
    await runMappingEditSession(
      prompter({
        confirm,
        select: vi.fn().mockResolvedValueOnce("tax").mockResolvedValueOnce("keep"),
        search: vi.fn().mockResolvedValue("__skip__"),
      }),
      client(),
      { categoryMap: { tax: 3 }, tagMap: { tax: ["fee"] } },
      { onPersist },
    );
    expect(onPersist).toHaveBeenCalledWith({ categoryMap: {}, tagMap: {} });
  });

  it("removes all tags when requested", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const search = vi.fn().mockResolvedValue("__skip__");
    const onPersist = vi.fn().mockResolvedValue(undefined);
    await runMappingEditSession(
      prompter({
        confirm,
        select: vi.fn().mockResolvedValueOnce("deposit").mockResolvedValueOnce("remove"),
        search,
      }),
      client(),
      { categoryMap: {}, tagMap: { deposit: ["bank"] } },
      { onPersist },
    );
    expect(onPersist).toHaveBeenCalledWith({ categoryMap: {}, tagMap: {} });
  });

  it("recovers from category parse errors without losing in-memory state", async () => {
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false).mockResolvedValueOnce(false);
    const select = vi.fn().mockResolvedValueOnce("fee").mockResolvedValueOnce("keep");
    const search = vi.fn().mockResolvedValueOnce("not-a-number").mockResolvedValueOnce("5");
    const onPersist = vi.fn().mockResolvedValue(undefined);
    const print = vi.fn();
    const result = await runMappingEditSession(
      prompter({ confirm, select, search, print }),
      client(),
      { categoryMap: { deposit: 1 }, tagMap: {} },
      { onPersist },
    );
    expect(print).toHaveBeenCalledWith(expect.stringContaining("That did not work"));
    expect(result.maps.categoryMap.deposit).toBe(1);
    expect(result.maps.categoryMap.fee).toBe(5);
  });
});