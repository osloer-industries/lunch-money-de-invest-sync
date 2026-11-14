# Consuming org reusable workflows

Shared GitHub Actions behavior lives in [osloer-industries/.github](https://github.com/osloer-industries/.github).
This repository keeps **thin caller workflows** under `.github/workflows/` and pins each `uses:` ref to a full
commit SHA with a `# main` comment. The org contract lives in
[consuming-workflows.md](https://github.com/osloer-industries/.github/blob/4ca4cc7336b5b34d02a724e8a7aed245cf1ffae4/docs/consuming-workflows.md)
on that repository.

Do not pass a `reusables-ref` input. Reusables that need their own scripts check out
`osloer-industries/.github` at `job.workflow_sha` (the commit in the `uses:` pin).

## Callers in this repository

| Caller file | Org reusable | Notes |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`workflow-security` job) | `workflow-security.yml` | actionlint + zizmor. Check name: `Workflow security` (often shown as `CI / workflow-security / Workflow security`). |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`quality` job) | `node-npm-quality.yml` | Defaults already match this repo (`npm ci --ignore-scripts`, `npm audit --omit=dev --audit-level=high`, `npm run check`). Check name: `Quality` (often shown as `CI / quality / Quality`). |
| [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) | `codeql-javascript-typescript.yml` | **Private repo today:** SARIF artifact mode (`code-scanning-upload: false`). After going public, consider enabling default upload for GitHub code scanning alerts. Check name: `Analyze JavaScript and TypeScript`. |
| [`.github/workflows/pr-title.yml`](../.github/workflows/pr-title.yml) | `semantic-pull-request.yml` | Accepts the org pin of `amannn/action-semantic-pull-request` (currently v6.1.1). Check name: `Semantic pull request`. |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | `release-please.yml` | Maps required `RELEASE_TOKEN` to `secrets.GITHUB_TOKEN`. No additional secrets. Check name: `Prepare or publish release`. |
| [`.github/workflows/sonar.yml`](../.github/workflows/sonar.yml) | `sonarcloud-zero-issues.yml` | SonarCloud **automatic analysis** supplies scans; CI enforces zero open issues on pull requests via `SONAR_TOKEN`. Do not add a CI Sonar scan (it conflicts with Automatic Analysis). Check name: `SonarCloud zero open issues`. |

Repo-specific jobs that stay inlined:

- CI **Tests (macOS)** and **Tests (TZ=Europe/Berlin)** in [`ci.yml`](../.github/workflows/ci.yml)
- [`.github/workflows/dependency-review.yml`](../.github/workflows/dependency-review.yml) — GHAS-free `dependency-diff-audit.mjs` gate (`Review dependency changes`). Do not replace this with the org `dependency-review.yml` reusable.

This repository does **not** call `node-setup-smoke.yml` (template-only) or `mutation-changed.yml` (no Stryker setup here).

Dependabot `github-actions` updates on `/` bump Action SHAs and org reusable workflow SHAs together (`ci(deps)`).

When adding org reusables as required branch protection checks, use the names from the
[org workflow table](https://github.com/osloer-industries/.github/blob/4ca4cc7336b5b34d02a724e8a7aed245cf1ffae4/docs/consuming-workflows.md#available-reusables).
Reusable jobs nested under `CI` may appear as `CI / <job id> / <job name>`. Confirm the exact required-check string after the first green run before locking rulesets.

## SonarQube Cloud

[`sonar-project.properties`](../sonar-project.properties) defines the SonarCloud project key
`osloer-industries_lunch-money-de-invest-sync`. Analysis runs in SonarCloud via **Automatic Analysis** (no
`SonarSource/sonarqube-scan-action` in CI — a CI scanner conflicts with automatic analysis).

GitHub Actions uses only org **`SONAR_TOKEN`** (repository or organization secret) together with the default
`GITHUB_TOKEN` permissions declared in the workflow. The [`sonar.yml`](../.github/workflows/sonar.yml) caller polls
SonarCloud on each pull request and fails when open issues remain on the PR head commit.
