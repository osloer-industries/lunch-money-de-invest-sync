import { describe, expect, it, vi } from "vitest";
import { createManualAccountOrReuse } from "./manual-account.js";
import type { LunchMoneySetupClient, SetupPrompter } from "./types.js";

function client(overrides: Partial<LunchMoneySetupClient> = {}): LunchMoneySetupClient {
  return {
    manualAccounts: {
      getAll: vi.fn().mockResolvedValue([{ id: 7, name: "Trade Republic (a)" }]),
      create: vi.fn().mockRejectedValue(new Error("ASSET_DISPLAY_NAME_ALREADY_EXISTS")),
    },
    categories: { getAll: vi.fn() },
    ...overrides,
  } as unknown as LunchMoneySetupClient;
}

function prompter(confirm: boolean): SetupPrompter {
  return {
    password: vi.fn(),
    input: vi.fn(),
    select: vi.fn(),
    checkbox: vi.fn(),
    search: vi.fn(),
    confirm: vi.fn().mockResolvedValue(confirm),
    print: vi.fn(),
    waitForEnter: vi.fn(),
  };
}

describe("createManualAccountOrReuse", () => {
  it("creates a new manual account", async () => {
    const lm = {
      manualAccounts: {
        getAll: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 9, name: "Trade Republic (a)" }),
      },
      categories: { getAll: vi.fn().mockResolvedValue([]) },
    } as unknown as LunchMoneySetupClient;
    const id = await createManualAccountOrReuse(
      prompter(true),
      lm,
      "Trade Republic (a)",
      "Trade Republic",
    );
    expect(id).toBe(9);
  });

  it("returns existing id when duplicate and operator reuses", async () => {
    const id = await createManualAccountOrReuse(
      prompter(true),
      client(),
      "Trade Republic (a)",
      "Trade Republic",
    );
    expect(id).toBe(7);
  });

  it("returns null when duplicate and operator declines", async () => {
    const id = await createManualAccountOrReuse(
      prompter(false),
      client(),
      "Trade Republic (a)",
      "Trade Republic",
    );
    expect(id).toBeNull();
  });
});
