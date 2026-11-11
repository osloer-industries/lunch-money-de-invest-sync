# Changelog

## Unreleased

### Breaking (clean break — no backwards compatibility)

- **Scalable Capital:** remove the HTTP proxy integration completely (`proxyUrl`, `proxyToken`,
  gateway client, related tests/docs). Scalable sync now requires the official
  [Scalable CLI](https://github.com/ScalableCapital/scalable-cli) only. Operators install `sc`,
  enable Agentic Investing, and run `sc login` locally. Config profiles use optional
  `portfolioId`, `scBinaryPath`, and `scConfigDir`.
- **Lunch Money history:** no migration from proxy-era syncs — assume a fresh manual account (or
  manual cleanup). Re-runs on the new integration stay idempotent via `external_id`
  `scalable-capital:{broker_transaction_id}`.

### Added

- `sc broker transactions --json` transport with fixture-based tests and cursor pagination.
- Operator docs for Linux glibc ≥ 2.38 prerequisite and recommended `sc login --local-read-only`.
