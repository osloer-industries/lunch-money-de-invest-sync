# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
- Public readiness documentation, generic operator placeholders in examples, and SECURITY/issue templates
  scoped to this repository.

## [0.1.0] - 2026-11-11

### Added

- Local sync from Trade Republic and Scalable Capital into Lunch Money manual accounts.
- Shared-card tagging via configurable last-four digits.
- Unit tests with faked broker and Lunch Money I/O.

[Unreleased]: https://github.com/osloer-industries/lunch-money-de-invest-sync/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/osloer-industries/lunch-money-de-invest-sync/releases/tag/v0.1.0
