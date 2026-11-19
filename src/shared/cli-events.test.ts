import { describe, expect, it } from "vitest";
import { assertDefined } from "./assert.js";
import { createNdjsonEventWriter, envelopeBrokerLoginEvent, mergeBrokerLoginSinks } from "./cli-events.js";

describe("cli-events", () => {
  it("writes NDJSON envelopes", () => {
    const lines: string[] = [];
    const emit = createNdjsonEventWriter((line) => lines.push(line));
    emit({ kind: "broker_login", broker: "trade-republic", phase: "waiting_for_app_approval" });
    expect(lines).toHaveLength(1);
    const line = assertDefined(lines[0], "NDJSON line");
    const parsed: unknown = JSON.parse(line);
    expect(parsed).toMatchObject({
      event: "broker_login",
      data: { phase: "waiting_for_app_approval" },
    });
    expect(
      envelopeBrokerLoginEvent({
        kind: "broker_login",
        broker: "trade-republic",
        phase: "waiting_for_app_approval",
      }).event,
    ).toBe("broker_login");
  });

  it("merges multiple sinks", () => {
    const a: string[] = [];
    const b: string[] = [];
    const merged = mergeBrokerLoginSinks(
      (event) => a.push(event.phase),
      (event) => b.push(event.phase),
    );
    merged?.({ kind: "broker_login", broker: "scalable-capital", phase: "session_active" });
    expect(a).toEqual(["session_active"]);
    expect(b).toEqual(["session_active"]);
    expect(mergeBrokerLoginSinks(undefined, undefined)).toBeUndefined();
  });
});