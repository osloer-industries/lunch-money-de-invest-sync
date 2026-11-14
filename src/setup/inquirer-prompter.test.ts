import { describe, expect, it, vi } from "vitest";

const prompts = vi.hoisted(() => ({
  checkbox: vi.fn(),
  confirm: vi.fn(),
  input: vi.fn(),
  password: vi.fn(),
  search: vi.fn(),
  select: vi.fn(),
}));

vi.mock("@inquirer/prompts", () => prompts);

import { createInquirerPrompter } from "./inquirer-prompter.js";

describe("createInquirerPrompter", () => {
  it("passes checked and description through to the checkbox prompt", async () => {
    prompts.checkbox.mockResolvedValueOnce(["dividend"]);
    const picked = await createInquirerPrompter().checkbox("Tags", [
      { name: "dividend (suggested)", value: "dividend", checked: true },
      { name: "holiday", value: "holiday", description: "existing tag" },
    ]);
    expect(picked).toEqual(["dividend"]);
    expect(prompts.checkbox).toHaveBeenCalledWith({
      message: "Tags",
      choices: [
        { name: "dividend (suggested)", value: "dividend", checked: true },
        { name: "holiday", value: "holiday", description: "existing tag" },
      ],
    });
  });

  it("returns the picked select value and filters search choices", async () => {
    const prompter = createInquirerPrompter();
    prompts.select.mockResolvedValueOnce("b");
    await expect(
      prompter.select("Pick", [
        { name: "A", value: "a" },
        { name: "B", value: "b" },
      ]),
    ).resolves.toBe("b");

    prompts.search.mockImplementationOnce(async ({ source }: { source: (term?: string) => unknown }) => {
      expect(source(undefined)).toHaveLength(2);
      expect(source("tran")).toEqual([{ name: "[9] Payment, Transfer", value: "9" }]);
      return "9";
    });
    await expect(
      prompter.search("Category", [
        { name: "[9] Payment, Transfer", value: "9" },
        { name: "[7] Investments", value: "7" },
      ]),
    ).resolves.toBe("9");
  });

  it("rejects a select value that is not one of the choices", async () => {
    prompts.select.mockResolvedValueOnce("zzz");
    await expect(createInquirerPrompter().select("Pick", [{ name: "A", value: "a" }])).rejects.toThrow(
      /Invalid prompt selection/,
    );
  });
});
