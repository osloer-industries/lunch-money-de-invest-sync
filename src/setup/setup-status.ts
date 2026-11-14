export function statusOk(message: string): string {
  return `✓ ${message}`;
}

export function statusWarn(message: string): string {
  return `⚠ ${message}`;
}

export function statusError(message: string): string {
  return `✗ ${message}`;
}

export const SETUP_PAUSED_MESSAGE =
  "Setup paused — your answers are saved. Run npm run setup to continue.";

export function isPromptInterrupted(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return error.name === "ExitPromptError" || /force close|User force closed/i.test(error.message);
}

export function reportSetupError(error: unknown): void {
  if (isPromptInterrupted(error)) {
    console.error(SETUP_PAUSED_MESSAGE);
    return;
  }
  if (process.env.DEBUG === "1") {
    console.error(error);
    return;
  }
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
}
