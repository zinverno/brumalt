> Historical local draft under the former plugin ID; not a published Brumalt release. See [0.3.3](RELEASE-0.3.3.md).

# Draft release — Casual Memory Games 0.3.1

One window with predictable ways back. This polish update adds explicit internal routes, a quieter header, and a compact visual Progress screen.

- Back from Progress and game setup returns Home; unfinished attempts ask Cancel / Stay. Stay preserves the task and input while resuming paused timers.
- Session results offer Back to notes, Play again and Home as distinct actions.
- Language selection is now only in plugin settings. English, Russian and Automatic still work.
- Progress combines daily points, the week, a small SVG exercise profile and six expandable rows. Scores use recent comparable attempts with neutral padding and rounding; empty axes do not imply zero ability. This is not an intelligence metric.
- Schema 4, the six games, 2/1/0 goal points, reminders, pending writes and older migrations are preserved. No new dependencies or data migration.

**Updating:** back up and preserve `data.json`. Replace installation files only, then reload the plugin.

Attachments prepared locally:

- `dist/casual-memory-games-0.3.1.zip`
- `dist/casual-memory-games/main.js`, `manifest.json`, `styles.css`
- `dist/SHA256SUMS`

The ZIP contains one installation folder with the three files and MIT licence. Nothing was published or installed in the main vault.

Read [VALIDATION.md](VALIDATION.md) for executed checks and outstanding acceptance. Native Obsidian and Chromium fail before plugin/page load under this sandbox, so native/mobile behaviour, real layout/font/contrast checks and screenshots remain outstanding. Pending failed writes remain memory-only until saved; preserve data before updating.
