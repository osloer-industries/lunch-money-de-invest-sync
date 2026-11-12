import type { TypeObservation } from "./canonical-type.js";

export function flatMapClassified<T>(
  items: readonly T[],
  classify: (item: T) => TypeObservation | null,
): TypeObservation[] {
  return items.flatMap((item) => {
    const row = classify(item);
    return row ? [row] : [];
  });
}
