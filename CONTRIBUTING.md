# Contributing

1. Install Node.js 24.22.0 (see `.nvmrc`).
2. Run `npm ci`.
3. Create a focused branch and add tests with the change.
4. Run `npm run check` and `npm audit --omit=dev`.
5. Open a pull request using the provided template and a Conventional Commit title.

Coverage must remain at least 80% for branches, functions, lines, and statements. Keep dependencies exact and commit lockfile changes. Never commit secrets or generated output.

Use Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `test:`, `refactor:`, and `chore:`. Release Please treats `feat:` as a minor release and `fix:` as a patch release. Use a `BREAKING CHANGE:` footer or `!` marker for a major release.

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
