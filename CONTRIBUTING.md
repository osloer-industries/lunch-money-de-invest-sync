# Contributing

1. Install Node.js 24.22.0 (see `.nvmrc`).
2. Run `npm ci`.
3. Create a focused branch and add tests with the change.
4. Run `npm run check` (or `npm run precommit` — same gate as CI and the lefthook hook) and `npm audit --omit=dev`.
5. Open a pull request using the provided template and a Conventional Commit title.

Coverage must remain at least 80% for branches, functions, lines, and statements. Keep dependencies exact and commit lockfile changes. Never commit secrets or generated output.

Scalable Capital tests must use sanitized JSON fixtures under `src/scalable-capital/fixtures/` and a mocked `ScCliRunner` — never real broker sessions or personal account data.

Use Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`. Release Please
treats `feat:` as a minor release and `fix:` as a patch release on the current major version. Breaking changes use a
`BREAKING CHANGE:` footer or `!` marker.

The project remains **pre-1.0.0** until the maintainer deliberately ships **1.0.0**. While `package.json` is still
`0.x.y`, `release-please-config.json` sets `bump-minor-pre-major` and `bump-patch-for-minor-pre-major` so breaking
commits bump the **0.x** minor/patch series instead of leaping to `1.0.0`. Do not remove those flags or change the
major version to `1` without an explicit maintainer decision.

Pull request titles are validated automatically. Squash merging uses the validated title as the commit subject on `main`, giving Release Please one reliable Conventional Commit per pull request. Dependabot uses `chore(deps):` for npm updates and `ci(deps):` for GitHub Actions updates.

## Continuous integration

`npm run check` mirrors the CI **Quality** job. GitHub also runs:

- Org **workflow-security** (actionlint + zizmor) via a reusable workflow
- **CodeQL** analysis (JavaScript/TypeScript)
- **Dependency review** on pull requests (blocks new high-severity production advisories)
- **Semantic pull request title** validation

See [docs/consuming-org-reusables.md](docs/consuming-org-reusables.md) for pinned org workflow refs and check names for branch protection.

## Support

Questions and bug reports: [SUPPORT.md](SUPPORT.md). Security: [SECURITY.md](SECURITY.md) only — never file credentials in a public issue.
