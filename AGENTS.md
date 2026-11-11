# Agent Guidelines

These instructions apply to every human or automated contributor. Keep this file
provider-neutral. Do not add duplicate instruction files for specific tools.

## Priorities

1. Preserve correct broker → Lunch Money mapping and idempotent upserts.
2. Keep unofficial broker integrations validated at the boundary with `zod`.
3. Add or update tests for every behavior change.
4. Never commit credentials, tokens, phone numbers, PINs, or local `config.json`.

## Multi-operator safety

- Each laptop has its own gitignored `config.json` listing **only** that operator's brokerage
  profiles and their `lunchMoneyAssetId` values.
- `runSync` iterates configured profiles only; it never lists, deletes, or rewrites transactions
  in Lunch Money accounts that are not in the local config.
- Lunch Money deduplicates on `(manual_account_id, external_id)`; independent runs by two
  operators into the same shared budget are idempotent and do not duplicate each other's rows
  when each operator maps to distinct manual accounts.

## Toolchain and commands

- Use the Node.js 24 version declared by `.nvmrc` and `.node-version`.
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

---

## Second operator setup runbook (local coding agent)

Use this when helping a **second operator** run sync on **their own laptop** against a **shared**
Lunch Money budget the **primary operator** already uses. Execute steps in order. Stop and ask the
human for input when a step says **ASK THE OPERATOR**.

### Guardrails (non-negotiable)

1. **Never** commit, push, or open a PR that contains `config.json`, `.env`, API keys, PINs, phone
   numbers, or proxy tokens.
2. **Never** print, echo, or log secrets after the operator provides them (no `cat config.json` in
   shared transcripts if it contains real credentials; avoid repeating values back).
3. **Never** write secrets into tracked files. Use `config.json` (gitignored) and `.env`
   (gitignored) only.
4. **Never** run `npm run sync` (real upsert) until the operator explicitly confirms after
   reviewing dry-run output.
5. Do **not** add repository secrets, CI sync jobs, or cloud credentials.

### Step 0 — Repository access

If `git clone` fails with permission denied, tell the operator the **primary operator** (or a repo
admin) must add their GitHub user as a collaborator (read access is enough). Do not change repository
settings from this agent.

### Step 1 — Verify Node.js 24

```bash
node -v
```

Require `v24.x`. If wrong, install Node 24 per `.nvmrc` / `.node-version` (e.g. `nvm install` and
`nvm use` in the project directory).

### Step 2 — Install dependencies

From the repo root:

```bash
npm ci
```

If `npm ci` fails with an engine error, fix Node version first (Step 1).

### Step 3 — Lunch Money manual accounts (human task)

**ASK THE OPERATOR** to confirm they created one Lunch Money **manual account** per brokerage
account they will sync, in the **shared** budget, and to note each numeric `lunchMoneyAssetId`
(the primary operator may have created these; ids must match what they put in `config.json`).

### Step 4 — Create local config from the example

```bash
cp config.example.second-operator.json config.json
```

Edit `config.json` interactively with the operator:

- Set each profile's `lunchMoneyAssetId` to their manual account ids.
- Set `tradeRepublicProfiles` / `scalableCapitalProfiles` to **only their accounts** (multiple
  profiles are allowed — one per broker account).
- Adjust `sharedCardLast4` if they use a shared card for tagging.

Do not commit `config.json`.

### Step 5 — Broker credentials (human task, local file only)

**ASK THE OPERATOR** to enter Trade Republic phone/PIN and Scalable proxy URL/token directly into
`config.json` (or guide them to edit the file themselves). Do not paste those values into chat logs
if avoidable.

For Scalable Capital, confirm the local proxy is running on their machine before sync
(see README **Scalable Capital: running the proxy**).

### Step 6 — Lunch Money API token (human task, environment only)

**ASK THE OPERATOR** to create **their own** developer token in Lunch Money (**Settings →
Developers**). They should not reuse the primary operator's token.

Write it only to a local `.env` (copy from `.env.example`) or export in the shell:

```bash
cp .env.example .env
```

**ASK THE OPERATOR** to paste the token into `.env` herself, or use a secrets prompt that does not
echo. Do not commit `.env`.

### Step 7 — Dry-run (no Lunch Money writes)

Dry-run does **not** require `LUNCH_MONEY_API_KEY` (broker fetch still needs interactive broker
login where applicable):

```bash
npm run sync:dry-run
```

Show the operator the `[dry-run]` summary lines: profile name, Lunch Money manual account id,
transaction counts, date range, and `external_id` preview.

If a profile shows `0 transaction(s)`, explain that may be normal for an empty account or a
failed broker login — investigate before a real sync.

### Step 8 — Confirm before real sync

**ASK THE OPERATOR** explicitly: "Do the dry-run lines look correct for your accounts and Lunch
Money manual account ids?"

Proceed only after **yes**.

### Step 9 — Real sync

Ensure `LUNCH_MONEY_API_KEY` is set (from `.env` or the environment), then:

```bash
npm run sync
```

Report per-profile log lines (`inserted N, skipped M duplicate(s)`). Explain that re-running is
safe and only affects manual accounts in their `config.json`.

### Step 10 — Ongoing use

- Each operator keeps their own `config.json`; edits on one laptop do not affect the other.
- Prefer `npm run sync:dry-run` after config changes, then `npm run sync` after confirmation.
- Never run sync in CI or from shared cloud agents with real credentials.

### Troubleshooting

| Symptom | Action |
|--------|--------|
| `LUNCH_MONEY_API_KEY is not set` on real sync | Set token in `.env` or shell; dry-run does not need it |
| Trade Republic hangs | SMS 2FA — operator must enter code in the terminal (interactive) |
| Scalable fetch fails | Start local proxy; check `proxyUrl` / `proxyToken` |
| Wrong Lunch Money account | Fix `lunchMoneyAssetId` in `config.json`, dry-run again |

### Product note for maintainers

Open naming for manual accounts in Lunch Money (display names) is an operator preference, not
enforced by this repo. Each profile's `owner` field is a local label for logs only.
