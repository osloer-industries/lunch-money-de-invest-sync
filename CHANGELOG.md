# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.4](https://github.com/osloer-industries/lunch-money-de-invest-sync/compare/v0.2.3...v0.2.4) (2026-11-14)


### Features

* sync portfolio market value and savings balances, fix Scalable cash ([#94](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/94)) ([15b9f4b](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/15b9f4bda36321391876aa86a51cfea8064809e5))

## [0.2.3](https://github.com/osloer-industries/lunch-money-de-invest-sync/compare/v0.2.2...v0.2.3) (2026-11-14)


### Features

* categories CLI to view, edit, and re-apply mappings ([#85](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/85)) ([3214bdd](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/3214bdd5668ad8488bb254b38634f73524e3b8d2))


### Bug Fixes

* **classification:** recognise Trade Republic and Scalable event types ([#90](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/90)) ([28a4bba](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/28a4bba318ed3605d31ab9d8d33bb9493b719096))

## [0.2.2](https://github.com/osloer-industries/lunch-money-de-invest-sync/compare/v0.2.1...v0.2.2) (2026-11-14)


### Features

* **sync:** alert on Trade Republic app approval and re-check resumed sessions ([#70](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/70)) ([576c847](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/576c8479c6cb05af128c1f2af7e6ab4b2529ee5e))

## [0.2.1](https://github.com/osloer-industries/lunch-money-de-invest-sync/compare/v0.2.0...v0.2.1) (2026-11-14)


### Features

* **setup:** secure API key storage and resumable setup ([#72](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/72)) ([51c411d](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/51c411d5c0240d9e3a2b7890d674c6ab10afc18d))


### Bug Fixes

* **release:** mint release app token and pin org reusables v0.1.1 ([#78](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/78)) ([36c0139](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/36c0139f46d5ecdddc9212dfec9a00724acb8a64))
* **setup:** category mapping journey — grouped prompts, safe tags, setup hand-off ([#74](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/74)) ([1545cb8](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/1545cb89644ea1f8a6d4e6d26953729e402313ec))

## [0.2.0](https://github.com/osloer-industries/lunch-money-de-invest-sync/compare/v0.1.1...v0.2.0) (2026-11-14)


### ⚠ BREAKING CHANGES

* **setup:** pytr launcher detection, always --v2 login, credential consent ([#43](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/43))

### Features

* npm run doctor and unified README setup path ([#40](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/40)) ([2356ac3](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/2356ac32e07f8ac304bb4c2eb0d084b203f8e33c))
* **setup:** map withholding tax to excluded Investment tax ([#63](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/63)) ([0f62de7](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/0f62de7d14868df43c2f70a86eac55e1e827e822))
* **setup:** offer category mapping by default after dry-run ([#61](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/61)) ([6a9e336](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/6a9e336f40794cd3e3d4cf5a4ee5de3bd8bbe688))
* **setup:** offer Saveback income or excluded investment category ([#59](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/59)) ([f1b00ac](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/f1b00acb5d44eea3a7755f541e98c6a6f90858f8))
* **setup:** onboarding UX polish ([#41](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/41)) ([38daaa9](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/38daaa9b7a40ad22ea5ca702f957815a98fd3625))
* **setup:** print suggested account-scoped Lunch Money UI rules ([#62](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/62)) ([fdf2f87](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/fdf2f87e65d714c3c81da73d402ac0f1c01f86eb))


### Bug Fixes

* flip canonical amounts to Lunch Money v2 signs at insert ([#56](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/56)) ([a5693ee](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/a5693ee735831fafe84064bf7e4489458f967770))
* make monthOnlyDate UTC-stable and extend CI timezones ([#34](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/34)) ([d388f98](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/d388f98961e4ffa430a7377004e437eafa5e4c43))
* **setup:** default transfer mapping to Payment, Transfer ([#57](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/57)) ([01ef8bc](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/01ef8bc3100446b904a0df2910caceaa7a161587))
* **setup:** hide Scalable security types from category mapping ([#64](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/64)) ([6b4e55c](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/6b4e55c2853c4ba369a86db19c43d2cd49f948e9))
* **setup:** name new manual accounts after the broker ([#26](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/26)) ([40fe314](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/40fe314a0dab37c9a824d7239a6a23c6ff14c0e1))
* **setup:** pytr launcher detection, always --v2 login, credential consent ([#43](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/43)) ([ed66288](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/ed66288dbd5d4f846c2f953986a6ee96e784e467))
* **setup:** robust onboarding, incremental save, duplicate accounts ([#39](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/39)) ([4c0521b](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/4c0521bd8aba47a914f5931761a3b562080eff4b))
* **setup:** validate category flags and refuse category groups ([#60](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/60)) ([f19d175](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/f19d175e1d0250c23a5a77816a93dc585c5076ef))
* **subprocess:** fixed PATH, ~/.local/bin, ENOENT, timeout ([#42](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/42)) ([18d369e](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/18d369ecaa2accdf5f59b39fdb2d9ecb72d20ef6))
* **sync:** run sync CLI entry and load .env from setup ([#36](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/36)) ([ab52783](https://github.com/osloer-industries/lunch-money-de-invest-sync/commit/ab52783683600b9cd6230950f46b0ddec26a141b))

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
