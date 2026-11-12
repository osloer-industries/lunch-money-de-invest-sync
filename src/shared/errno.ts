export function isErrnoCode(error: unknown, code: string): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  return Reflect.get(error, "code") === code;
}
