import { spawn } from "node:child_process";
import type { BrokerLoginEventSink } from "../shared/cli-events.js";
import { handleAppApprovalLine, type ApprovalWatchState } from "./app-approval-line-handler.js";

const APPROVAL_TIMEOUT = /timed?\s*out/i;
const APPROVAL_REJECTED = /reject/i;

export { APPROVAL_MESSAGE } from "./app-approval-line-handler.js";

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
export interface AppApprovalWatcherState {
  readonly sawApprovalWait: boolean;
  readonly approvalSettled: boolean;
}

export function createAppApprovalWatcher(
  deps: {
    print?: (line: string) => void;
    notify?: () => void;
    emitLoginEvent?: BrokerLoginEventSink;
    onStateChange?: (state: AppApprovalWatcherState) => void;
  } = {},
): (line: string) => void {
  const print = deps.print ?? ((line: string) => process.stderr.write(`${line}\n`));
  const notify = deps.notify ?? (() => notifyMacOs());
  const state: ApprovalWatchState = { alerted: false, settled: false };
  const publishState = () => {
    deps.onStateChange?.({ sawApprovalWait: state.alerted, approvalSettled: state.settled });
  };
  return (line) => {
    handleAppApprovalLine(line, state, {
      print,
      notify,
      ...(deps.emitLoginEvent ? { emit: deps.emitLoginEvent } : {}),
    });
    publishState();
  };
}

export function appApprovalWatcherDeps(
  onStateChange: (state: AppApprovalWatcherState) => void,
  loginEvents?: BrokerLoginEventSink,
): {
  onStateChange: (state: AppApprovalWatcherState) => void;
  emitLoginEvent?: BrokerLoginEventSink;
} {
  return {
    onStateChange,
    ...(loginEvents ? { emitLoginEvent: loginEvents } : {}),
  };
}

export function finalizeTradeRepublicApprovalFromRun(
  emit: BrokerLoginEventSink | undefined,
  state: AppApprovalWatcherState,
  exitCode: number,
  stderr: string,
): void {
  if (!emit || !state.sawApprovalWait || state.approvalSettled) {
    return;
  }
  const lower = stderr.toLowerCase();
  if (exitCode === 0) {
    emit({ kind: "broker_login", broker: "trade-republic", phase: "approved" });
    return;
  }
  if (APPROVAL_TIMEOUT.test(lower)) {
    emit({ kind: "broker_login", broker: "trade-republic", phase: "timed_out" });
    return;
  }
  if (APPROVAL_REJECTED.test(lower)) {
    emit({ kind: "broker_login", broker: "trade-republic", phase: "rejected" });
    return;
  }
  emit({ kind: "broker_login", broker: "trade-republic", phase: "rejected" });
}
