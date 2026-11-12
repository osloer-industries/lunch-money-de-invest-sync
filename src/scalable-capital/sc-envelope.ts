import { scMachineEnvelopeSchema, type ScMachineEnvelope } from "./types.js";

export function parseScMachineEnvelopeStdout(stdout: string): ScMachineEnvelope {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout.trim());
  } catch {
    throw new Error("Scalable CLI returned stdout that is not valid JSON");
  }
  const envelope = scMachineEnvelopeSchema.safeParse(parsed);
  if (!envelope.success) {
    throw new Error(
      `Scalable CLI JSON envelope didn't match the expected shape: ${envelope.error.message}`,
    );
  }
  return envelope.data;
}

export function tryParseScMachineEnvelopeStdout(stdout: string): ScMachineEnvelope | null {
  try {
    return parseScMachineEnvelopeStdout(stdout);
  } catch {
    return null;
  }
}
