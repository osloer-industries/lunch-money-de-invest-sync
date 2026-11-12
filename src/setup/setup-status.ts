export function statusOk(message: string): string {
  return `✓ ${message}`;
}

export function statusWarn(message: string): string {
  return `⚠ ${message}`;
}

export function statusError(message: string): string {
  return `✗ ${message}`;
}

export function reportSetupError(error: unknown): void {
  if (process.env.DEBUG === "1") {
    console.error(error);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
}
