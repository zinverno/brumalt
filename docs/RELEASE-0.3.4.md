# Brumalt 0.3.4 — Obsidian Review Compliance

This beta fixes review compatibility and build portability while keeping all six offline games, adaptive difficulty, personal progress, RU/EN, daily points and optional reminders unchanged.

## Changes

- Requires **Obsidian 1.13.0+**. Searchable declarative settings are grouped into General, Daily goal and reminders, and Available games. Values still pass through the existing serial Store with error handling.
- Use the public app-language API and parent-owned DOM/SVG helpers. The native close and active-attempt confirmation remain.
- Validate nested JSON arrays before accessing records; preserve existing schema and legacy import protections.
- Replace external zip/unzip commands with deterministic JavaScript packaging and verification. No system archive tools are required.
- Fix the reported TypeScript/ESLint and CSS warnings; add official Obsidian recommended lint as a required Node 22/24 CI gate.

## Install or update

Requires Obsidian 1.13.0 or later. Back up and **preserve `data.json`**. Extract `brumalt-0.3.4.zip` into the vault's plugins directory, replacing only Brumalt's install files, then reload the plugin. Separate `main.js`, `manifest.json` and `styles.css` are also attached. `SHA256SUMS` covers the ZIP and its four install files.

For Casual Memory Games, back up the old data and disable the old plugin first. Brumalt imports validated old data once only when its new data file is absent; it never merges or deletes existing files. See the README for recovery and hotkey reassignment.

Published 0.3.3 assets and its compatibility entry are unchanged. No Community Directory submission is performed by this release.

## Limits

Automated tests and clean container builds are distinct from native UI acceptance. Native desktop/pop-out/mobile rendering and real screen-reader behaviour have not been verified for this build. The chart summarizes exercise performance, not intelligence. See the validation report for executed checks and tooling advisories.
