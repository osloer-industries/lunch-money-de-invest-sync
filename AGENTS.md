# Agent Guidelines

These instructions apply to every human or automated contributor. Keep this file
provider-neutral. Do not add duplicate instruction files for specific tools.

## Priorities

1. Preserve correct broker → Lunch Money mapping and idempotent upserts.
2. Keep unofficial broker integrations validated at the boundary with `zod`.
3. Add or update tests for every behavior change.
4. Never commit credentials, tokens, phone numbers, PINs, or local `config.json`.

## Toolchain and commands

- Use the Node.js 24 version declared by `.nvmrc` and `.node-version`.
- Install reproducibly with `npm ci`. Use `npm install --save-exact` when a
  dependency intentionally changes, then commit `package-lock.json`.
- Run `npm run check` before **every push** (`npm run precommit` is identical). This runs
  Oxlint (including Sonar-aligned `require-await` / `no-await-in-loop`), `eslint-plugin-sonarjs`
  recommended rules, TypeScript, coverage, and the production build. A lefthook `pre-commit`
  hook runs the same command via `npm run prepare` — never bypass it with `git commit --no-verify`,
  `HUSKY=0`, `LEFTHOOK=0`, or skip env vars.
- Never suppress lint rules: no `eslint-disable`, `NOSONAR`, new `sonar.exclusions`, or oxlint
  overrides except the existing documented `no-await-in-loop` carve-out for broker pagination/sync.
- Run `npm audit --omit=dev` whenever dependencies or the lockfile change.
- Pin `osloer-industries/.github` reusable workflows by full SHA (`# v0.x.y` comment matching the release tag).
  Dependabot `github-actions` on `/` bumps those refs together with Action SHAs.
- GitHub Actions secrets for this repo are only the default `GITHUB_TOKEN`, org
  `SONAR_TOKEN`, and `RELEASE_APP_PRIVATE_KEY` (with variable `OSLOER_RELEASE_APP_ID` for
  Release Please). Never add broker, Lunch Money, or other financial credentials to CI.

## Architecture

- `src/shared/` holds the canonical transaction model, config loading, and tagging.
- Each broker lives under `src/<broker>/` with transport (I/O) and mapper (pure).
- `src/sync.ts` orchestrates fetch → map → apply category/tag maps → shared-card tag → upsert.
- `categoryMap` and `tagMap` in config map canonical broker types to Lunch Money `category_id`
  and tag names; unknown types always get `needs-review` at sync time.
- Use strict TypeScript, ECMAScript modules, and explicit `.js` extensions for
  relative imports compiled with NodeNext.

## Trade Republic (pytr)

- Transport lives in `src/trade-republic/client.ts` and **must** spawn the operator's
  [pytr](https://github.com/pytr-org/pytr) CLI (`export_transactions` → `all_events.json`),
  never an in-process WebSocket client.
- Validate pytr artifacts with `zod` at the boundary; keep the mapper pure.
- Preserve dedup ids as `trade-republic:{id}` using the TR event id from pytr output.
- Set each transaction **date** to the **UTC calendar day** of the ISO `timestamp`.
- Credentials and sessions are **local-only** under the operator's pytr home (`~/.pytr` by default,
  overridable per profile via `pytrHome`). Operators run `pytr login` locally. Never commit pytr
  session files or operator config with secrets. CI uses fixtures and mocked `PytrCliRunner` only.
- Optional profile fields: `pytrCommand` (argv prefix, e.g. `["pytr"]` or `["uvx", "pytr@0.4.10"]`),
  `pytrHome`, `account`, `pytrMinVersion`. pytr login always uses `--v2` (app approval); do not add WAF or Playwright login paths.
- **Saveback:** emit one Lunch Money row per saveback timeline event (tag `saveback`), not separate
 deposit and buy rows. `npm run setup -- --categories` offers **Saveback income** (`is_income`) or an
 excluded Investments-style category; it does not pick one silently (see issue #16).
- **Clean break:** remove `trade-republic-api`, `phoneNumber`, and `pin` from config with no migration
  shims. Assume a fresh Lunch Money manual account when adopting pytr; `external_id` format
  `trade-republic:{id}` is for idempotent re-sync only.

## Scalable Capital (scalable-cli)

- Transport lives in `src/scalable-capital/client.ts` and **must** call the official `sc`
  binary as a child process (`sc broker transactions --json`), never an HTTP proxy.
- Parse the machine JSON envelope (`ok`, `command`, `data`, `error`) and validate broker
  payloads with `zod`. Do not log stdout that may contain account metadata.
- Map only `BrokerCashTransactionSummary` rows to Lunch Money; preserve dedup ids as
  `scalable-capital:{id}` using the broker transaction id from `sc`.
- Set each transaction **date** to the **UTC calendar day** of `last_event_datetime` (not local
  timezone).
- Credentials and sessions are **local-only**: operators run `sc login` on their own machine
  after enabling Agentic Investing in the Scalable web profile. Never commit `sc` session
  files, tokens, or operator config with secrets. CI uses fixtures and mocked `ScCliRunner`
  only — no live `sc` or broker calls.
- Optional profile fields: `portfolioId`, `scBinaryPath`, `scConfigDir` (`SC_CONFIG_DIR`).
- **Clean break:** the old HTTP proxy integration is removed entirely (no `proxyUrl`,
  no migration shims). Assume operators use a fresh Lunch Money manual account when adopting
  `sc`; `external_id` format `scalable-capital:{id}` is for idempotent re-sync only.

## Tests and security

- Unit tests use fakes for broker CLI and API I/O; no live broker or Lunch Money calls.
- Keep branch, function, line, and statement coverage at or above 80%.
- Do not log API keys, PINs, or full broker payloads in production paths.

## Releases and versioning

- Stay **below 1.0.0** until the maintainer explicitly decides otherwise (`package.json` must remain `0.x.y`).
- `release-please-config.json` must keep `bump-minor-pre-major` and `bump-patch-for-minor-pre-major` on the root package
  so `feat!` / `BREAKING CHANGE` commits do not jump straight from `0.1.0` to `1.0.0`.
- Do not bump the major version to `1` or drop those flags in a drive-by change.

## Pull requests

- Use Conventional Commit prefixes in pull request titles (`feat:`, `fix:`, `chore:`).
- Describe broker or Lunch Money behavior changes and any config schema updates.
