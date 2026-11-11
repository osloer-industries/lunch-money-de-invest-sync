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
- Run `npm run check` before submitting a change. This runs Oxlint, the
  TypeScript compiler, coverage, and the production build.
- Run `npm audit --omit=dev` whenever dependencies or the lockfile change.
- Pin `osloer-industries/.github` reusable workflows by full SHA (`# main` comment).
  Dependabot `github-actions` on `/` bumps those refs together with Action SHAs.

## Architecture

- `src/shared/` holds the canonical transaction model, config loading, and tagging.
- Each broker lives under `src/<broker>/` with transport (I/O) and mapper (pure).
- `src/sync.ts` orchestrates fetch → map → tag → upsert per configured profile.
- Use strict TypeScript, ECMAScript modules, and explicit `.js` extensions for
  relative imports compiled with NodeNext.

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

- Unit tests use fakes for network and WebSocket I/O; no live broker or Lunch Money calls.
- Keep branch, function, line, and statement coverage at or above 80%.
- Do not log API keys, PINs, or full broker payloads in production paths.

## Pull requests

- Use Conventional Commit prefixes in pull request titles (`feat:`, `fix:`, `chore:`).
- Describe broker or Lunch Money behavior changes and any config schema updates.
