# Scriptable CLI (`--json`, `--events`, `--non-interactive`)

Tool layer for assistants ([#83](https://github.com/osloer-industries/lunch-money-de-invest-sync/issues/83)).
Credentials never appear in JSON, NDJSON events, or logs.

## Shared flags

| Flag | Effect |
| --- | --- |
| `--json` | Write a single JSON object to **stdout** (machine-readable result). Human progress lines are omitted where `--json` is supported. |
| `--events` | Stream **NDJSON** broker-login events on **stderr** (one JSON object per line). Terminal messages and macOS notifications stay unchanged. |
| `--non-interactive` | Refuse interactive prompts; combine with command-specific flags (see below). |

If stdin is not a TTY and a command would prompt, the CLI exits with a clear error unless `--non-interactive` or `--json` is allowed for that command.

## `npm run doctor`

```bash
npm run doctor -- --json
```

Stdout schema:

```json
{
  "ok": true,
  "checks": [
    { "name": "node", "ok": true, "detail": "Node.js v24.0.0" }
  ]
}
```

## `npm run setup`

Scripted setup already uses `--non-interactive`. With `--json`, completion prints a summary (no API key, no broker secrets):

```json
{
  "ok": true,
  "mode": "non-interactive",
  "configPath": "/path/to/config.json",
  "tradeRepublicProfileCount": 1,
  "scalableCapitalProfileCount": 0,
  "sharedCardLast4": []
}
```

`npm run setup -- --categories` remains interactive only; use `npm run categories -- apply` instead.

## `npm run categories`

### List mapping

```bash
npm run categories -- list --json
```

### List Lunch Money categories and tags

```bash
npm run categories -- list-lunch-money --json
```

### Apply mapping (idempotent)

```bash
npm run categories -- apply --non-interactive --from mapping.json
npm run categories -- apply --non-interactive --map deposit=123 --tag deposit=bank,savings
```

`mapping.json`:

```json
{
  "categoryMap": { "deposit": 123, "buy": 456 },
  "tagMap": { "saveback": ["saveback"] }
}
```

Apply stdout:

```json
{
  "command": "apply",
  "changed": true,
  "categoryMap": { },
  "tagMap": { }
}
```

## `npm run sync`

```bash
npm run sync -- --dry-run --json
npm run sync -- --events --broker trade-republic
```

Sync stdout (`--json`):

```json
{
  "ok": true,
  "accounts": [
    {
      "owner": "operator-a",
      "source": "trade-republic",
      "lunchMoneyAssetId": 42,
      "firstSyncForAccount": true,
      "existingBrokerExternalIds": 0,
      "dryRun": true,
      "wouldInsert": 12,
      "wouldSkip": 0,
      "dryRunSummary": null
    }
  ]
}
```

`firstSyncForAccount` is `true` when the Lunch Money manual account has no rows whose `external_id` starts with `trade-republic:` or `scalable-capital:` yet. Re-syncs skip existing `external_id`s, so classification should be correct before the first non-dry-run sync.

**HOOK(#84):** `dryRunSummary` is reserved for the structured dry-run preview module; it stays `null` until that PR lands.

## Broker login NDJSON events (`--events`)

Each stderr line is a JSON envelope:

```json
{
  "event": "broker_login",
  "at": "2026-11-14T15:00:00.000Z",
  "data": {
    "kind": "broker_login",
    "broker": "trade-republic",
    "phase": "waiting_for_app_approval"
  }
}
```

### Trade Republic phases

| `phase` | Notes |
| --- | --- |
| `waiting_for_app_approval` | Initial app-approval prompt (terminal + macOS notification unchanged). |
| `approval_countdown` | Optional `seconds_left` integer. |
| `approved` | Session ready. |
| `rejected` | Login failed after waiting. |
| `timed_out` | Approval window expired. |

### Scalable Capital phases

| `phase` | Notes |
| --- | --- |
| `session_needed` | No `sc` session for API calls. |
| `login_required` | Operator should run `sc login` locally. |
| `session_active` | Session verified. |