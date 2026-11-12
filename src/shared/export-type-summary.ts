import type { TypeGroup } from "./canonical-type.js";
import { groupTypeObservations } from "./canonical-type.js";
import type { TypeObservation } from "./canonical-type.js";
import { anonymizeTypeExample } from "./anonymize.js";

export interface TypeSummaryDocument {
  readonly version: 1;
  readonly generatedAt: string;
  readonly groups: ReadonlyArray<{
    readonly canonicalType: string;
    readonly brokerSubtype: string;
    readonly source: string;
    readonly count: number;
    readonly example: ReturnType<typeof anonymizeTypeExample>;
  }>;
}

export function buildTypeSummaryDocument(observations: readonly TypeObservation[]): TypeSummaryDocument {
  const groups = groupTypeObservations(observations);
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    groups: groups.map((group) => ({
      canonicalType: group.canonicalType,
      brokerSubtype: group.brokerSubtype,
      source: group.source,
      count: group.count,
      example: anonymizeTypeExample(group.sample),
    })),
  };
}

export function buildTypeSummaryFromGroups(groups: readonly TypeGroup[]): TypeSummaryDocument {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    groups: groups.map((group) => ({
      canonicalType: group.canonicalType,
      brokerSubtype: group.brokerSubtype,
      source: group.source,
      count: group.count,
      example: anonymizeTypeExample(group.sample),
    })),
  };
}

export function serializeTypeSummaryFromGroups(groups: readonly TypeGroup[]): string {
  return `${JSON.stringify(buildTypeSummaryFromGroups(groups), null, 2)}\n`;
}
