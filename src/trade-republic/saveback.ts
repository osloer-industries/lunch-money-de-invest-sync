const SAVEBACK_EVENT_TYPES = new Set(["benefits_saveback_execution"]);

/** TR saveback events sometimes use long PAYMENT-SERVICE-* event type strings. */
export function isSavebackEventType(eventType: string | null | undefined): boolean {
  if (!eventType) {
    return false;
  }
  if (SAVEBACK_EVENT_TYPES.has(eventType)) {
    return true;
  }
  return eventType.startsWith("PAYMENT-SERVICE-IN-PAYMENT-DIRECT-");
}
