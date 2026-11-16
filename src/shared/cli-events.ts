/** Machine-readable broker login moments for assistants (#83). Secrets never appear in events. */

export type TradeRepublicLoginPhase =
  | "waiting_for_app_approval"
  | "approval_countdown"
  | "approved"
  | "rejected"
  | "timed_out";

export type ScalableCapitalLoginPhase = "session_needed" | "session_active" | "login_required";

export type BrokerLoginEvent =
  | {
      readonly kind: "broker_login";
      readonly broker: "trade-republic";
      readonly phase: TradeRepublicLoginPhase;
      readonly seconds_left?: number;
    }
  | {
      readonly kind: "broker_login";
      readonly broker: "scalable-capital";
      readonly phase: ScalableCapitalLoginPhase;
    };

export interface CliEventEnvelope {
  readonly event: BrokerLoginEvent["kind"];
  readonly at: string;
  readonly data: BrokerLoginEvent;
}

export type BrokerLoginEventSink = (event: BrokerLoginEvent) => void;

export function envelopeBrokerLoginEvent(data: BrokerLoginEvent): CliEventEnvelope {
  return { event: data.kind, at: new Date().toISOString(), data };
}

export function createNdjsonEventWriter(
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): BrokerLoginEventSink {
  return (data) => {
    write(JSON.stringify(envelopeBrokerLoginEvent(data)));
  };
}

export function mergeBrokerLoginSinks(
  ...sinks: ReadonlyArray<BrokerLoginEventSink | undefined>
): BrokerLoginEventSink | undefined {
  const active = sinks.filter((sink): sink is BrokerLoginEventSink => sink !== undefined);
  if (active.length === 0) {
    return undefined;
  }
  return (event) => {
    for (const sink of active) {
      sink(event);
    }
  };
}