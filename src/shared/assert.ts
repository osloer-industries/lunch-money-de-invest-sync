/** Narrows `value` for control flow; throws when it is null or undefined. */
export function assertDefined<T>(value: T | null | undefined, label: string): T {
  if (value === null || value === undefined) {
    throw new Error(`${label} is required`);
  }
  return value;
}