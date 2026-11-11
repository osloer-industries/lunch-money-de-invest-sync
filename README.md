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

- Pulls cash-relevant activity from **Trade Republic** (unofficial WebSocket client) and **Scalable Capital**
  (REST against a local auth proxy you run).
- Maps broker events into Lunch Money **manual account** transactions with stable `external_id` values so
  re-running a sync is idempotent (duplicates are skipped server-side).
- Tags spend that matches configured shared-card last-four digits with a `shared` tag for easier splitting later.

## Supported institutions

| Broker | Integration | What gets synced |
| --- | --- | --- |
| **Trade Republic** | [`trade-republic-api`](https://www.npmjs.com/package/trade-republic-api) (community, unofficial) | Timeline events with non-zero `cashChangeAmount` (card spend, transfers, interest, savings-plan executions, …) |
| **Scalable Capital** | [`unofficial-scalable-capital-api`](https://github.com/ffischbach/unofficial-scalable-capital-api) (local proxy) | `BrokerCashTransaction` entries only (security buy/sell activity is excluded) |

Both integrations are reverse-engineered. Response shapes are validated with **zod** at the boundary; schema drift
should fail loudly instead of inserting wrong amounts.

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
   Trade Republic    Scalable proxy    Lunch Money API
   (SMS 2FA CLI)     (browser 2FA)     (official v2 client)
```

- **No cloud sync.** Nothing in GitHub Actions runs `npm run sync` or needs repository secrets for brokers.
- **Interactive auth.** Trade Republic prompts for SMS 2FA each run; Scalable Capital relies on a proxy session you
  refresh in a browser (~hours of validity).

## Requirements

- **Node.js 24** (see [`.nvmrc`](.nvmrc) / [`.node-version`](.node-version))
- A [Lunch Money](https://lunchmoney.app) developer API key and one **manual account** per brokerage profile
- For Scalable Capital: a running instance of the unofficial proxy per operator (default example port `3141`)

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
| `scalableCapitalProfiles[]` | Per-account: `owner`, `proxyUrl`, optional `proxyToken`, `lunchMoneyAssetId` |

The `owner` string is a **local label** for logs only (e.g. `operator-a`, `operator-b`). It is not sent to brokers.

`LUNCH_MONEY_API_KEY` is read from the environment (not from `config.json`). See [`.env.example`](.env.example).

### Trade Republic

`trade-republic-api` `login()` blocks on a CLI prompt for the SMS code — plan for an **interactive** terminal session
each time you sync. Unattended cron sync would need a client that supports device pairing (not provided here).

### Scalable Capital

1. Run the [unofficial proxy](https://github.com/ffischbach/unofficial-scalable-capital-api) locally (one instance per
   operator; use different ports if needed).
2. Point each profile's `proxyUrl` at that instance; set `proxyToken` if you started the proxy with `--token`.

## Security model

- **Secrets stay local:** API keys, PINs, and phone numbers belong in gitignored `config.json` / `.env` on your laptop.
- **CI is credential-free:** workflows lint, typecheck, test, audit, and scan code — they never call Lunch Money or brokers.
- **Proxy hardening:** `proxyUrl` must not target cloud metadata hosts (validated in [`src/shared/config.ts`](src/shared/config.ts)).
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
  shared/           canonical transaction model, config loading, shared-card tagging
  lunch-money/      Lunch Money v2 client wrapper and upsert helpers
  trade-republic/   transport + mapper
  scalable-capital/ transport + mapper
  sync.ts           fetch → map → tag → upsert per configured profile
```

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

## Versioning and stability

This project is **pre-1.0.0** (`0.1.0` in [`package.json`](package.json)). Until `1.0.0`:

- **APIs, config schema, and sync behaviour may change** without a deprecation period.
- **Broker integrations may break** when Trade Republic or Scalable Capital change unofficial endpoints.
- Release Please collects [Conventional Commits](https://www.conventionalcommits.org/) on `main` into a release pull
  request; merging updates [CHANGELOG.md](CHANGELOG.md), version files, and creates a GitHub Release tag.

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
