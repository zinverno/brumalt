# Validation — Brumalt 0.3.3

Date: 2026-11-16. Automated, native and hosted CI evidence are distinct.

## Local checks

Environment: Node 24.14.1, npm 11.11.0, TypeScript 5.9.3, Obsidian declarations 1.13.1. No dependency versions changed.

- `npm ci` was executed but the local sandbox rejected esbuild's synchronous postinstall version-check child process (`spawnSync ... EPERM`, despite binary output 0.28.2). It is **not counted as a successful clean install here**. `npm ci --ignore-scripts --offline --no-audit --no-fund` then restored the exact lockfile packages from cache. Full `npm ci` remains required in hosted CI on Node 22 and 24.
- `npm run typecheck`: passed.
- `npm test`: **115 passed, 0 failed**. The existing suite is retained; close-control assertions now follow the requested native-close model.
- `npm run build`: passed. `npm run verify-package`: passed, checking metadata, exactly four ZIP entries, byte equality and SHA-256.
- CSS syntax check passed. It does not establish visual quality.
- Reproducible production build/package hashes checked; previous local archives retained.

| Test file | Tests | Coverage |
| --- | ---: | --- |
| beta | 15 | Independent oracles over 4,000 seeded Rule and 4,000 Order tasks, adaptive limits, mixed plans, dates/time zones, retention, reminders |
| branding | 9 | Schema 1–4 import, existing-file precedence, corrupt/empty data, restart/deduplication, read/write/partial failure recovery, destination race, branding and exact cover hash |
| logic | 15 | Generation, scoring, adaptation, sessions, serial storage and comparisons |
| navigation | 5 | Five states, profile stability/bounds/comparability and schema-4 round trip |
| numbers | 2 | Leading zeros, attempt lifecycle, one save, cancellation |
| polish | 9 | RU/EN dictionaries/plurals/fallback, 2/1/0 points, atomic saves, migrations and mode names |
| UI | 47 | All six games in RU/EN, singleton, Back/exit/cleanup, delayed writes and retries, durations, settings-only language, daily points, radar, reminders and first-run import |
| update | 13 | Reachable Words adaptation at every level, old data migration, early/timer comparisons, manual adaptive starting level |

## Native close correction

The previous hide-native CSS strategy is removed. Brumalt renders **no custom close icon** and does not hide Obsidian's native control. Back remains independent. A small top inset leaves room for host chrome. `Modal.close()` still routes native close, Escape and backdrop to the same unfinished-attempt Cancel / Stay path; unload forcibly disposes resources.

The realistic test fixture includes native close/backdrop under `containerEl`, outside `modalEl`. Tests also move the native control inside the panel and check all five states. Native close stays visible in the contract DOM, no custom X is rendered, active close pauses and asks before cancellation, Escape stays, backdrop closes or asks as appropriate, and unrelated Modals retain their controls. Completed saves remain recoverable after closure.

The user reported that retaining native close and hiding the duplicate works in **Obsidian 1.15.1**. This is user-supplied hotfix evidence, **not our native acceptance of the entire 0.3.3 build**. jsdom does not prove native rendering.

## Data safety

`loadWithLegacy` uses public `DataAdapter.exists/read`, plugin `loadData/saveData`, and `vault.configDir`. Import runs before interactive setup, games or reminders. It only creates a new Brumalt data file when that file is absent and the old file validates. It rechecks destination existence after source validation, then checks the saved data round trip. Existing new files always win, including empty/corrupt ones; there is no merge.

Tests use synthetic old schemas 1/2/3 and current schema 4, including history, settings, levels and daily activity. The old JSON is unchanged; repeated startup performs no second write. Imported IDs populate Store's existing deduplication set, so retrying an imported result does not award points/adaptation again. Custom configuration paths are tested.

Invalid schema/JSON, source read failure and failed import prevent further writes. A failure before creation can be retried on reload. A partially written destination is protected and requires manual backup/inspection before recovery. A completed file followed by an error is read on restart without reimport. A destination appearing during source read is retained. Independent external/sync writers are not coordinated; disable the old plugin and back up data before upgrading.

Schema 4, game IDs, stored mode IDs and comparison conditions are unchanged. The command's local ID stays `open-games`; its full ID becomes `brumalt:open-games`, so hotkeys need reassignment. No files are automatically deleted from a vault.

## Branding and cover

Manifest/package identify **Brumalt**, ID **brumalt**, version **0.3.3**, author **Zinvernix**, MIT. `versions.json` contains only 0.3.3 under the new ID; earlier changelog entries describe the former local plugin. Historic draft notes are marked accordingly.

`assets/walp.jpg` is an unchanged copy of the approved regular file: JPEG, **1280×640**, **91,045 bytes**, no EXIF entries. Decoder verification passed. SHA-256:

`ad668a055d212b32d020ad219206d32b68f4431bc7128d4a29655feee55bc8cd`

The cover is at the top of both README versions and is not loaded into the game window. No replacement logo or artwork was generated. No funding link was added.

## Build and publication

The installation ZIP is `dist/brumalt-0.3.3.zip`, containing exactly `brumalt/main.js`, `brumalt/manifest.json`, `brumalt/styles.css`, `brumalt/LICENSE`. No `data.json`, note, cache, source map or outer version folder is included.

- Bundle: **116,816 bytes**, SHA-256 `1007d89adff2f9bc20bc0bfbbc7f95b3bb61e83ea9fe1456402c360ef0c4d9bf`.
- CSS: **18,109 bytes**, SHA-256 `a9a1a12d5ecc9ce5a3cbe674b1aae3af1c1e4b51166943338834c6e80951a5d2`.
- ZIP: **36,381 bytes**, SHA-256 `e940c5f55a3301a9be67a861c13293ec41a98362d21470eb5b4a76801e543960`.

The local `.git` path is read-only; source staging/history uses separate temporary Git metadata without replacing another history. The target empty public repository and account `zinverno` were verified through the connected GitHub tool. Direct local `gh` network access is unavailable, so source publication uses the connected GitHub API and release publication uses one CI-gated workflow.

[Checks](https://github.com/zinverno/brumalt/actions) runs full npm install, types, tests, production build and archive verification on **Node 22/24** for pushes and pull requests. Only a main push can reach the release job, after both check jobs pass. It builds and verifies assets, uploads a temporary draft, downloads and byte-compares them, publishes a **Pre-release**, then downloads/comparisons again and checks tag/commit identity and release state. Existing published releases are never overwritten. No catalogue submission is automated.

Hosted run/release status must be read from GitHub; local results alone are not a claim of successful publication. Release attachments are the three separate install files, ZIP and SHA256SUMS. Root manifest and approved cover are included in source.

## Native and remaining limits

A fresh isolated vault/profile containing only `Demo.md` and the exact Brumalt build was launched through installed Electron 43. The process terminated before plugin registration with **SIGTRAP** (Python -5 / shell 133): `content/browser/sandbox_host_linux.cc:41`, `shutdown: Operation not permitted (1)`. No personal vault/profile was used.

Native desktop/mobile, actual light/dark/narrow/enlarged-font rendering, real touch, screen readers and pop-outs remain unverified. No generated image substitutes for a product screenshot. The contract tests stub geometry; they cannot measure clipping or contrast.

Manual acceptance should check one native close in all states, active Cancel/Stay through native close/Escape/backdrop, previous-note focus, no note-input interception, both languages, all six games, import from a backed-up old plugin, late save failures/retry, points/reminders and local midnight. Difficulty/profile metrics have no user-study calibration. History retains 1,000 attempts/365 days; unsaved failed changes are memory-only until successfully written. Preserve `data.json` on update.
