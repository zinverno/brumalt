# Brumalt 0.3.3 — First Public Beta

Brumalt is a free, offline Obsidian plugin for a short memory or logic break between notes. It offers Numbers, Positions, Words, Sequence, Rule and Order; approximate 1 / 3 / 5 minute sessions; single-game mode; adaptive or manual difficulty; and local personal progress.

Optional daily goals reward variety with 2 / 1 / 0 points per game's first, second and subsequent saved attempts. Reminders are opt-in, at most once a day inside Obsidian. English and Russian are included. No account, ads, telemetry, external services or network requests are used.

This release establishes the Brumalt name and plugin ID, with author Zinvernix and the approved cover. It removes the duplicate custom close control: Obsidian's native close, Escape and backdrop share the safe Cancel / Stay handling during unfinished attempts. The compact profile chart, optimistic duration controls and all six games remain.

## Install

Download `brumalt-0.3.3.zip` and extract its single `brumalt` folder into your test vault's `.obsidian/plugins/` directory (or custom config directory). Enable Brumalt in Community plugins. `main.js`, `manifest.json` and `styles.css` are also attached separately. The ZIP includes MIT licence. Extract the archive before running `sha256sum -c SHA256SUMS` alongside it.

Declared minimum Obsidian: 1.7.2. Start with a disposable test vault and back up `data.json` before updates.

## Moving from Casual Memory Games

Back up `casual-memory-games/data.json`, disable the old plugin, then install and enable Brumalt. If `brumalt/data.json` is absent, the validated old data is imported once before gameplay. Old data is never changed or deleted. Existing new files always win; histories are not merged. Check your history, levels, settings and daily activity before deciding what to do with the old folder.

On a failed import, games/writes are blocked; inspect and back up both files before recovery. Details and a manual procedure are in the README. The full command is now `brumalt:open-games`; reassign your old hotkey. Schema 4 and stored game/mode IDs remain unchanged.

## Known limits

This is an exercise tool, not a validated IQ test or a claim of scientifically proven general intelligence gains. History is bounded to 1,000 attempts and 365 days. Failed unsaved writes remain memory-only until retried; independent concurrent writers are not coordinated.

Native/mobile, actual theme/layout and screen-reader acceptance have not been established by the automated suite. The user confirmed the native-close hotfix on Obsidian 1.15.1; that is not a full native run of this release. See `docs/VALIDATION.md` for executed checks and environment limits. No Community Directory submission is included.
