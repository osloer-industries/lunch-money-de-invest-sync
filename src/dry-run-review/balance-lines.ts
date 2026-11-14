import type { BalanceReading, BrokerBalanceSnapshot } from "../shared/broker-balances.js";
import { formatMoney } from "../shared/decimal.js";

function formatReading(label: string, reading: BalanceReading | undefined): string | undefined {
  if (reading === undefined) {
    return undefined;
  }
  if (!reading.ok) {
    return `${label}: could not read (${reading.error})`;
  }
  const asOf = reading.asOf ? `, as of ${reading.asOf}` : "";
  return `${label}: ${formatMoney(reading.value, reading.currency)}${asOf}`;
}

/** Plain-language balance lines for the dry-run review summary (no Lunch Money account ids). */
export function brokerBalanceLines(snapshot: BrokerBalanceSnapshot): readonly string[] {
  const lines: string[] = [];
  const holdings = formatReading("Holdings (market value)", snapshot.holdings);
  const cash = formatReading("Broker cash", snapshot.cash);
  const savings = formatReading("Overnight savings", snapshot.savings);
  if (holdings) {
    lines.push(holdings);
  }
  if (cash) {
    lines.push(cash);
  }
  if (savings) {
    lines.push(savings);
  }
  for (const note of snapshot.notes) {
    lines.push(`Note: ${note}`);
  }
  return lines;
}