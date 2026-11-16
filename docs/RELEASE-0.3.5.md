# Brumalt 0.3.5 — Obsidian Review Compliance

A focused fix for the remaining Community Plugin Review DOM-helper warning.

- Both reminder and duration-save error notices now use the official Obsidian `createFragment()` helper.
- Fragments are adopted into the same document as before, preserving behaviour in additional windows. Reminder actions and duration retry/restore remain unchanged.
- The official `obsidianmd/prefer-create-el` rule is explicitly required as an error, with no suppression.

All games, UI, settings, user data and schema remain unchanged. Requires Obsidian **1.13.0+**. Versions 0.3.3 and 0.3.4 are preserved.

## Update

Back up and **preserve `data.json`**. Extract `brumalt-0.3.5.zip` into the vault's plugins directory, replacing only the install files, then reload Brumalt. Separate `main.js`, `manifest.json`, `styles.css` and `SHA256SUMS` are attached.

## Verification limits

See `docs/VALIDATION.md` for automated checks and CI. Cross-document tests use a DOM host fixture; native popout/mobile acceptance is not claimed. No tool for triggering the external Obsidian Community re-review was available; passing the official ESLint rule is not a claim of external review approval.
