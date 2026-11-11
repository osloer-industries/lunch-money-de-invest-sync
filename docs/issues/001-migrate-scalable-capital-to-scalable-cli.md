# Migrate Scalable Capital source to official scalable-cli

> **Tracking:** File this content as a GitHub issue if no issue number is linked yet from the migration PR.

## Summary

Replace the Scalable Capital local HTTP proxy with the official [Scalable CLI](https://github.com/ScalableCapital/scalable-cli) (`sc`). Each operator runs `sc` on their machine; this tool shells out to `sc broker transactions --json`, validates with `zod`, and maps cash summaries into Lunch Money.

## Clean break (intentionally out of scope)

This migration is a **hard cutover with no backwards compatibility**:

- Remove all proxy client code, `proxyUrl` / `proxyToken` config, tests, and docs — no deprecation shims.
- **No migration path** for Lunch Money rows synced via the old proxy. Operators should assume a **fresh Lunch Money manual account** (or accept manual cleanup) before first sync on the new integration.
- Going forward, `external_id` values remain **`scalable-capital:{broker_transaction_id}`** (stable broker ids from `sc`) so re-running sync on the same setup stays idempotent via Lunch Money duplicate skipping.

## Motivation

- Drop self-hosted proxy maintenance.
- Official OAuth via `sc login` after **Profile → Security → Agentic Investing**.
- Simpler per-operator setup (install `sc`, login, run sync).

## Current → target architecture

See PR implementation: `src/scalable-capital/client.ts` spawns `sc`, paginates `data.result.cursor`, maps `BrokerCashTransactionSummary` only.

## Field mapping

| `sc` (`data.result.items[]`, cash summary) | Lunch Money |
| --- | --- |
| `id` | `external_id`: `scalable-capital:{id}` |
| `last_event_datetime` | `date` |
| `amount` (decimal string) | `amount` |
| `currency` | `currency` |
| `description` | `payee` |

## Config (`scalableCapitalProfiles[]`)

| Field | Required |
| --- | --- |
| `owner` | yes |
| `lunchMoneyAssetId` | yes |
| `portfolioId` | optional |
| `scBinaryPath` | optional |
| `scConfigDir` | optional |

## Operator prerequisites

- Install `sc` (Linux: glibc ≥ 2.38 on official binaries).
- Enable Agentic Investing; `sc login --local-read-only` recommended.
- Multi-operator: separate laptops, sessions, and config profiles.

## Error handling

Missing binary (`ENOENT`), `no_session`, malformed JSON / zod failure, pagination guard — fail loud without logging secrets.

## Testing

Sanitized fixtures + mocked `ScCliRunner`; no live `sc` in CI.

## Acceptance criteria

- [ ] No proxy code or config remains
- [ ] `npm run check` green; Trade Republic untouched
- [ ] README / AGENTS.md describe clean-break operator workflow

## Open questions

- Minimum supported `sc --version`?
- Filter pending/cancelled cash via `status` / `is_cancellation`?
- Overlap with open PRs #9 / #12 on README / `config.example.json`
