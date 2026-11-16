# Validation — Brumalt 0.3.5

## Screenshot preparation, 2026-11-16

No screenshots or visual acceptance are claimed. Xvfb failed to bind sockets; installed native Electron 43.6.0 stopped with `sandbox_host_linux.cc:41 ... shutdown: Operation not permitted (1)` in two independent profiles, before vault/plugin load. Both headless and ordinary desktop launch were attempted. Only fresh temporary `Brumalt Showcase` vaults/profiles were used; the personal vault was not opened. See [SHOWCASE](SHOWCASE.md) for Manjaro commands and the outstanding capture/review checklist.

The preparation helper successfully generated 62 synthetic completions through the existing game generators, evaluators, Attempt and Store, then validated the serialized schema. It creates all six chart axes and a partial 4/6-point day; the added regression checks determinism, duplicate-save rejection and the real weekly/profile calculations. The native CDP capture and final image packaging remain unexecuted because there are no real images. No screenshot ZIP or broken image references were added. Version, runtime sources, CSS, data schema, installer assets and approved cover remain unchanged.

Local checks: **122 tests passed** (the previous 121 plus one fixture regression), typecheck, official Obsidian ESLint with zero warnings, production build and Node-only package verification. The fixture preparer ran successfully in a new temporary directory. These automated checks do not establish native screenshot quality; the capture script must still be exercised on a desktop that permits Obsidian startup.

## Published patch checks

Date: 2026-11-16. This patch changes only two runtime expressions in src/main.ts: reminder and duration-error fragments now use Obsidian's global createFragment() helper. Document.adoptNode retains the original notification document even when the helper creates in another window. Timers, controls, UI copy, settings, game rules and saved schema are unchanged. Minimum Obsidian remains 1.13.0; 0.3.3 and 0.3.4 compatibility entries are retained.

- Official eslint-plugin-obsidianmd 0.6.0 recommended configuration plus explicit `obsidianmd/prefer-create-el: error`; no suppressions. The effective config and a deliberately invalid lintText probe confirmed the official rule is active. The installed rule skips some owner-document calls with Obsidian's current types, so the two external scanner warnings were not reproduced locally before the fix; both native calls are nevertheless removed. [Official rule and popout notes](https://github.com/obsidianmd/eslint-plugin/blob/master/docs/rules/prefer-create-el.md).
- Typecheck passed, including unused-variable checks. ESLint passed with 0 errors and 0 warnings.
- All **121 tests passed**, retaining the previous 120. The added regression checks both document ownership and reminder close/open/disable plus duration retry/restore actions. The global-helper fixture deliberately creates in a different document, rather than assuming an active-window implementation.
- Production build and Node-only archive verification passed locally (exact files, versions and SHA-256); CI repeats clean npm ci, typecheck, lint, tests, build and verification in Node 22/24 containers without zip/unzip.
- No external Obsidian Community re-review tool is exposed in this session and the repository has only the Checks workflow. An external re-review could not be triggered. Official lint success does not claim Community approval. Native popout/mobile rendering remains unverified; these are DOM contract tests.

[CI](https://github.com/zinverno/brumalt/actions/workflows/ci.yml) · [0.3.5 release](https://github.com/zinverno/brumalt/releases/tag/0.3.5). Older releases and their files must remain unchanged. The 0.3.4 report below is historical evidence, including development-tool advisories, not a new native acceptance claim.

---

# Validation — Brumalt 0.3.4

Date: 2026-11-16. Automated contracts, clean builds and native UI acceptance are separate evidence.

## Reproduction and scope

The official `eslint-plugin-obsidianmd` 0.6.0 recommended configuration reproduced **10 errors and 3 warnings** on 0.3.3 source: unsafe JSON array member access/returns, unnecessary assertions, globalThis and imperative settings headings/definitions. Packaging with an empty PATH reproduced `spawnSync zip ENOENT`.

Minimum Obsidian is now **1.13.0**, required by `PluginSettingTab.getSettingDefinitions`, `getControlValue`, `setControlValue`, `update` and `refreshDomState`. `getLanguage` dates from 1.8.7. Installed declarations are 1.14.4; the official `no-unsupported-api` rule checks source calls against the manifest minimum, rather than treating the installed declaration version as the minimum. No newer group search option is used. The 0.3.3 → 1.7.2 entry in versions.json remains unchanged.

Primary references: [official ESLint plugin](https://github.com/obsidianmd/eslint-plugin), [declarative settings migration](https://docs.obsidian.md/plugins/guides/migrate-declarative-settings), [submission requirements](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin).

## Implementation checks

- Declarative groups expose localized names/descriptions to native search, with no extra Brumalt title or `display()` override. Custom resolvers route every write through the existing serial Store/plugin methods. Pending state uses `refreshDomState`; committed/failed values and language changes use `update`. Dependent reminder controls and time validation are retained. The last-game invariant is checked inside the transaction.
- `getLanguage()` supplies the automatic language; explicit choice wins and unsupported host languages fall back to English. HTML/SVG are created with parent-owned helpers; duration error notices use `activeDocument`. Secondary-document tests verify ownerDocument for Positions, Rule, radar and notices.
- External arrays narrow to unknown[] and validated records before nested property reads. Schemas 1–4, existing import precedence and failed-load write protection are unchanged. No game parameters, rules, adaptation thresholds or saved schema changed.
- CSS replaces the partial text-decoration shorthand with a dotted border of the existing width; uses classic clipped screen-reader text; resolves hidden/save-status specificity without !important; and disables the actual tile transition in reduced-motion mode. No global Modal rules or custom close were added. These are source/DOM regressions, not a native visual or accessibility audit.
- fflate **0.8.3**, a development-only dependency, replaces system zip/unzip. File order and DOS timestamp (2000-01-01, independent of local timezone) are fixed. The verifier checks exactly four entries, root/dist/archive equality, all five SHA256SUMS entries, and optionally downloaded release files using Node alone. No data.json is packaged.

## Executed checks

Local environment: Node 24.14.1, npm 11.11.0, TypeScript 5.9.3, ESLint 9.39.5, typescript-eslint 8.72.2. ESLint uses the complete official recommended config with `--max-warnings 0`, including source, configuration and metadata. Test/build-only files are excluded from plugin-specific lint as recommended upstream.

- Fresh source-only directory: `npm ci` passed.
- `npm run typecheck` and `npm run lint` passed; lint reports **0 errors, 0 warnings**.
- Full suite/build/verification in a restricted PATH without zip/unzip: **120 passed, 0 failed**, typecheck, lint, build and verify-package passed. Fresh-directory production bytes match the workspace build. An earlier local wrapper omitted npm from PATH; it was corrected. A nested npm ci attempt encountered a sandbox esbuild spawn EPERM, so clean npm ci was rerun directly and passed before the restricted-PATH checks. Hosted container npm ci also passed on both Node versions.
- The local Docker client could not connect to a daemon. Hosted checks instead use fresh `node:22-bookworm-slim` and `node:24-bookworm-slim` containers and assert zip/unzip are absent before npm ci.

Existing 115 tests are preserved. Five added tests cover nested malformed JSON across all schemas and write refusal; portable deterministic ZIP/checksum rejection; specified CSS regressions; searchable settings, delayed writes, last-game protection, dependencies/errors/recovery; and secondary-document DOM ownership. Existing coverage includes all six games/RU/EN, 4,000 seeded Rule and 4,000 Order tasks, adaptive bounds, 2/1/0 points, history/radar, reminders, save retries, legacy import and a single native close in all five states.

## Publication gate

Changes were submitted in [PR #1](https://github.com/zinverno/brumalt/pull/1). [PR Checks 43792531345](https://github.com/zinverno/brumalt/actions/runs/43792531345) and [branch Checks 43792503401](https://github.com/zinverno/brumalt/actions/runs/43792503401) passed on Node 22 and 24. Both clean-container jobs completed the no-zip/unzip assertion, npm ci, typecheck, zero-warning lint, 120 tests, production build and package verification. The release job was correctly skipped on the feature branch. This evidence-only follow-up is checked again before merging to release-bearing main. The existing release path waits for both checks, publishes a new pre-release and downloads/verifies its assets. Version 0.3.3, its tag and assets are immutable. No Community Directory submission is performed.

The main run and publication status are available under [Checks](https://github.com/zinverno/brumalt/actions/workflows/ci.yml) and [Release 0.3.4](https://github.com/zinverno/brumalt/releases/tag/0.3.4). Publication requires main CI success and a byte-for-byte comparison of downloaded assets. Passing the official local linter is not a claim that the external Community Directory review service has re-reviewed or accepted the plugin.

## Remaining limits

Native Obsidian 1.13/1.15, actual settings-search interaction, pop-out rendering, light/dark/narrow/enlarged-font layouts, mobile, touch and screen readers have not been run for this build. jsdom supplies an explicit host contract, not the native declarative renderer. Earlier isolated native startup failed before plugin registration; that is not acceptance evidence for 0.3.4. No personal vault was used or modified.

The official lint dependency chain currently reports **10 moderate npm audit findings**, propagated from minimatch into typescript-eslint/eslint-plugin-n and the official plugin. No high/critical report was returned. Avoided suggested downgrades to obsolete linters and untested major transitive overrides. ESLint 9 also emits an npm deprecation notice; it is retained for the official plugin's declared peer compatibility. These development tools are not bundled in main.js. A separate fflate advisory was resolved by selecting 0.8.3. Zero lint warnings does not mean zero dependency advisories.

History remains limited to 1,000 attempts/365 days; failed unsaved changes remain memory-only until successfully written. Back up and preserve data.json when updating. Game statistics are not an intelligence assessment.

## Local artifact SHA-256

```text
bf2155a8ed2e2a7426706cd2086d00bb693366a0e9840ef2c04d790a187738b7  brumalt/main.js
d68324089054a40036a218fa8c26f5b00e8eeaa85e050b39d3d34f2975c097c5  brumalt/manifest.json
21851450daf213e49c8529e10b2890c7fa5da03236775fdaf1894c7097775138  brumalt/styles.css
8f88c0a38c06a77ac232a0ae1779cb341ee010092933ab3955c90c2a8ac02d0c  brumalt/LICENSE
958e82a47cb734e25d04127d36657476deb55df44b3bcc51cd653a4171514c4c  brumalt-0.3.4.zip
```
