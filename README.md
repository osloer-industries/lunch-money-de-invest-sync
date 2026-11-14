<div align="center">

# lunch-money-de-invest-sync

**Sync German investment accounts (Trade Republic, Scalable Capital) into [Lunch Money](https://lunchmoney.app)**

[![CI](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/ci.yml/badge.svg)](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/ci.yml)
[![CodeQL](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/codeql.yml/badge.svg)](https://github.com/osloer-industries/lunch-money-de-invest-sync/actions/workflows/codeql.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-24.x-339933?logo=node.js&logoColor=white)](.nvmrc)
[![Version](https://img.shields.io/badge/version-0.1.1-blue)](CHANGELOG.md)

> **Pre-release (&lt;1.0.0).** APIs, configuration format, and behaviour may change without notice.
> Not recommended for production or unattended automation you cannot afford to break.
> See [Versioning and stability](#versioning-and-stability).

> **Local tool.** Sync runs on your machine only. This repository does not store broker credentials,
> Lunch Money API keys, or `config.json`. There is no hosted sync service and no CI job that calls brokers.

</div>

---

## What it does

- Pulls cash-relevant activity from **Trade Republic** ([pytr](https://github.com/pytr-org/pytr) CLI → `all_events.json`)
  and **Scalable Capital** (official [`scalable-cli`](https://github.com/ScalableCapital/scalable-cli) via
  `sc broker transactions --json`).
- Maps broker events into Lunch Money **manual account** transactions with stable `external_id` values so
  re-running a sync is idempotent (duplicates are skipped server-side).
- Keeps broker amounts in the internal canonical model (negative = outflow, positive = inflow) and converts to
  [Lunch Money v2](https://lunchmoney.dev/amounts-and-balances) signs at insert time (positive = outflow,
  negative = inflow). Dry-run previews use the same v2 amounts that would be POSTed.
- Tags spend that matches configured shared-card last-four digits with a `shared` tag for easier splitting later.
- Optionally keeps **market value** and the **Scalable overnight savings** balance in separate Lunch Money
  manual accounts (balance set on every sync, see [Balances and net worth](#balances-and-net-worth)), and
  compares each cash account with the broker-reported cash after every sync.

## Supported institutions

| Broker | Integration | What gets synced |
| --- | --- | --- |
| **Trade Republic** | [pytr](https://github.com/pytr-org/pytr) (community CLI, unofficial) | pytr timeline events with non-zero cash amount (card spend, transfers, interest, saveback as one row, …) |
| **Scalable Capital** | Official [`scalable-cli`](https://github.com/ScalableCapital/scalable-cli) (`sc`) | Cash transaction summaries **and** executed security trades (buy, sell, savings plan) as cash movements, so the cash account matches Scalable's `cash_balance`; pending, cancelled and depot-transfer rows are skipped |

Both broker surfaces can change without notice. Payloads are validated with **zod** at the boundary so schema drift
should fail loudly instead of inserting wrong amounts.

Clean-break broker migrations: Trade Republic via pytr ([#14](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/14)) and Scalable Capital via scalable-cli ([#15](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/15)).

## How it works (local only)

```
  config.json (gitignored)          OS keychain (Lunch Money API key)
           │                                      │
           └──────────────┬───────────────────────┘
                          │
                    npm run sync
                          │
         ┌────────────────┼────────────────┐
         │                │                │
   Trade Republic    Scalable CLI      Lunch Money API
   (`pytr login`)    (`sc login`)      (official v2 client)
```

- **No cloud sync.** Nothing in GitHub Actions runs `npm run sync` or needs repository secrets for brokers.
- **Interactive auth.** Trade Republic uses `pytr login` on each operator machine; Scalable Capital uses `sc login`
  (sessions expire — re-auth when pytr or `sc` prompts).

## Requirements

- **Node.js 24** (see [`.nvmrc`](.nvmrc) / [`.node-version`](.node-version)); run `npm ci` after every clone
- **macOS:** [Homebrew](https://brew.sh) for the Scalable tap (`eval "$(brew shellenv)"` so `brew` is on your PATH)
- **[uv](https://github.com/astral-sh/uv)** (recommended) to run pytr with a supported Python (3.10+; macOS system Python 3.9 is too old)
- [Lunch Money](https://lunchmoney.app) developer API key and one **manual account** per broker profile you sync (type investment; synced transactions update **cash** balance, not market value — set starting cash in the Lunch Money UI if needed). Optional extra manual accounts per profile hold the market value and, for Scalable, the overnight savings balance (setup offers to create them)
- **Trade Republic:** [pytr](https://github.com/pytr-org/pytr) via `pytr`, `uvx pytr@0.4.10`, or `uv tool install pytr`
- **Scalable Capital:** official CLI — `brew install ScalableCapital/tap/scalable-cli` (formula name `scalable-cli`, not `sc` alone) after enabling **Profile → Security → Agentic Investing** in the Scalable web app

## Quick start

```bash
git clone https://github.com/osloer-industries/lunch-money-de-invest-sync.git
cd lunch-money-de-invest-sync
npm ci
npm run doctor          # prerequisites; prints fix commands for anything missing
npm run setup           # interactive onboarding (API key in OS keychain; dry-run review at the end)
npm run setup -- --categories   # map broker types → Lunch Money categories/tags (read-only broker fetch)
npm run categories -- list      # show saved category/tag mapping (see categories --help)
npm run categories -- edit      # change mapping after setup (saves after each type)
npm run sync -- --dry-run
npm run sync
```

The first time you run `npm run setup`, you paste your Lunch Money API key once; it is stored in your OS keychain (not in `config.json` or a plaintext `.env`). Rotate or remove it with `npm run setup -- --replace-api-key` or `npm run setup -- --clear-api-key`. For scripts/CI you may still set `LUNCH_MONEY_API_KEY` in the environment.

`npm run setup` validates your API key, detects `pytr` / `sc` launchers, walks broker login (including `pytr login --v2 --store_credentials` when you consent), saves answers incrementally to `config.json`, and can walk through an interactive **dry-run review** at the end (summary per profile, category drill-down, fix mappings in place) before you sync for real.

`npm run sync -- --dry-run` uses the same review on a TTY instead of dumping hundreds of preview lines. Use `--since YYYY-MM-DD` (or set `syncSince` in `config.json` during review) to limit how much history you import on the first sync.

### Trade Republic privacy notes

- `pytr login --store_credentials` (recommended for unattended sync) writes your **phone number and PIN in plain text** to `~/.pytr/credentials` (mode `0600`). Setup explains this and asks for explicit consent.
- pytr also stores a session cookie file named `~/.pytr/cookies.<phone-number>.txt` (pytr behaviour). Treat `~/.pytr` as secrets; never commit it.

Use `npm run sync -- --broker trade-republic --account operator-a --dry-run` to limit brokers/owners or preview inserts without POST requests.

### Balances and net worth

Transactions only move the **cash** account. To get the whole portfolio into Lunch Money net worth,
each profile can point at extra manual accounts whose **balance** (not transactions) is set on every
real sync:

| Account | Config field | Source | Lunch Money balance |
| --- | --- | --- | --- |
| Cash (required) | `lunchMoneyAssetId` | synced transactions | sum of synced cash movements |
| Holdings (optional, both brokers) | `holdingsAccountId` | Trade Republic: sum of `netValue` from `pytr portfolio --v2`; Scalable: `valuation.securities` + `valuation.crypto` from `sc broker overview --json` | securities market value, **excluding cash** (no double counting), `balance_as_of` = broker valuation time when reported |
| Overnight savings (optional, Scalable) | `savingsAccountId` | `data.result.balance` from `sc overnight --json` | Tagesgeld balance |

For Scalable this adds up to: brokerage cash + securities + overnight savings = total Scalable value.
Internal transfers between the overnight savings account and the brokerage clearing account appear
only as `transfer` rows on the cash account; the savings account has no transactions, only a balance.
Fixed-term savings (`sc fixed-term`) are not tracked yet.

`npm run setup` asks "Track portfolio market value in a separate Lunch Money account?" (and, for
Scalable, the overnight savings question) after you pick the cash account, and offers it once per run
for resumed profiles that do not have one yet. Non-interactive setup accepts
`--trade-republic-holdings-account-id`, `--scalable-holdings-account-id` and
`--scalable-savings-account-id`.

**Cash reconciliation:** after each profile, sync compares the Lunch Money cash balance with the
broker's own cash figure (Trade Republic: the `Cash EUR` line of `pytr portfolio`; Scalable:
`cash_balance` from `sc broker cash-breakdown`). A difference above **1.00** prints a warning with both
values; nothing is overwritten unless you pass `--reconcile-cash`, which sets the Lunch Money cash
balance to the broker value. `--dry-run` only reports (and accounts for rows it would still insert).

If reading a broker balance or updating Lunch Money fails, sync prints a warning, keeps going with the
remaining steps and profiles (transactions are never blocked by it), and exits with code 1 at the end
so scheduled runs still notice.

### Categories and tags (issue [#16](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/16))

After profiles exist in `config.json`, run `npm run setup -- --categories` to map canonical broker
types to Lunch Money categories and tags using **read-only** broker fetches. The step shows
**anonymised** examples (bucketed amounts, redacted ISINs/IBANs/IDs, month-only dates). New
Lunch Money categories are created only after an explicit **y/N** confirmation, with exclude flags
shown up front. Results are stored as `categoryMap` and `tagMap` in `config.json`, saved after
each question so an interrupted run keeps earlier answers.

Types that share a suggested category are asked about once: buy / sell / savings-plan →
**Investments**, dividend / interest → **Income**, deposit / withdrawal / transfer →
**Payment, Transfer**. Saveback and `unknown` are always asked on their own (for `unknown` the
default is **Skip** — rows stay uncategorised with the `needs-review` tag — and your existing
transfer category is listed next; skipping does not affect transfers). Otherwise the first picker
entry is the sensible default (the matching existing category, else "Create new category …"). The
tag step offers suggested tags (pre-ticked; `dividend`, `interest`, `saveback`, `needs-review`),
your existing Lunch Money tags, and free text — pressing Enter with nothing selected means no tags.

Optional: `npm run setup -- --categories --export-type-summary types-summary.json` or
`npm run sync -- --export-type-summary types-summary.json` writes counts and anonymised examples only
(never written by default).

Lunch Money **categories** are created via the v2 API ([docs](https://lunchmoney.dev/docs),
[`categories.create`](https://github.com/lunch-money/lunch-money-js-v2#categories)). Deposits,
withdrawals, and internal transfers suggest **Payment, Transfer** (Lunch Money's default excluded
transfer category). Map the **bank-side** leg of the same movement to that category too (for
example a €1,000 checking outflow and a brokerage deposit both in **Payment, Transfer**). When
mapping finishes, setup prints suggested Lunch Money **UI rules** for
`saveback` and `needs-review`, scoped to your brokerage manual accounts (v2 has no rules API).
Inserts use `apply_rules: true`; broad payee rules can overwrite `categoryMap`. Kapitalertragsteuer
and Soli suggest **Investment tax** (excluded from budget and totals), not a budgeted **Taxes**
expense. The tool does **not** create rules via the API; categorisation applies only to rows this
sync inserts.

**Dividend reinvestment (DRIP):** a dividend in **Income** followed by a savings-plan
**buy** in excluded **Investments** still counts the dividend as income even though cash stayed in
the brokerage — that may be what you want; adjust categories or rules if not.

## Configuration

Copy [`config.example.json`](config.example.json) to `config.json` in the repo root (gitignored). Fields:

| Field | Purpose |
| --- | --- |
| `sharedCardLast4` | Last four digits of cards whose spend should receive the `shared` tag (matched in payee/notes text) |
| `tradeRepublicProfiles[]` | Per-account: `owner`, `lunchMoneyAssetId`; optional `holdingsAccountId`, `pytrCommand`, `pytrHome`, `account`, `pytrMinVersion` |
| `scalableCapitalProfiles[]` | Per-account: `owner`, `lunchMoneyAssetId`; optional `holdingsAccountId`, `savingsAccountId`, `portfolioId`, `scBinaryPath`, `scConfigDir` |
| `categoryMap` | Canonical type → Lunch Money `category_id` (see `npm run setup -- --categories`) |
| `tagMap` | Canonical type → extra tag names applied at sync (unknown types always get `needs-review`) |

After setup, use `npm run categories -- list` or `npm run categories -- edit` to view or change
`categoryMap` / `tagMap` without re-running setup. `npm run categories -- reapply --dry-run` previews
updating already-synced manual-account rows to match the mapping; run without `--dry-run` to apply
(idempotent). Mapping files store category ids and tag names only — no API keys.

The `owner` string is a **local label** for logs only (e.g. `operator-a`, `operator-b`). It is not sent to brokers.

The Lunch Money API key is read from the OS keychain after setup (or from the environment for scripts). See [`.env.example`](.env.example) for optional non-secret settings only.

## Why these dependencies

- **Lunch Money**: [`@lunch-money/lunch-money-js-v2`](https://github.com/lunch-money/lunch-money-js-v2),
  the official TypeScript client for Lunch Money's (alpha) v2 API. Transaction dedup is handled
  server-side: inserting a transaction with the same `(manual_account_id, external_id)` pair
  twice is a no-op, so re-running a sync is always safe.
- **Trade Republic**: [pytr](https://github.com/pytr-org/pytr) (community CLI, MIT). Sync shells out to
  `pytr export_transactions`, reads `all_events.json`, and maps cash-relevant timeline events.
  Operators authenticate with `pytr login --v2` (app approval); credentials live under `~/.pytr`
  on the operator machine, never in this repo.
- **Scalable Capital**: the official [`scalable-cli`](https://github.com/ScalableCapital/scalable-cli)
  (`sc`, Apache-2.0). Sync shells out to `sc broker transactions --json`, parses the machine JSON
  envelope, and maps cash summaries plus executed trades into Lunch Money. Operators authenticate with `sc login`
  (device-code OAuth) after enabling **Profile → Security → Agentic Investing** in the Scalable
  web app. Recommended for sync: `sc login --local-read-only`.

Trade Republic remains an unofficial integration; Scalable uses the supported CLI surface. Both
outputs are validated with `zod` at the boundary (see `types.ts` in each module) so a drifted
field fails loudly with a clear error instead of silently inserting wrong amounts into Lunch Money.

## Advanced / manual configuration

Prefer [Quick start](#quick-start) (`npm run doctor`, then `npm run setup`). To edit files by hand, copy [`config.example.json`](config.example.json) and run `npm run doctor` before sync. `config.json` is gitignored — do not commit it. Do **not** put the Lunch Money API key in `.env`.

### Trade Republic: pytr

1. Install pytr per operator machine ([pytr](https://github.com/pytr-org/pytr); recommended:
   `uvx pytr@0.4.10` or pin via `pytrCommand` in config).
2. Run `pytr login --v2 --store_credentials` once (interactive; see privacy notes above; data stays in `~/.pytr`, not in this repo).
3. Optional: set `pytrHome` when the pytr data dir is not `~/.pytr` (path must end with `/.pytr`).
4. Run `npm run sync` after setup stored your API key. Re-run pytr login when pytr reports an expired session.

Adopting pytr is a **clean break** from the old npm WebSocket client: use a fresh Lunch Money manual account
(or clean up legacy rows yourself). Re-running sync is safe because `external_id` values are stable TR ids
(`trade-republic:{id}`). **Saveback** events sync as a single row tagged `saveback`. During
`npm run setup -- --categories`, choose **Saveback income** or an excluded Investments-style
category (this tool does not pick one silently). Lunch Money UI rules can still refine later.

### Scalable Capital: Scalable CLI (`sc`)

1. Install `sc` per operator machine ([releases](https://github.com/ScalableCapital/scalable-cli/releases);
   macOS: `brew install ScalableCapital/tap/scalable-cli`; Linux: official tarballs require **glibc ≥ 2.38**).
2. In the Scalable web app, enable **Profile → Security → Agentic Investing**.
3. Run `sc login --local-read-only` and complete the browser device-code flow (do not automate login).
4. If needed, run `sc broker portfolios` and either `sc broker context select --portfolio-id <ID>`
   or set `portfolioId` on the matching `scalableCapitalProfiles` entry.
5. Run `npm run sync` after setup. Sessions refresh automatically but expire
   after idle/max lifetime documented in scalable-cli — re-run `sc login` when prompted.

If `sc` is installed outside standard directories, set `scBinaryPath` in config to the absolute path from `which sc`.

Broker credentials and CLI session files stay on the operator's machine only (`SC_CONFIG_DIR` /
default config dir). Never commit them to this repo.

**Upgrading from 0.2.x:** earlier versions inserted only cash summaries (deposits, internal
transfers, …) and never subtracted the ETF purchases paid from that cash, so the Scalable cash account
in Lunch Money grew with every deposit. The next sync inserts the missing buy / sell / savings-plan rows
(each with its stable `scalable-capital:{id}` external id, so re-runs stay idempotent) and they pick
up your `categoryMap` entries for `buy`, `sell` and `savings-plan` — run `npm run setup -- --categories`
first if those are not mapped yet. Use `npm run sync -- --dry-run` to preview them and the cash
reconciliation.

Adopting `sc` is a **clean break** from older experimental proxy workflows: use a fresh Lunch Money
manual account (or clean up legacy rows yourself). Re-running sync on the current path is safe because
`external_id` values are stable broker ids (`scalable-capital:{id}`). Background: [#15](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/15).

## Security model

- **Secrets stay local:** Lunch Money API keys live in the OS keychain (or your shell env for scripts); broker sessions live in pytr/`sc` config dirs.
- **CI is credential-free:** workflows lint, typecheck, test, audit, and scan code — they never call Lunch Money or brokers.
- **CLI sessions stay local:** pytr (`~/.pytr`) and `sc` session files live only on the operator machine; this repo never reads or stores them.
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
  trade-republic/   pytr CLI transport + mapper for Trade Republic timeline events
  scalable-capital/ transport + mapper for the official Scalable CLI (`sc`)
  sync.ts           orchestrator: fetch → map → tag → upsert, per configured profile
```

Each broker module is a **transport** (I/O, injectable for tests) and **mapper** (pure function). `sync.ts` wires live
transports; tests inject fakes.

## Scripts

| Script | Description |
| --- | --- |
| `npm run setup` | Interactive onboarding (API key in keychain, brokers, portfolio/savings accounts, dry-run review) |
| `npm run setup -- --replace-api-key` | Store a new Lunch Money API key in the OS keychain |
| `npm run setup -- --clear-api-key` | Remove the stored Lunch Money API key |
| `npm run sync` | Run a sync (`--dry-run`, `--since`, `--broker`, `--account`, `--reconcile-cash`) |
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

Every module is covered by unit tests using fakes for broker CLI I/O — no test talks to a real broker or Lunch Money.

## Versioning and stability

This project is **pre-1.0.0** (`0.1.0` in [`package.json`](package.json)). Releases stay on **0.x.y** until the
maintainer explicitly promotes **1.0.0** — even when pull requests ship breaking changes (`feat!` or a `BREAKING CHANGE`
footer). Release Please is configured with `bump-minor-pre-major` so those breaking commits advance the **minor** 0.x
version (not jump to 1.0.0). Until `1.0.0`:

- **APIs, config schema, and sync behaviour may change** without a deprecation period.
- **Broker integrations may break** when brokers change unofficial clients or CLI behaviour.
- Release Please collects [Conventional Commits](https://www.conventionalcommits.org/) on `main` into a release pull
  request; merging updates [CHANGELOG.md](CHANGELOG.md), version files, and creates a GitHub Release tag.

## Running locally

Syncs are **manual and opt-in** on your own machine. Trade Republic needs periodic `pytr login`; Scalable needs
periodic `sc login` on each operator laptop. There is no scheduled or GitHub-hosted sync workflow.

After `npm run setup`, run `npm run sync` when you want fresh transactions. You only need to touch `config.json` manually if you are following the [Advanced](#advanced--manual-configuration) path.

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
