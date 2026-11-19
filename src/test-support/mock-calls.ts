import { expect, type Mock } from "vitest";

function callArgument(callIndex: number, argIndex: number, mock: Mock): unknown {
  return mock.mock.calls[callIndex]?.[argIndex];
}

export function firstMockCallArgument(mock: Mock, argIndex = 0): unknown {
  return callArgument(0, argIndex, mock);
}

export function mockCallArgumentAt(mock: Mock, callIndex: number, argIndex: number): unknown {
  return callArgument(callIndex, argIndex, mock);
}

export function expectStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("expected string array");
  }
  for (const entry of value) {
    if (typeof entry !== "string") {
      throw new Error("expected string array");
    }
  }
  expect(value).toEqual(value);
  return value;
}

export function expectStringRecord(value: unknown): Record<string, string> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("expected string record");
  }
  const out: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== "string") {
      throw new Error("expected string record");
    }
    out[key] = entry;
  }
  expect(out).toEqual(out);
  return out;
}

function isVitestMock(value: unknown): value is Mock {
  if (typeof value !== "function" || !("mock" in value)) {
    return false;
  }
  const mockProperty = Reflect.get(value, "mock");
  return typeof mockProperty === "object" && mockProperty !== null;
}

export function requireMockFunction(value: unknown, label: string): Mock {
  if (!isVitestMock(value)) {
    throw new Error(`${label} is not a vitest mock`);
  }
  return value;
}