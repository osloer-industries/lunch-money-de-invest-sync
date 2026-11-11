# lunch-money-de-invest-sync

Syncs German investment/broker accounts into [Lunch Money](https://lunchmoney.app), starting
with **Trade Republic** and **Scalable Capital**. Built for two operators' accounts feeding into
one Lunch Money instance, with shared-card spend auto-tagged so it's easy to split later.

## How it's put together

```
src/
  shared/          canonical Transaction type, config loading, shared-card tagging
  lunch-money/     thin wrapper around the official Lunch Money v2 API client
  trade-republic/  transport + mapper for Trade Republic's timeline
  scalable-capital/ transport + mapper for the Scalable Capital local proxy
  sync.ts          orchestrator: fetch -> map -> tag -> upsert, per configured profile
```

Each broker module is a self-contained pair of **transport** (I/O, injectable for tests) and
**mapper** (pure function, broker's raw shape -> `CanonicalTransaction`). `sync.ts` wires the
real transports together; tests inject fakes instead.

## Why these specific dependencies

- **Lunch Money**: [`@lunch-money/lunch-money-js-v2`](https://github.com/lunch-money/lunch-money-js-v2),
  the official TypeScript client for Lunch Money's (alpha) v2 API. Transaction dedup is handled
  server-side: inserting a transaction with the same `(manual_account_id, external_id)` pair
  twice is a no-op, so re-running a sync is always safe.
- **Trade Republic**: [`trade-republic-api`](https://www.npmjs.com/package/trade-republic-api)
  (community, unofficial). It authenticates over Trade Republic's WebSocket API and exposes a
  `timeline` topic with cash-relevant events (card spend, transfers, interest, savings-plan
  executions, ...).
- **Scalable Capital**: no maintained npm client exists. Instead this talks REST to
  [`ffischbach/unofficial-scalable-capital-api`](https://github.com/ffischbach/unofficial-scalable-capital-api),
  a local proxy you run yourself that handles the interactive browser login + 2FA once and then
  serves `GET /transactions` over `http://127.0.0.1:3141`.

Both broker integrations are unofficial and reverse-engineered — Trade Republic and Scalable
Capital don't publish these APIs and can change them without notice. Response shapes are
validated with `zod` at the boundary (see `types.ts` in each module) so a drifted field fails
loudly with a clear error instead of silently inserting wrong amounts into Lunch Money.

## Setup

1. `npm ci`
2. Get a Lunch Money API key from **Settings → Developers** in the Lunch Money app.
3. Create a **manual account** in Lunch Money per brokerage account you want synced (one per
   operator per broker — e.g. "Trade Republic (operator A)", "Trade Republic (operator B)",
   "Scalable Capital (operator A)"), and note each one's numeric account id.
4. Copy `config.example.json` to `config.json` and fill in **only the brokerage accounts this
   machine syncs** (see **Second operator setup** below when two people share one Lunch Money
   budget from different laptops):
   - `sharedCardLast4`: last 4 digits of any card you share expenses on. Transactions whose
     payee/notes mention one of these get tagged `shared` in Lunch Money — check this actually
     matches your real transaction text (see note in `src/shared/tagging.ts`) and adjust the
     matcher if your bank formats it differently.
   - `tradeRepublicProfiles`: one entry per Trade Republic account on **this machine**, with
     phone number, PIN, and the Lunch Money manual account id to sync into.
   - `scalableCapitalProfiles`: one entry per Scalable account on **this machine**, pointing at
     a local proxy (see below) and the matching Lunch Money manual account id.
5. Run a dry-run first, then sync for real:
   - `npm run sync:dry-run` — fetches broker data and prints what would be upserted (no Lunch
     Money writes; API key optional).
   - `LUNCH_MONEY_API_KEY=... npm run sync` — upserts into Lunch Money for the profiles in
     **your** `config.json` only.

`config.json` and `.env` are gitignored — they carry phone numbers and account ids, not just
secrets, so don't commit them even though the PIN/API key are the only strictly sensitive bits.

### Trade Republic: running the sync

`trade-republic-api`'s `login()` blocks on a CLI prompt for the SMS 2FA code sent to your phone
— there's no persisted session, so **this only works as an interactive run**, once per person,
each time you sync. If you want unattended/cron sync instead, you need a client that supports
Trade Republic's device-pairing flow (a private key generated once via SMS, then reused without
further 2FA) — the Python [`pytr`](https://github.com/nborrmann/pytr) project supports this;
none of the TypeScript clients on npm currently do. Swap the `TradeRepublicTransport` in
`src/trade-republic/client.ts` for one that shells out to `pytr` (or a TS port of its
device-pairing protocol) if you need that.

### Scalable Capital: running the proxy

1. Clone and run [`unofficial-scalable-capital-api`](https://github.com/ffischbach/unofficial-scalable-capital-api)
   per person (different port per person, e.g. `3141` / `3142`), following its own setup —
   this opens a real browser window for you to log in and complete 2FA interactively.
2. Point each `scalableCapitalProfiles` entry's `proxyUrl` at the matching instance. If you ran
   the proxy with `--token`, set `proxyToken` too.
3. The proxy's session lasts ~8 hours before you need to log in again, so this is closer to
   cron-friendly than Trade Republic, as long as something re-runs the login periodically.

## Development

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # oxlint
npm test            # vitest run
npm run test:watch  # vitest, watch mode
npm run check       # lint, typecheck, coverage, and build (CI parity)
```

Every module is covered by unit tests using fakes/stubs for network and WebSocket I/O — no
test talks to a real broker or to Lunch Money.

## Extending

- **More cash-movement types**: `src/trade-republic/mapper.ts` treats any nonzero
  `cashChangeAmount` as spend-worthy (there's no documented `eventType` enum to filter on).
  `src/scalable-capital/mapper.ts` only maps `BrokerCashTransaction` entries, deliberately
  excluding security trades — extend `CASH_TRANSACTION_TYPE` handling there if you also want
  buy/sell activity to show up in Lunch Money.
- **More brokers**: add a `src/<broker>/{types,client,mapper}.ts` following the existing
  modules' shape, then wire a `collect<Broker>` function into `liveCollectors` in `src/sync.ts`.

## Second operator setup (shared Lunch Money budget, separate laptop)

The **primary operator** and **second operator** share **one** Lunch Money budget, but each runs
this repo **locally** on their own machine with **their own** gitignored `config.json`. A sync
only touches the manual accounts listed in that file — it never resets or overwrites other Lunch
Money accounts.

**Prerequisites:** Node.js 24 (see `.nvmrc`), git, npm, and read access to this repository (the
primary operator or a repo admin must add the second operator as a GitHub collaborator if the
repo is private).

1. **Clone and install**
   ```bash
   git clone https://github.com/osloer-industries/lunch-money-de-invest-sync.git
   cd lunch-money-de-invest-sync
   npm ci
   ```
2. **Lunch Money manual accounts** — In the shared budget, create one manual account per
   brokerage account the second operator syncs (e.g. "Trade Republic (operator B)", "Scalable
   (operator B)"). Note each numeric account id.
3. **Their own API token** — In Lunch Money: **Settings → Developers**. Each budget member can
   mint their own developer token for the shared budget. The second operator should **not** copy
   the primary operator's token; either token can write to the same budget, and transactions
   dedupe on `(manual_account_id, external_id)` so the two laptops do not clobber each other.
4. **Local config (placeholders only in git)** — Copy the committed example for a second machine:
   ```bash
   cp config.example.second-operator.json config.json
   ```
   Edit `config.json` locally: set `lunchMoneyAssetId` for each profile, their broker
   credentials, and `sharedCardLast4` if they use a shared card. List **every account they sync**
   (for example two profiles for two brokers). Do not commit `config.json`.
5. **Secrets only on disk** — Put `LUNCH_MONEY_API_KEY` in the shell or a local `.env` (from
   `.env.example`). Never commit tokens, PINs, or phone numbers.
6. **Dry-run, then confirm, then sync**
   ```bash
   npm run sync:dry-run
   ```
   Review the `[dry-run]` lines (per profile: transaction count, dates, Lunch Money manual
   account id). When output looks right:
   ```bash
   export LUNCH_MONEY_API_KEY='their-token'
   npm run sync
   ```
   Re-running `npm run sync` is safe: duplicates are skipped server-side.

If the second operator uses **Claude Code** (or another local coding agent), follow the
step-by-step runbook in **AGENTS.md → Second operator setup runbook** — same flow, with explicit
guardrails around secrets and user confirmation before a real sync.

## Running locally

Syncs are **manual and opt-in** on your own machine. Trade Republic and Scalable Capital both
need interactive logins (SMS code and browser 2FA respectively), so there is no scheduled or
GitHub-hosted sync workflow — nothing in this repo stores broker or Lunch Money credentials.

Keep `config.json` on disk only (copy from `config.example.json` or
`config.example.second-operator.json`; both are safe templates, and `config.json` is gitignored).
Set `LUNCH_MONEY_API_KEY` in your shell or a local `.env` file (also gitignored). Run
`npm run sync:dry-run` before the first real sync, then `npm run sync` when you want to pull
fresh transactions. Point each Scalable Capital profile's `proxyUrl` at a proxy you run locally
(see **Scalable Capital: running the proxy** above).

CI (`.github/workflows/ci.yml`) runs `npm run lint`, `npm run typecheck`, `npm run test:coverage`,
and `npm run build` on pushes and pull requests. It does not run `npm run sync` and requires no
repository secrets for broker or Lunch Money access.
