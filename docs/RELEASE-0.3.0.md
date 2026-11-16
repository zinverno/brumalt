> Historical local draft under the former plugin ID; not a published Brumalt release. See [0.3.3](RELEASE-0.3.3.md).

# Draft release — Casual Memory Games 0.3.0

A quieter window for a short break between notes. Six offline memory and logic games, now in English and Russian, with a daily goal that encourages variety.

- Play-first home, lighter game cards, weekly activity at the bottom and compact back navigation in Progress.
- RU / EN header switch and Automatic language setting. Localized rules, tips, errors, tooltips and reminders; separate local word banks and comparable records.
- Daily goal points: each game earns +2, then +1, then +0. Default 6 points; targets 6 / 9 / 12 or off. Accuracy does not affect participation points and extra play is always available.
- Data migrations keep existing attempts, levels and settings. Legacy daily counts remain labelled earlier activity; no points are guessed from incomplete history.

**Update:** back up and keep `data.json`; replace only installation files and reload the plugin. Old 3-attempt goals become 6 points. Downgrading requires the old data backup as well as the old plugin.

Future release attachments:

- `dist/casual-memory-games-0.3.0.zip`
- `dist/casual-memory-games/main.js`
- `dist/casual-memory-games/manifest.json`
- `dist/casual-memory-games/styles.css`
- `dist/SHA256SUMS`

MIT licence is included in the single installation folder in the ZIP. No publication was performed.

Before publishing, complete native/visual acceptance in a disposable vault, in both languages, as listed in [VALIDATION.md](VALIDATION.md). Native Obsidian and Chromium startup are blocked in this environment before plugin/page load. Real screenshots, mobile verification, theme contrast, font scaling and pixel overflow checks are outstanding; no generated mockups substitute for them.

Other limits: last 1,000 attempts / 365 daily aggregates; pending failed results live only until plugin unload/process exit; multiple concurrent instances are not coordinated. Exercise scores are not an intelligence assessment.
