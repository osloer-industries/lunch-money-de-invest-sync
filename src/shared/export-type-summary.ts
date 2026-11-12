import { groupTypeObservations, type TypeGroup, type TypeObservation } from "./canonical-type.js";
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

function typeGroupsToSummaryRows(groups: readonly TypeGroup[]) {
  return groups.map((group) => ({
    canonicalType: group.canonicalType,
    brokerSubtype: group.brokerSubtype,
    source: group.source,
    count: group.count,
    example: anonymizeTypeExample(group.sample),
  }));
}

export function buildTypeSummaryFromGroups(groups: readonly TypeGroup[]): TypeSummaryDocument {
  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    groups: typeGroupsToSummaryRows(groups),
  };
}

export function buildTypeSummaryDocument(observations: readonly TypeObservation[]): TypeSummaryDocument {
  return buildTypeSummaryFromGroups(groupTypeObservations(observations));
}

export function serializeTypeSummaryFromGroups(groups: readonly TypeGroup[]): string {
  return `${JSON.stringify(buildTypeSummaryFromGroups(groups), null, 2)}\n`;
}
