# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1](https://github.com/osloer-industries/lunch-money-de-invest-sync/compare/v0.1.0...v0.1.1) (2026-11-12)


### Features

* add sync CLI flags and interactive setup ([#18](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/18)) ([15e01d8](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/15e01d83b0e4d36121cfdd614aed2304b538b310))
* category and tag mapping in setup ([#16](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/16)) ([#20](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/20)) ([b919f00](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/b919f00af88a8bf780f5b04f3299d99ca8dab6f8))
* migrate Scalable Capital sync to official scalable-cli ([12963cb](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/12963cb7810c32c4ee931e8874ce59b706786650))
* migrate Trade Republic sync to pytr CLI ([#17](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/17)) ([0667c73](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/0667c739e14726111466b2132f514b082023b091))


### Bug Fixes

* harden sc spawn env for Sonar security rating ([16e0ca2](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/16e0ca2822950479ac60bf173b51ad8867866a4f))
* resolve absolute sc path for secure spawn ([04d54c2](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/04d54c2ffab5dff97be2d53f58c63049ac885e2e))

## [Unreleased]

### Breaking (clean break — no backwards compatibility)

- **Trade Republic:** remove the in-process [`trade-republic-api`](https://www.npmjs.com/package/trade-republic-api)
  WebSocket client. Sync now shells out to [pytr](https://github.com/pytr-org/pytr)
  (`export_transactions` → `all_events.json`). Operators install pytr, run `pytr login` locally,
  and must drop `phoneNumber` / `pin` from `config.json` (use `pytrCommand`, optional `pytrHome`,
  and other pytr profile fields instead). No migration from proxy-era or npm-client `external_id`
  rows — use a fresh Lunch Money manual account before the first pytr sync.
- **Scalable Capital:** remove the HTTP proxy integration completely (`proxyUrl`, `proxyToken`,
  gateway client, related tests/docs). Scalable sync now requires the official
  [Scalable CLI](https://github.com/ScalableCapital/scalable-cli) only. Operators install `sc`,
  enable Agentic Investing, and run `sc login` locally. Config profiles use optional
  `portfolioId`, `scBinaryPath`, and `scConfigDir`.
- **Lunch Money history:** no migration from proxy-era syncs — assume a fresh manual account (or
  manual cleanup). Re-runs on the new integration stay idempotent via `external_id`
  `scalable-capital:{broker_transaction_id}`.

### Added

- Category and tag mapping: `categoryMap` / `tagMap` in `config.json`, applied on insert
  (`category_id` + tags). `npm run setup -- --categories` fetches broker history read-only,
  groups by canonical type, shows anonymised examples, maps to Lunch Money categories (create
  only after explicit confirmation), and optional `--export-type-summary <file>`.
- `npm run sync -- --export-type-summary <file>` for opt-in anonymised type reports.
- Lunch Money categories via API v2 (`categories.getAll`, `categories.create`) — see
  [Lunch Money v2 API docs](https://lunchmoney.dev/docs) and
  [`lunch-money-js-v2` categories](https://github.com/lunch-money/lunch-money-js-v2#categories).
  Transaction **rules** are not created by this tool (`apply_rules` on insert only; no rules CRUD in v2 client).
- `npm run sync` CLI flags: `--broker`, `--account`, `--dry-run`, `--help` (Node `parseArgs`).
- `npm run setup` interactive onboarding with injectable I/O for tests; `--non-interactive` for scripted installs.
- Trade Republic pytr transport (`PytrCliRunner`), saveback single-row tagging, and fixture-based tests.
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
