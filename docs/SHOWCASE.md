# Native screenshot showcase

## Current status

**Capture pending. No screenshots, visual acceptance or Habr image ZIP are claimed.** On 2026-11-16 this environment blocked Xvfb's listening sockets; two fresh-profile launches of the installed native Obsidian (headless and desktop) both stopped before vault/plugin load with:

```text
FATAL:content/browser/sandbox_host_linux.cc:41
Check failed: . shutdown: Operation not permitted (1)
```

This is a host startup failure, not evidence of a Brumalt UI failure. No substitute HTML, generated image or retouched UI was used. Screenshot links must not be inserted in either main README until the files exist and have been reviewed. The showcase PR must remain a draft until those gates pass.

## Prepare on Manjaro

Use Node.js 22 or 24, the existing checkout and a locally installed Obsidian 1.13+. Run from the repository root:

```sh
npm ci
npm run build
node scripts/showcase.mjs prepare
```

The last line prints a **new** temporary directory, for example `/tmp/brumalt-showcase-ABC123`. Set it explicitly to the printed path:

```sh
showcase=/tmp/brumalt-showcase-ABC123
env XDG_CONFIG_HOME="$showcase/config" obsidian \
  --user-data-dir="$showcase/profile" \
  --remote-debugging-address=127.0.0.1 --remote-debugging-port=9259
```

This launches the actual installed application; it does not load an HTML harness. Keep this process open while capturing. Port 9259 must be free; keep the debugging endpoint local and close the isolated application when finished. Do not use a public interface or port forwarding. No account, token or system package installation is needed. The ordinary sandbox is retained; no `--no-sandbox` workaround is prescribed.

The new profile knows only **Brumalt Showcase**. Do not select, import, copy or open a personal vault. The script never reads the default Obsidian profile. It creates no symlinks and never accepts a destination vault to overwrite. `prepare` refuses additional arguments and creates a fresh directory every time.

The installation is byte-checked against the current 0.3.5 production package before copying. The vault contains only the Brumalt plugin, standard file explorer/command palette, a neutral **Welcome to Brumalt** note and generated settings/data. The dark theme and purple accent are normal Obsidian appearance settings, not injected CSS.

If the first launch requests trust or community-plugin activation, approve it only for this demonstration vault and enable Brumalt. Open the neutral note, collapse sidebars, close extra tabs, dismiss introductory notices, and wait for Brumalt's command to register. Do not install themes, snippets or other plugins. Keep default text scale; if the complete Settings page cannot fit, use a larger real desktop rather than cropping controls.

## What the synthetic data means

`scripts/showcase-data.ts` generates 62 fictional completions using the real six game generators, valid answers, `Attempt.finish`, `Store.record` and the current `parseData` validator. It uses a fixed random seed and the current **local** date. Scores, response times and practice levels are editorial demonstration inputs, not observed human performance. Each game has ten past attempts; two additional attempts give today **4/6 points**. Incorrect completed answers are included. A repeated save is checked to add nothing.

The chart uses Brumalt's unchanged comparable-result calculation. No 100%-everywhere profile, arbitrary radar coordinates, future activity, fake device date or overwritten DOM values are used. Weekly appearance depends on the actual weekday: on Monday, the remaining days correctly have no activity yet. Reminders start disabled so they cannot interrupt capture. All generated `data.json` files stay in the temporary vault; none belongs in Git or a release/archive.

## Capture the real application

The small CDP capture helper uses Node's built-in WebSocket and the running Electron renderer. It checks the exact vault path **before** focusing, resizing, clicking or capturing. It also checks version, language, requested screen, dark theme, no notices and exactly one visible native close. It does not replace styles, freeze timers, change scores, mask UI or fabricate images.

The native window is resized to the requested content area, with no image scaling. Use a desktop large enough for 1600 × 1100 plus window decorations; the helper fails on a dimension mismatch instead of stretching pixels. Native CDP capture is **not yet end-to-end tested here**, because the application cannot start. Host API or window-manager differences may require a manual desktop capture with the same safety and size checks.

The helper deliberately accepts one Obsidian renderer only. If your host opens Settings in a separate window/document, it will refuse the ambiguous target list: capture that isolated Settings window with your desktop's window-screenshot tool instead. Do not close an unrelated personal window or disable a safety check to make capture proceed. Check the selected window and resulting dimensions before saving. No multi-window capture support is claimed.

Choose English in **Settings → Brumalt → Language**, return to the note, then open **Open Brumalt** from the command palette. For each shot, leave the requested screen visible and run the matching command from a second terminal:

```sh
node scripts/showcase.mjs capture "$showcase" en/01-home
node scripts/showcase.mjs capture "$showcase" en/02-logic
node scripts/showcase.mjs capture "$showcase" en/03-progress
```

Before `en/02-logic`, select **Rule** and leave it on **setup**, at level 3. The helper brings Obsidian forward and clicks the real **Start** button, then captures the active question with examples and four answers. It never changes the generated task. To leave a task, use Back and confirm cancellation; do not submit an answer just to navigate away.

Before `en/03-progress`, return Home and open Progress. Scroll to the top. Home and Progress remain idle while the terminal is used.

Switch to **Русский** through Brumalt settings, then repeat:

```sh
node scripts/showcase.mjs capture "$showcase" ru/01-home
node scripts/showcase.mjs capture "$showcase" ru/02-memory
node scripts/showcase.mjs capture "$showcase" ru/03-logic
node scripts/showcase.mjs capture "$showcase" ru/04-progress
node scripts/showcase.mjs capture "$showcase" ru/05-settings
```

Before `ru/02-memory`, leave **Расположение**, level 3, on setup. The helper clicks **Начать** and captures within the normal eight-second presentation; no timer is altered. For `ru/03-logic`, use **Правило** setup. For settings, close the game Modal and open the Brumalt settings tab, at the top. Leave the reminder off; its toggle is still visible. Verify language, goal, reminder toggle and all enabled games are in frame.

Captures go to `$showcase/captures/en/` and `ru/`, with local JSON evidence containing dimensions, size, SHA-256, host user agent and `visualReview: required`. PNGs omit the mouse cursor. Each EN image must be exactly **1200 × 800**; RU uses **1600 × 900**, or **1600 × 1100** for settings. All must be under 5 MB. Existing files are not overwritten: move rejected originals to a separate attempts folder before retaking.

## Review and publish only real images

Open **every PNG**, not just its metadata. Check correct language, actual native Obsidian, complete and legible content, centered Modal, one close, no notices, no personal information, no other windows, sensible margins, readable six-axis radar and no clipped settings. No pixel privacy claim follows from DOM assertions alone. If a screen is broken, report the bug separately; do not redraw it. Keep original captures and sidecars locally.

After all eight pass, copy just the selected PNGs into `assets/screenshots/en/` and `assets/screenshots/ru/`. Update both directory READMEs and record actual dimensions, sizes, Obsidian version and visual findings here. Add a compact `## Screenshots` after the feature introduction in the English README, using only `en/01-home.png` and `en/03-progress.png`; use `ru/01-home.png` and `ru/04-progress.png` in the Russian README. Keep `assets/walp.jpg` unchanged.

Then build the article archive:

```sh
node scripts/showcase.mjs pack
```

It requires all five real Russian PNGs with expected dimensions, includes only those files and their README, and verifies the ZIP round trip with the existing `fflate` dependency. It refuses to overwrite an existing archive. **Do not create an empty placeholder ZIP** and do not upload this ZIP to Release Assets. Upload order for Community is Home → Logic game → Progress; account changes and upload are manual.

Run the existing typecheck, tests, lint, production build and package verification. Review the Git diff: no data.json, vault/profile, sidecar containing local paths, cache or temporary files. Only after the images pass review and PR CI is green, merge the documentation PR. Keep version/tag/release 0.3.5 untouched.

**Existing workflow caveat:** 0.3.5 was observed as a published regular release on 2026-11-16, while the current main-branch release job expects an existing release to be a Pre-release. Resolve that docs-only skip condition before merging, without changing or republishing the existing release. No workflow or release was modified during this blocked capture preparation.
