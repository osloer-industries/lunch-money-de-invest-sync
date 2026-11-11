<div align="center">

# lunch-money-de-invest-sync

**Sync German investment accounts (Trade Republic, Scalable Capital) into [Lunch Money](https://lunchmoney.app)**

[![CI](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/ci.yml)
[![CodeQL](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/codeql.yml/badge.svg)](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-24.x-339933?logo=node.js&logoColor=white)](.nvmrc)
[![Version](https://img.shields.io/badge/version-0.1.0-blue)](CHANGELOG.md)

> **Pre-release (&lt;1.0.0).** APIs, configuration format, and behaviour may change without notice.
> Not recommended for production or unattended automation you cannot afford to break.
> See [Versioning and stability](#versioning-and-stability).

> **Local tool.** Sync runs on your machine only. This repository does not store broker credentials,
> Lunch Money API keys, or `config.json`. There is no hosted sync service and no CI job that calls brokers.

</div>

---

## What it does

- Pulls cash-relevant activity from **Trade Republic** (community WebSocket client) and **Scalable Capital**
  (official [`scalable-cli`](https://github.com/ScalableCapital/scalable-cli) via `sc broker transactions --json`).
- Maps broker events into Lunch Money **manual account** transactions with stable `external_id` values so
  re-running a sync is idempotent (duplicates are skipped server-side).
- Tags spend that matches configured shared-card last-four digits with a `shared` tag for easier splitting later.

## Supported institutions

| Broker | Integration | What gets synced |
| --- | --- | --- |
| **Trade Republic** | [`trade-republic-api`](https://www.npmjs.com/package/trade-republic-api) (community, unofficial) | Timeline events with non-zero `cashChangeAmount` (card spend, transfers, interest, savings-plan executions, …) |
| **Scalable Capital** | Official [`scalable-cli`](https://github.com/ScalableCapital/scalable-cli) (`sc`) | Cash transaction summaries only (security buy/sell activity is excluded) |

Both broker surfaces can change without notice. Payloads are validated with **zod** at the boundary so schema drift
should fail loudly instead of inserting wrong amounts.

Planned clean-break migrations are tracked in the issue tracker — see [#14](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/14) (Trade Republic / pytr) and [#15](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/15) (Scalable Capital / scalable-cli, shipped on `main`).

## How it works (local only)

```
  config.json (gitignored)          LUNCH_MONEY_API_KEY (env / .env, gitignored)
           │                                      │
           └──────────────┬───────────────────────┘
                          │
                    npm run sync
                          │
         ┌────────────────┼────────────────┐
         │                │                │
   Trade Republic    Scalable CLI      Lunch Money API
   (SMS 2FA CLI)     (`sc login`)      (official v2 client)
```

- **No cloud sync.** Nothing in GitHub Actions runs `npm run sync` or needs repository secrets for brokers.
- **Interactive auth.** Trade Republic prompts for SMS 2FA each run; Scalable Capital uses `sc login` on each operator machine
  (sessions expire — re-auth when `sc` prompts).

## Requirements

- **Node.js 24** (see [`.nvmrc`](.nvmrc) / [`.node-version`](.node-version))
- A [Lunch Money](https://lunchmoney.app) developer API key and one **manual account** per brokerage profile
- For Scalable Capital: [`scalable-cli`](https://github.com/ScalableCapital/scalable-cli) installed locally per operator

## Quick start

```bash
git clone https://github.com/osloer-industries/lunch-money-de-invest-sync.git
cd lunch-money-de-invest-sync
npm ci
cp config.example.json config.json   # edit profiles — see Configuration
cp .env.example .env                 # optional; never commit real values
export LUNCH_MONEY_API_KEY='your-key'
npm run sync
```

## Configuration

Copy [`config.example.json`](config.example.json) to `config.json` in the repo root (gitignored). Fields:

| Field | Purpose |
| --- | --- |
| `sharedCardLast4` | Last four digits of cards whose spend should receive the `shared` tag (matched in payee/notes text) |
| `tradeRepublicProfiles[]` | Per-account: `owner` label, `phoneNumber`, `pin`, `lunchMoneyAssetId` (Lunch Money manual account id) |
| `scalableCapitalProfiles[]` | Per-account: `owner`, `lunchMoneyAssetId`; optional `portfolioId`, `scBinaryPath`, `scConfigDir` |

The `owner` string is a **local label** for logs only (e.g. `operator-a`, `operator-b`). It is not sent to brokers.

`LUNCH_MONEY_API_KEY` is read from the environment (not from `config.json`). See [`.env.example`](.env.example).

## Why these dependencies

- **Lunch Money**: [`@lunch-money/lunch-money-js-v2`](https://github.com/lunch-money/lunch-money-js-v2),
  the official TypeScript client for Lunch Money's (alpha) v2 API. Transaction dedup is handled
  server-side: inserting a transaction with the same `(manual_account_id, external_id)` pair
  twice is a no-op, so re-running a sync is always safe.
- **Trade Republic**: [`trade-republic-api`](https://www.npmjs.com/package/trade-republic-api)
  (community, unofficial). It authenticates over Trade Republic's WebSocket API and exposes a
  `timeline` topic with cash-relevant events (card spend, transfers, interest, savings-plan
  executions, …).
- **Scalable Capital**: the official [`scalable-cli`](https://github.com/ScalableCapital/scalable-cli)
  (`sc`, Apache-2.0). Sync shells out to `sc broker transactions --json`, parses the machine JSON
  envelope, and maps cash summaries into Lunch Money. Operators authenticate with `sc login`
  (device-code OAuth) after enabling **Profile → Security → Agentic Investing** in the Scalable
  web app. Recommended for sync: `sc login --local-read-only`.

Trade Republic remains an unofficial integration; Scalable uses the supported CLI surface. Both
outputs are validated with `zod` at the boundary (see `types.ts` in each module) so a drifted
field fails loudly with a clear error instead of silently inserting wrong amounts into Lunch Money.

## Setup

1. `npm ci`
2. Get a Lunch Money API key from **Settings → Developers** in the Lunch Money app.
3. Create a **manual account** in Lunch Money per brokerage profile (e.g. `Trade Republic (operator-a)`,
   `Scalable Capital (operator-b)`), and note each account's numeric id.
4. Copy `config.example.json` to `config.json` and fill in:
   - `sharedCardLast4`: last four digits of any shared card. Transactions whose payee/notes mention
     one of these get tagged `shared` in Lunch Money — check this matches your real transaction text
     (see `src/shared/tagging.ts`) and adjust the matcher if your bank formats it differently.
   - `tradeRepublicProfiles`: one entry per operator with phone number, PIN, and Lunch Money manual account id.
   - `scalableCapitalProfiles`: one entry per operator (and optionally per portfolio). Set `portfolioId` when
     `sc broker portfolios` shows more than one portfolio for that operator.
5. `LUNCH_MONEY_API_KEY=... npm run sync`

`config.json` and `.env` are gitignored — they carry phone numbers and account ids, not just secrets;
do not commit them.

### Trade Republic: running the sync

`trade-republic-api`'s `login()` blocks on a CLI prompt for the SMS 2FA code — plan for an **interactive** terminal
session each time you sync. A future clean break may move Trade Republic to a local [`pytr`](https://github.com/pytr-org/pytr)
CLI instead of in-process WebSocket login — see [#14](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/14).

### Scalable Capital: Scalable CLI (`sc`)

1. Install `sc` per operator machine ([releases](https://github.com/ScalableCapital/scalable-cli/releases);
   macOS: Homebrew tap `ScalableCapital/tap`; Linux: official tarballs require **glibc ≥ 2.38**).
2. In the Scalable web app, enable **Profile → Security → Agentic Investing**.
3. Run `sc login --local-read-only` and complete the browser device-code flow (do not automate login).
4. If needed, run `sc broker portfolios` and either `sc broker context select --portfolio-id <ID>`
   or set `portfolioId` on the matching `scalableCapitalProfiles` entry.
5. Run `npm run sync` with `LUNCH_MONEY_API_KEY` set. Sessions refresh automatically but expire
   after idle/max lifetime documented in scalable-cli — re-run `sc login` when prompted.

If `sc` is installed outside standard directories, set `scBinaryPath` in config to the absolute path from `which sc`.

Broker credentials and CLI session files stay on the operator's machine only (`SC_CONFIG_DIR` /
default config dir). Never commit them to this repo.

Adopting `sc` is a **clean break** from older experimental proxy workflows: use a fresh Lunch Money
manual account (or clean up legacy rows yourself). Re-running sync on the current path is safe because
`external_id` values are stable broker ids (`scalable-capital:{id}`). Background: [#15](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/15).

## Security model

- **Secrets stay local:** API keys, PINs, and phone numbers belong in gitignored `config.json` / `.env` on your laptop.
- **CI is credential-free:** workflows lint, typecheck, test, audit, and scan code — they never call Lunch Money or brokers.
- **CLI sessions stay local:** `sc` config and session files live only on the operator machine (`SC_CONFIG_DIR`); this repo never reads or stores them.
- **Reporting vulnerabilities:** see [SECURITY.md](SECURITY.md) (private GitHub Security Advisories).

## Multi-operator usage

Several people can feed **one shared Lunch Money budget** while keeping broker credentials separate:

- **Primary operator** runs sync for their Trade Republic / Scalable profiles from their machine and their `config.json`.
- **Second operator** clones the repo on their laptop, uses their own Lunch Money developer token (minted in the shared
  budget), and a `config.json` containing only their profiles and manual account ids.

Each operator's `config.json` is independent; nothing is synced through GitHub.

## Project layout

```
src/
  shared/           canonical Transaction type, config loading, shared-card tagging
  lunch-money/      thin wrapper around the official Lunch Money v2 API client
  trade-republic/   transport + mapper for Trade Republic's timeline
  scalable-capital/ transport + mapper for the official Scalable CLI (`sc`)
  sync.ts           orchestrator: fetch → map → tag → upsert, per configured profile
```

Each broker module is a **transport** (I/O, injectable for tests) and **mapper** (pure function). `sync.ts` wires live
transports; tests inject fakes.

## Scripts

| Script | Description |
| --- | --- |
| `npm run sync` | Run a full sync using `config.json` and `LUNCH_MONEY_API_KEY` |
| `npm run check` | Lint, typecheck, coverage, and build (matches CI **Quality** job) |
| `npm run lint` | Oxlint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest unit tests (faked I/O — no live brokers) |
| `npm run build` | Compile to `dist/` |

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). Locally:

```bash
npm ci
npm run check
npm audit --omit=dev
```

CI runs org **workflow-security** (actionlint + zizmor), **Quality** (`npm run check` + production audit),
**CodeQL**, dependency review on pull requests, and semantic pull request title validation.
Details: [docs/consuming-org-reusables.md](docs/consuming-org-reusables.md).

Every module is covered by unit tests using fakes for network and WebSocket I/O — no test talks to a real broker or
Lunch Money.

## Versioning and stability

This project is **pre-1.0.0** (`0.1.0` in [`package.json`](package.json)). Until `1.0.0`:

- **APIs, config schema, and sync behaviour may change** without a deprecation period.
- **Broker integrations may break** when brokers change unofficial clients or CLI behaviour.
- Release Please collects [Conventional Commits](https://www.conventionalcommits.org/) on `main` into a release pull
  request; merging updates [CHANGELOG.md](CHANGELOG.md), version files, and creates a GitHub Release tag.

## Running locally

Syncs are **manual and opt-in** on your own machine. Trade Republic needs SMS 2FA; Scalable needs periodic `sc login` on
each operator laptop. There is no scheduled or GitHub-hosted sync workflow.

Keep `config.json` on disk only (copy from `config.example.json`; it is gitignored). Set `LUNCH_MONEY_API_KEY` in your
shell or a local `.env` file (also gitignored), then run `npm run sync` when you want fresh transactions.

## Support

- **Bugs and feature ideas:** [open an issue](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/new/choose)
  (use the bug template when something breaks).
- **Security issues:** do **not** open a public issue — use [SECURITY.md](SECURITY.md).
- **Response expectations:** best-effort maintenance by volunteers; no SLA.

## Contributing

Pull requests welcome. Use Conventional Commit **pull request titles** (`feat:`, `fix:`, `chore:`, …), keep coverage
≥80%, and never commit secrets. See [CONTRIBUTING.md](CONTRIBUTING.md) and
[`.github/pull_request_template.md`](.github/pull_request_template.md).

## License

[MIT](LICENSE) — Copyright (c) 2026 osloer-industries.
