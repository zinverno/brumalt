# Contributing to Brumalt

Keep changes small, offline and accessible. Games need deterministic generation/scoring tests; storage changes need migration, failure and duplicate-save coverage. Avoid new runtime dependencies unless necessary.

Use Node.js 22 or 24 and run `npm ci`, `npm run typecheck`, `npm test`, `npm run lint`, `npm run build`, and `npm run verify-package` before a pull request. Native checks belong in a disposable vault with synthetic notes. Distinguish DOM tests from actual Obsidian/mobile testing.

Never commit a real vault, user `data.json`, credentials, `.env`, caches or private screenshots. Test fixtures are synthetic. Preserve the approved cover bytes; do not redraw it.

Main is release-bearing: after checks, a push publishes a new prerelease for the manifest version, with separate install files and ZIP. Published versions are immutable. Review version changes and release notes before merging. No Community Directory submission is automated.
