import { spawn } from "node:child_process";

/** pytr `--v2` prints this while it waits for the operator to approve the login in the TR app. */
const APPROVAL_WAITING = /confirm the login in the trade republic app/i;
const APPROVAL_COUNTDOWN = /still waiting, \d+s left/i;

export const APPROVAL_MESSAGE =
  "Trade Republic: approve the login request in your Trade Republic app now (about 2 minutes).";

/** Best-effort macOS banner; fixed strings only, failures are ignored. */
export function notifyMacOs(platform: NodeJS.Platform = process.platform): void {
  if (platform !== "darwin") {
    return;
  }
  try {
    const child = spawn(
      "/usr/bin/osascript",
      ["-e", 'display notification "Approve the login in your Trade Republic app" with title "Lunch Money sync"'],
      { stdio: "ignore", detached: true },
    );
    child.on("error", () => undefined);
    child.unref();
  } catch {
    // Notification is a convenience only.
  }
}

/**
 * Watches pytr output lines. When pytr starts waiting for app approval, tells the operator once
 * (terminal + desktop notification) and relays the countdown, so a pending login never looks like a hang.
 */
export function createAppApprovalWatcher(
  deps: { print?: (line: string) => void; notify?: () => void } = {},
): (line: string) => void {
  const print = deps.print ?? ((line: string) => process.stderr.write(`${line}\n`));
  const notify = deps.notify ?? (() => notifyMacOs());
  let alerted = false;
  return (line) => {
    if (APPROVAL_WAITING.test(line)) {
      if (!alerted) {
        alerted = true;
        print(APPROVAL_MESSAGE);
        notify();
      }
      return;
    }
    if (alerted && APPROVAL_COUNTDOWN.test(line)) {
      const match = /still waiting, (\d+)s left/i.exec(line);
      print(`  …still waiting for app approval (${match?.[1] ?? "?"}s left)`);
    }
  };
}
