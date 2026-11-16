> Historical local draft under the former plugin ID; not a published Brumalt release. See [0.3.3](RELEASE-0.3.3.md).

# Draft release — Casual Memory Games 0.3.2

A small polish update before publication:

- One close icon across the game window, with Back and active-attempt exit confirmation preserved.
- Duration updates immediately in place and saves in the background. Rapid choices keep the latest value; failures offer retry or restore without replacing the screen.
- A dedicated Positions icon and clearer Single game / Отдельная игра naming.
- A continuous SVG profile even with missing games: hollow markers mark the drawing baseline, not a real score.
- Explicit daily points wording throughout the main summaries.

English/Russian, all six games, daily 2/1/0 points, reminders, adaptation and pending-result recovery remain. Schema 4 and stored mode IDs are unchanged.

**Update:** back up and preserve `data.json`; replace only installation files and reload the plugin.

Prepared attachments: `dist/casual-memory-games-0.3.2.zip` and separate `main.js`, `manifest.json`, `styles.css` in `dist/casual-memory-games/`. The ZIP has exactly one installation folder with those files and MIT licence. Checksums: `dist/SHA256SUMS`.

See [VALIDATION.md](VALIDATION.md) for actual checks and outstanding native/visual acceptance. No repository, release or catalogue submission was published. Nothing was installed in the main vault.
