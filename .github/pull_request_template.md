## Summary

Describe the change and why it is needed.

Use a Conventional Commit title, for example `feat: add JSON output` or `fix(cli): handle empty input`. The squash-merge commit uses this title so Release Please can calculate the version and changelog.

## Verification

- [ ] `npm run check` (and pre-commit hook) run locally before push
- [ ] Documentation updated if behavior changed
- [ ] No secrets, credentials, or generated files committed
- [ ] Conflicts resolved by merging `main` (no rebase / force-push)

## Related issue

Closes #
