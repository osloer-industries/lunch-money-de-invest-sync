# Consuming org reusable workflows

Shared GitHub Actions behavior lives in [osloer-industries/.github](https://github.com/osloer-industries/.github).
This repository keeps **thin caller workflows** under `.github/workflows/` and pins each org `uses:` ref to a full
commit SHA with a `# v0.x.y` version comment (never `# main`). The org contract, input defaults, and copy-paste YAML
live in
[consuming-workflows.md](https://github.com/osloer-industries/.github/blob/2359eb885c7c2ef7a2cb966348076392809b0f03/docs/consuming-workflows.md)
on that repository (**v0.1.5**: `2359eb885c7c2ef7a2cb966348076392809b0f03`).

Do not pass a `reusables-ref` input. Reusables that need their own scripts check out
`osloer-industries/.github` at `job.workflow_sha` (the commit in the `uses:` pin).

## Callers in this repository

| Caller file | Org reusable | Notes |
| --- | --- | --- |
| [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) | `workflow-security.yml` | actionlint + zizmor; **job**-level `actions: read` (no workflow-level `actions: read` per Sonar `githubactions:S8264`). |
| same | `node-npm-quality.yml` | Check name **Quality** (`npm run check`, production audit). |
| same | `codeql-javascript-typescript.yml` | Public repo: default Code Scanning upload. Weekly schedule on `CI`. |
| same | `sonarqube-cloud-node.yml` | Check name **Analyze**; `coverage-npm-script: test:coverage`. Skips when `SONAR_TOKEN` is empty (fork/Dependabot). |
| same | `sonarcloud-zero-issues.yml` | PR-only; polls SonarCloud for zero open issues at head SHA. |
| same | `ci-passed.yml` | Aggregate required check; includes repo-specific test and E2E jobs. |
| [`.github/workflows/dependency-review.yml`](../.github/workflows/dependency-review.yml) | `dependency-review.yml` | Default `mode: auto` (GitHub Dependency Review on this public repo). **Job**-level `actions: read`, `pull-requests: read`, and `security-events: write` so cross-repo startup validation passes for the v0.1.5 OSV nested reusable (OSV jobs stay skipped here; GitHub Dependency Review runs). Separate required check, not part of `ci-passed`. |
| [`.github/workflows/pr-title.yml`](../.github/workflows/pr-title.yml) | `semantic-pull-request.yml` | Conventional Commits PR titles. |
| [`.github/workflows/release.yml`](../.github/workflows/release.yml) | `release-please.yml` | Release GitHub App (`vars.OSLOER_RELEASE_APP_ID`, `secrets.RELEASE_APP_PRIVATE_KEY`). |

Repo-specific jobs that stay inlined in `ci.yml`:

- **Tests (macOS)** and **Tests (TZ=Europe/Berlin)** — platform and timezone coverage.
- **E2E terminal** jobs (Linux, macOS, Europe/Berlin TZ) — `node-pty` terminal tests; no org reusable for matrix/OS/TZ.

**Removed** from this repository: standalone `codeql.yml` and `sonar.yml`, inlined Sonar scan in `ci.yml`, vendored
`.github/scripts/dependency-diff-audit.mjs`, and the custom dependency-review steps.

This repository does **not** call `node-setup-smoke.yml` (template-only) or `mutation-changed.yml` (no Stryker setup here).

Dependabot `github-actions` updates on `/` bump Action SHAs and org reusable workflow SHAs (`ci(deps)`). Org reusables
are grouped as `osloer-reusables` (`osloer-industries/.github*`).

Branch protection should require only **`ci-passed`** on the `CI` workflow. Dependency review and semantic PR title are
separate workflows and are not part of `ci-passed`.

## GitHub Actions secrets

CI and release automation use only:

- **`GITHUB_TOKEN`** — default per-workflow permissions (no broker or Lunch Money credentials).
- **`SONAR_TOKEN`** — org secret for SonarCloud analyze and zero-open-issues polling.
- **`RELEASE_APP_PRIVATE_KEY`** — PEM for the osloer-reviewer release GitHub App, with repository variable **`OSLOER_RELEASE_APP_ID`**.

Never store Trade Republic, Scalable Capital, Lunch Money API keys, or operator `config.json` in GitHub Actions.

## SonarQube Cloud

[`sonar-project.properties`](../sonar-project.properties) defines the SonarCloud project key
`osloer-industries_lunch-money-de-invest-sync`, sources/tests, and `sonar.javascript.lcov.reportPaths=coverage/lcov.info`.

This project uses the **CI scanner** (`sonarqube-cloud-node.yml`), not SonarCloud Automatic Analysis alone. Disable
Automatic Analysis for this project in SonarCloud so it does not conflict with the CI upload.

PRs also run `sonarcloud-zero-issues.yml` inside `ci-passed`.