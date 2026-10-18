# Agent Guidelines

These instructions apply to every human or automated contributor. Keep this file
provider-neutral. Do not add duplicate instruction files for specific tools.

## Priorities

1. Preserve correct broker → Lunch Money mapping and idempotent upserts.
2. Keep unofficial broker integrations validated at the boundary with `zod`.
3. Add or update tests for every behavior change.
4. Never commit credentials, tokens, phone numbers, PINs, or local `config.json`.

## Toolchain and commands

- Use the Node.js 22 version declared by `.nvmrc` and `.node-version`.
- Install reproducibly with `npm ci`. Use `npm install --save-exact` when a
  dependency intentionally changes, then commit `package-lock.json`.
- Run `npm run check` before submitting a change. This runs Oxlint, the
  TypeScript compiler, coverage, and the production build.
- Run `npm audit --omit=dev` whenever dependencies or the lockfile change.

## Architecture

- `src/shared/` holds the canonical transaction model, config loading, and tagging.
- Each broker lives under `src/<broker>/` with transport (I/O) and mapper (pure).
- `src/sync.ts` orchestrates fetch → map → tag → upsert per configured profile.
- Use strict TypeScript, ECMAScript modules, and explicit `.js` extensions for
  relative imports compiled with NodeNext.

## Tests and security

- Unit tests use fakes for network and WebSocket I/O; no live broker or Lunch Money calls.
- Keep branch, function, line, and statement coverage at or above 80%.
- Do not log API keys, PINs, or full broker payloads in production paths.

## Pull requests

- Use Conventional Commit prefixes in pull request titles (`feat:`, `fix:`, `chore:`).
- Describe broker or Lunch Money behavior changes and any config schema updates.
