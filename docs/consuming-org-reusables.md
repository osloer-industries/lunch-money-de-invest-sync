# Consuming org reusable workflows

Shared GitHub Actions behavior lives in [osloer-industries/.github](https://github.com/osloer-industries/.github).
This repository keeps **thin caller workflows** under `.github/workflows/` and pins each `uses:` ref to a full
commit SHA. The org contract lives in
[consuming-workflows.md](https://github.com/osloer-industries/.github/blob/65dc7ba5e001dc552cada5a8d2aa88be7f425638/docs/consuming-workflows.md)
on that repository.

## Callers in this repository

| Caller file | Org reusable | Notes |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`workflow-security` job) | `workflow-security.yml` | actionlint + zizmor |
| [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) | `codeql-javascript-typescript.yml` | **Private repo today:** SARIF artifact mode (`code-scanning-upload: false`). After going public, consider enabling default upload for GitHub code scanning alerts. |
| [`.github/workflows/sonar.yml`](../.github/workflows/sonar.yml) | `sonarcloud-zero-issues.yml` | SonarCloud **automatic analysis** supplies scans; CI enforces zero open issues on pull requests via `SONAR_TOKEN`. |

Repo-specific jobs that stay inlined: CI **Quality** (lint, typecheck, coverage, build, `npm audit`), dependency review,
pull request title validation, and Release Please.

Dependabot `github-actions` updates on `/` bump Action SHAs and org reusable workflow SHAs together (`ci(deps)`).

When adding org reusables as required branch protection checks, use the names from the
[org workflow table](https://github.com/osloer-industries/.github/blob/65dc7ba5e001dc552cada5a8d2aa88be7f425638/docs/consuming-workflows.md#available-reusables).
For `workflow-security` on `CI`, the check is typically `CI / workflow-security / Workflow security`.
For CodeQL, the reusable job name is `Analyze JavaScript and TypeScript`.
For SonarCloud, the reusable job name is `SonarCloud zero open issues`.

## SonarQube Cloud

[`sonar-project.properties`](../sonar-project.properties) defines the SonarCloud project key
`osloer-industries_lunch-money-de-invest-sync`. Analysis runs in SonarCloud via **Automatic Analysis** (no
`SonarSource/sonarqube-scan-action` in CI — a CI scanner conflicts with automatic analysis).

GitHub Actions uses only org **`SONAR_TOKEN`** (repository or organization secret) together with the default
`GITHUB_TOKEN` permissions declared in the workflow. The [`sonar.yml`](../.github/workflows/sonar.yml) caller polls
SonarCloud on each pull request and fails when open issues remain on the PR head commit.