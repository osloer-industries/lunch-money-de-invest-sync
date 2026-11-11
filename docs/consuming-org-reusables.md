# Consuming org reusable workflows

Shared GitHub Actions behavior lives in [osloer-industries/.github](https://github.com/osloer-industries/.github).
This repository keeps **thin caller workflows** under `.github/workflows/` and pins each `uses:` ref to a full
commit SHA. The org contract lives in
[consuming-workflows.md](https://github.com/osloer-industries/.github/blob/d4865a4b2c70c8433188f5200beac104b1c7fe86/docs/consuming-workflows.md)
on that repository.

## Callers in this repository

| Caller file | Org reusable | Notes |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) (`workflow-security` job) | `workflow-security.yml` | actionlint + zizmor |
| [`.github/workflows/codeql.yml`](../.github/workflows/codeql.yml) | `codeql-javascript-typescript.yml` | **Private repo today:** SARIF artifact mode (`code-scanning-upload: false`). After going public, consider enabling default upload for GitHub code scanning alerts. |

Repo-specific jobs that stay inlined: CI **Quality** (lint, typecheck, coverage, build, `npm audit`), dependency review,
pull request title validation, and Release Please.

Dependabot `github-actions` updates on `/` bump Action SHAs and org reusable workflow SHAs together (`ci(deps)`).

When adding org reusables as required branch protection checks, use the names from the
[org workflow table](https://github.com/osloer-industries/.github/blob/d4865a4b2c70c8433188f5200beac104b1c7fe86/docs/consuming-workflows.md#available-reusables).
For `workflow-security` on `CI`, the check is typically `CI / workflow-security / Workflow security`.
For CodeQL, the reusable job name is `Analyze JavaScript and TypeScript`.

## SonarQube Cloud (not wired in CI yet)

[`sonar-project.properties`](../sonar-project.properties) defines a SonarCloud project key, but this repository does
**not** run `SonarSource/sonarqube-scan-action` in CI yet. Do not treat SonarCloud badges or quality gates as active
until a workflow and `SONAR_TOKEN` secret are added (see org [Sonar setup guidance](https://github.com/osloer-industries/typescript-node-template/blob/main/docs/sonar-quality-gate.md) in the template repo).
