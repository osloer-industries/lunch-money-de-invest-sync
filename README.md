# lunch-money-de-invest-sync

Syncs German investment/broker accounts into [Lunch Money](https://lunchmoney.app), starting
with **Trade Republic** and **Scalable Capital**. Built to cover a household with two people's
accounts feeding into one Lunch Money instance, with shared-card spend auto-tagged so it's easy
to split later.

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
   person per broker — e.g. "Trade Republic (You)", "Trade Republic (Wife)", "Scalable Capital
   (You)"), and note each one's numeric account id.
4. Copy `config.example.json` to `config.json` and fill in:
   - `sharedCardLast4`: last 4 digits of any card you share expenses on. Transactions whose
     payee/notes mention one of these get tagged `shared` in Lunch Money — check this actually
     matches your real transaction text (see note in `src/shared/tagging.ts`) and adjust the
     matcher if your bank formats it differently.
   - `tradeRepublicProfiles`: one entry per person, with their phone number, PIN, and the
     Lunch Money manual account id to sync into.
   - `scalableCapitalProfiles`: one entry per person, pointing at their running proxy instance
     (see below) and their Lunch Money manual account id.
5. `LUNCH_MONEY_API_KEY=... npm run sync`

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

## Running locally

Syncs are **manual and opt-in** on your own machine. Trade Republic and Scalable Capital both
need interactive logins (SMS code and browser 2FA respectively), so there is no scheduled or
GitHub-hosted sync workflow — nothing in this repo stores broker or Lunch Money credentials.

Keep `config.json` on disk only (copy from `config.example.json`; it is gitignored). Set
`LUNCH_MONEY_API_KEY` in your shell or a local `.env` file (also gitignored), then run
`npm run sync` when you want to pull fresh transactions. Point each Scalable Capital profile's
`proxyUrl` at a proxy you run locally (see **Scalable Capital: running the proxy** above).

CI (`.github/workflows/ci.yml`) calls the org **workflow-security** reusable (actionlint + zizmor)
and runs **Quality** (`npm run lint`, `npm run typecheck`, `npm run test:coverage`, `npm run build`)
on pushes and pull requests. **CodeQL** (`.github/workflows/codeql.yml`) uses the org JavaScript/TypeScript
reusable in SARIF artifact mode (`code-scanning-upload: false`; private repo, no GHAS). Reusable refs
are pinned by full SHA; Dependabot `github-actions` bumps them under `ci(deps)`. It does not run
`npm run sync` and requires no repository secrets for broker or Lunch Money access.
