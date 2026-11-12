import { z } from "zod";

/** Canonical broker transaction types used for category/tag mapping (issue #16). */
export const canonicalTypeSchema = z.enum([
  "buy",
  "sell",
  "savings-plan",
  "deposit",
  "withdrawal",
  "transfer",
  "dividend",
  "interest",
  "saveback",
  "fee",
  "tax",
  "unknown",
]);
export type CanonicalType = z.infer<typeof canonicalTypeSchema>;

function isCanonicalTypeKey(key: string): boolean {
  return canonicalTypeSchema.safeParse(key).success;
}

function schemaWithCanonicalKeys<V extends z.ZodType>(valueSchema: V, message: string) {
  return z.record(z.string(), valueSchema).refine((record) => Object.keys(record).every(isCanonicalTypeKey), {
    message,
  });
}

export const categoryMapSchema = schemaWithCanonicalKeys(
  z.number().int().positive(),
  "categoryMap keys must be canonical broker types",
);

export const tagMapSchema = schemaWithCanonicalKeys(
  z.array(z.string().min(1)),
  "tagMap keys must be canonical broker types",
);

export interface TypeObservation {
  readonly canonicalType: CanonicalType;
  /** Raw broker subtype (event type, summary_type, etc.) when it helps distinguish groups. */
  readonly brokerSubtype: string;
  readonly source: "trade-republic" | "scalable-capital";
  readonly amount: number;
  readonly currency: string;
  readonly payee: string;
  readonly notes?: string;
  readonly date: string;
}

export interface TypeGroup {
  readonly canonicalType: CanonicalType;
  readonly brokerSubtype: string;
  readonly source: "trade-republic" | "scalable-capital";
  readonly count: number;
  readonly sample: TypeObservation;
}

const GROUP_KEY_SEP = "\x1f";

export function typeGroupKey(group: Pick<TypeGroup, "canonicalType" | "brokerSubtype" | "source">): string {
  return [group.source, group.canonicalType, group.brokerSubtype].join(GROUP_KEY_SEP);
}

function parseTypeGroupKey(key: string): Pick<TypeGroup, "canonicalType" | "brokerSubtype" | "source"> {
  const parts = key.split(GROUP_KEY_SEP);
  const source = parts[0];
  const canonicalType = parts[1];
  const brokerSubtype = parts.slice(2).join(GROUP_KEY_SEP);
  if (source !== "trade-republic" && source !== "scalable-capital") {
    throw new Error(`Invalid type group key: ${key}`);
  }
  return {
    source,
    canonicalType: canonicalTypeSchema.parse(canonicalType),
    brokerSubtype,
  };
}

export function groupTypeObservations(observations: readonly TypeObservation[]): TypeGroup[] {
  const map = new Map<string, { count: number; sample: TypeObservation }>();
  for (const row of observations) {
    const key = typeGroupKey(row);
    const current = map.get(key);
    if (current) {
      map.set(key, { count: current.count + 1, sample: current.sample });
    } else {
      map.set(key, { count: 1, sample: row });
    }
  }
  return [...map.entries()]
    .map(([key, value]) => {
      const parsed = parseTypeGroupKey(key);
      return {
        ...parsed,
        count: value.count,
        sample: value.sample,
      };
    })
    .toSorted((a, b) => b.count - a.count);
}
