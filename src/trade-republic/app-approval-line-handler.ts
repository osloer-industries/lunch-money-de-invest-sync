import type { BrokerLoginEventSink } from "../shared/cli-events.js";

export const APPROVAL_MESSAGE =
  "Trade Republic: approve the login request in your Trade Republic app now (about 2 minutes).";

const APPROVAL_WAITING = /confirm the login in the trade republic app/i;
const APPROVAL_COUNTDOWN = /still waiting, \d+s left/i;
const APPROVAL_RESUMED = /exporting transactions/i;
const APPROVAL_TIMEOUT = /timed?\s*out/i;
const APPROVAL_REJECTED = /reject/i;

export interface ApprovalWatchState {
  alerted: boolean;
  settled: boolean;
}

type TerminalPhase = "waiting_for_app_approval" | "approval_countdown" | "approved" | "rejected" | "timed_out";

export function handleAppApprovalLine(
  line: string,
  state: ApprovalWatchState,
  deps: {
    print: (line: string) => void;
    notify: () => void;
    emit?: BrokerLoginEventSink;
  },
): void {
  if (APPROVAL_WAITING.test(line)) {
    if (!state.alerted) {
      state.alerted = true;
      deps.print(APPROVAL_MESSAGE);
      deps.notify();
      deps.emit?.({ kind: "broker_login", broker: "trade-republic", phase: "waiting_for_app_approval" });
    }
    return;
  }
  if (!state.alerted) {
    return;
  }
  if (APPROVAL_COUNTDOWN.test(line)) {
    const match = /still waiting, (\d+)s left/i.exec(line);
    const secondsLeft = match?.[1] ? Number(match[1]) : Number.NaN;
    deps.print(`  …still waiting for app approval (${match?.[1] ?? "?"}s left)`);
    if (Number.isFinite(secondsLeft)) {
      deps.emit?.({
        kind: "broker_login",
        broker: "trade-republic",
        phase: "approval_countdown",
        seconds_left: secondsLeft,
      });
    } else {
      deps.emit?.({ kind: "broker_login", broker: "trade-republic", phase: "approval_countdown" });
    }
    return;
  }
  settleApproval(state, deps.emit, linePhaseFromSuccess(line));
}

function linePhaseFromSuccess(line: string): TerminalPhase | null {
  if (APPROVAL_RESUMED.test(line)) {
    return "approved";
  }
  if (APPROVAL_TIMEOUT.test(line)) {
    return "timed_out";
  }
  if (APPROVAL_REJECTED.test(line)) {
    return "rejected";
  }
  return null;
}

function settleApproval(state: ApprovalWatchState, emit: BrokerLoginEventSink | undefined, phase: TerminalPhase | null): void {
  if (!phase || state.settled) {
    return;
  }
  state.settled = true;
  state.alerted = false;
  emit?.({ kind: "broker_login", broker: "trade-republic", phase });
}