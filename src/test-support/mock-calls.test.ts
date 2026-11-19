import { describe, expect, it, vi } from "vitest";
import {
  expectStringArray,
  expectStringRecord,
  firstMockCallArgument,
  mockCallArgumentAt,
  requireMockFunction,
} from "./mock-calls.js";

describe("mock-calls", () => {
  it("reads mock call arguments", () => {
    const mock = vi.fn<(a: string, b: number) => void>();
    mock("first", 1);
    mock("second", 2);
    expect(firstMockCallArgument(mock)).toBe("first");
    expect(firstMockCallArgument(mock, 1)).toBe(1);
    expect(mockCallArgumentAt(mock, 1, 0)).toBe("second");
    expect(mockCallArgumentAt(mock, 9, 0)).toBeUndefined();
  });

  it("narrows string arrays", () => {
    expect(expectStringArray(["a", "b"])).toEqual(["a", "b"]);
    expect(() => expectStringArray(["a", 2])).toThrow("expected string array");
    expect(() => expectStringArray("x")).toThrow("expected string array");
  });

  it("narrows string records", () => {
    expect(expectStringRecord({ a: "1" })).toEqual({ a: "1" });
    expect(() => expectStringRecord({ a: 1 })).toThrow();
    expect(() => expectStringRecord(null)).toThrow("expected string record");
  });

  it("requires vitest mocks", () => {
    const mockFn = vi.fn();
    expect(requireMockFunction(mockFn, "spawn")).toBe(mockFn);
    expect(() => requireMockFunction(() => {}, "fn")).toThrow("fn is not a vitest mock");
  });
});