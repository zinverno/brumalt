# Brumalt native showcase

**Captured and individually visually reviewed: 2026-11-16. All eight real PNGs are available.** Brumalt **0.3.5**, Obsidian **1.13.7**, Electron **43.6.0**, Chromium **150.0.7871.250**, Linux/X11. No user interaction with Obsidian was needed.

The machine-readable [capture report](../assets/screenshots/capture-report.json) records dimensions, bytes, SHA-256, capture methods, game phases, language, six radar scores, build/harness hashes and process cleanup. The eight published files are byte-for-byte copies of the reviewed native originals.

## Images

| File under `assets/screenshots/` | Pixels | Bytes | Visual review |
| --- | --- | ---: | --- |
| `en/01-home.png` | 1200 × 800 | 36,913 | Passed |
| `en/02-logic.png` | 1200 × 800 | 27,385 | Passed |
| `en/03-progress.png` | 1200 × 800 | 42,487 | Passed |
| `ru/01-home.png` | 1600 × 900 | 45,661 | Passed |
| `ru/02-memory.png` | 1600 × 900 | 33,106 | Passed |
| `ru/03-logic.png` | 1600 × 900 | 32,493 | Passed |
| `ru/04-progress.png` | 1600 × 900 | 52,619 | Passed |
| `ru/05-settings.png` | 1600 × 1100 | 109,369 | Passed |
All files are below 5 MB. English Home and Progress are embedded in [README](../README.md); Russian Home and Progress in [README.ru](../README.ru.md). The [English collection](../assets/screenshots/en/README.md) and [Russian article captions](../assets/screenshots/ru/README.md) describe their purpose.

## One autonomous command

```sh
npm run showcase:capture
```

The command builds and verifies the installation package, generates a fresh synthetic vault and profile, starts its own graphical session and real Obsidian, waits for plugin/command/layout readiness, selects English and Russian through real settings, opens the required screens, captures all eight PNGs, validates them and terminates only its own process group. It prints the fresh `/tmp/brumalt-showcase-<id>` output directory. Original captures are in `captures/en` and `captures/ru`; `report.json`, `native-sessions.jsonl`, `electron.log` and `isolation/` retain local evidence, including failures. A rerun uses a new directory and preserves earlier originals.

Prerequisites for this Linux capture path: Node 22/24, installed npm dependencies, Python 3, Xvfb, Openbox, D-Bus, `xauth`, `xprop`, ImageMagick's `import`, Noto Sans Condensed and an installed Obsidian/Electron pair. The verified host uses `/usr/bin/electron43` and `/usr/lib/obsidian/app.asar`; `OBSIDIAN_ELECTRON` and `OBSIDIAN_APP` can specify another installed pair. This does not install system software or download a browser. Other host versions require a fresh native/visual check.

Codex's restricted execution initially prevented Xvfb from binding its socket (`Failed to find a socket to listen on`). A specifically authorized local execution of the same command resolved the restriction. **Electron sandbox remained enabled**; no `--no-sandbox` was used. A restricted-environment failure is not a reason to require manual window launch or game navigation.

## Reused Veynrel architecture

The launcher and session boundary are adapted from [Veynrel's native-isolation revision `eb4caba`](https://github.com/zinverno/veynrel/tree/eb4caba/scripts/native), under the same MIT license and copyright:

- `scripts/native/run.py`: Xvfb `-displayfd`, private Xauthority cookie, Openbox readiness, isolated D-Bus with no desktop activation directories, isolated XDG directories, process group, timeout and cleanup evidence.
- `scripts/native/session.mjs`: fresh profile, native Electron frame, sandboxed launch, loopback CDP port `0`, discovery through that profile's `DevToolsActivePort`.
- `scripts/final-product-ui-native.mjs`: renderer assertions, `Emulation.setDeviceMetricsOverride` and `Page.captureScreenshot`.
- `scripts/recall-topics-native.mjs` and `scripts/native/smoke.mjs`: plugin/command/layout readiness, real settings navigation, owned-window identification and unchanged-data checks.

Brumalt's scenario stays in `scripts/showcase.mjs`; it does not add a new game renderer or browser mock. There is no fixed CDP port and no `Browser.getWindowForTarget`. Before UI mutation, it verifies that the renderer has the exact launcher-created vault. It never opens a personal vault or uses the normal Obsidian profile. Only its own session is terminated; no global `pkill` is used.

## Actual capture methods and appearance

Seven images use native Electron `Page.captureScreenshot`, with the requested viewport set through `Emulation.setDeviceMetricsOverride` and device scale factor 1. The standard dark theme and Obsidian's interface-font preference **Noto Sans Condensed** are used. English uses native **90% UI zoom**, which fits the complete Progress screen at 1200 × 800; Russian uses **100%**. The compact interface font avoids an isolated final letter wrapping in the long Russian game name. These are host preferences, not injected CSS or changes to Brumalt.

Obsidian 1.13.7 opens Settings in a separate native window. Its embedded-dialog alternative clipped the final description. The final Settings capture therefore uses the real separate window, resized using Electron's native window API and measured `_NET_FRAME_EXTENTS`. `import -window <owned-XID> -frame` captures that window including its actual OS title bar and single close button at exactly 1600 × 1100. It uses the same private X server and owned Electron session. CDP alone excludes the OS frame; no title bar is composited onto the image.

There is no image resizing, retouching, mock HTML, replacement chart, hidden UI or modified game timer. Logic questions are newly generated by the actual plugin. The memory screenshot is captured during the normal eight-second presentation. Exiting uses Back and the actual cancellation confirmation; no answers are submitted to manufacture navigation.

## Demonstration data and visual review

The unchanged `scripts/showcase-data.ts` creates **62 synthetic completions** through the six game generators, `Attempt.finish`, `Store.record` and `parseData`. Ten historical attempts per game and two additional attempts yield **4/6 points today**. Scores, timing and practice levels are fictional demonstration inputs, not measured human performance. The existing plugin calculates the six-axis chart: **90, 60, 80, 70, 80, 50** in game order. No result is added during capture; persisted history is compared with the original fixture.

The current local date is retained. This capture happened on Monday, so later weekdays correctly have no activity. Reminders are disabled. Only a neutral `Brumalt.md` note is present. Temporary data, profiles, caches and diagnostic logs are excluded from Git and the article ZIP.

Every selected PNG was opened and inspected individually. The review checked readable text, correct language (including Russian host Settings), centered foreground game windows, full game controls, all six radar axes and result rows, no clipped settings or footer, sensible spacing, no notifications and no personal information. Each foreground window has one close button; the background Obsidian tab's normal close icon is not a second Brumalt close control. Earlier captures with an awkward word wrap or clipped settings were rejected and retained locally.

The final native run reported **8/8 captures, zero main-renderer exceptions, exit 0, clean process group and closed CDP port**, in 7.784 seconds after build. Automatic checks cover dimensions, PNG signature, file sizes, state/language, six cards, 4/6 progress, six nonempty radar axes, notices, modal geometry and unchanged installation/history. Visual acceptance is recorded separately; a future raw capture starts with `visualReview: required` and does not silently overwrite these reviewed public assets.

## Habr package

```sh
node scripts/showcase.mjs pack
```

`dist/brumalt-habr-screenshots.zip` contains only the five reviewed Russian PNGs and `README.md` with captions. Packing verifies dimensions and a byte-exact ZIP round trip using the existing `fflate` dependency. It refuses to overwrite an existing archive. This is an article bundle, not an installation package or Release asset. Publication to Habr or an Obsidian account is outside this capture operation.

## Validation and release preservation

Local checks: typecheck, lint with zero warnings, **125 tests**, production build and package verification. Three new regression cases execute the actual release workflow script with a stub that rejects GitHub mutations: an existing published stable release or beta is skipped, and a draft still fails safely.

The workflow previously required an existing release to be a pre-release. It now accepts either published kind and exits without creating or editing a release. Thus merging documentation with version 0.3.5 does not try to republish the existing ordinary release. No version, tag, game source, stylesheet or installation file was changed. `assets/walp.jpg` retains SHA-256 `ad668a055d212b32d020ad219206d32b68f4431bc7128d4a29655feee55bc8cd`.

The rebuilt installation ZIP remains `d0769eedd18ecc4397a31075043d9dc81c3a17a640c514695e6597dd7aba8204`, matching the published 0.3.5 asset; all three installation-file hashes also match that release. Native acceptance here covers this Linux/Obsidian host and these screens; it does not establish mobile, screen-reader, other-theme or other-OS behavior.
