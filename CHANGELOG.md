# Changelog

All notable changes to PlaybackKeys will be documented in this file.

## [0.9.0] - 2026-09-10

### Added
- Added an optional remaps on/off hotkey row to the Windows AHK bridge settings panel so users can record a Bridge toggle hotkey, persist it with companion state, and embed it in the downloaded AHK bridge script.

### Changed
- Renumbered all Commands with zero-padded ids so the browser shortcuts page lists non-Skip Commands first, then Skip back/forward for intervals 1–3 as one contiguous block (ADR-0004).
- Updated in-extension shortcut and AHK mapping lists to the same product order.
- Migrated stored AHK External hotkey mappings (and chord snapshots) from old Command ids; orphan ids are cleared.

### Fixed
- Chrome/Edge shortcuts pages no longer sort `10-` / `11-` next to `1-`, and Skip pairs are no longer split among speed/switch Commands.

### Notes
- **Rebind required after upgrade.** Chrome drops bindings when Command ids change. Open `chrome://extensions/shortcuts` (or Edge’s equivalent) and rebind your chords. If you use the AHK bridge, regenerate and reload the script after rebinding.

## [0.8.0] - 2026-09-09

### Added
- Added Bilibili (`www.bilibili.com`) as a Built-in Hostile player: Commands on VOD and Bangumi watch pages; no stream fetching (ADR-0001).
- Listed Bilibili with the other Built-in sites in options, popup naming, store listing copy, README, and the privacy host list.

## [0.7.0] - 2026-05-29

### Added
- Added a System / Light / Dark theme setting that follows OS color-scheme preferences by default.
- Added localized theme labels for every supported locale.

### Changed
- Renamed the extension display name to `PlaybackKeys: Global Video Shortcuts` with localized subtitles.
- Updated extension pages and in-page controls to use theme-aware surfaces across light and dark mode.
- Refined onboarding, settings shortcut rows, and the popup for clearer light-mode contrast, more readable shortcut hints, and a more compact control layout.

### Fixed
- Ensured hidden settings controls remain hidden when component classes define their own display styles.

## [0.6.0] - 2026-05-24

### Added
- Added Chrome extension i18n support with localized manifest metadata, popup, settings, onboarding, command labels, context menu text, and in-page playback UI strings.
- Added locale catalogs for English, Spanish, Portuguese (Brazil), German, French, Turkish, Japanese, Korean, and Simplified Chinese.
- Added localized Chrome Web Store listing copy under `docs/chrome-store-localized-listing.md`.

### Changed
- Updated release packaging validation so `_locales` is included in the Chrome Web Store ZIP.
- Added release validation for locale key parity, required message fields, and placeholder consistency across all locale catalogs.
- Updated Chrome Web Store listing copy to emphasize YouTube, Udemy, Vimeo, Coursera, global shortcut usage, privacy, limitations, and open-source links.

### Fixed
- Hardened in-page i18n delivery so late-arriving localized strings update shared toast and speed badge UI state consistently.

## [0.5.0] - 2026-05-19

### Changed
- Release workflow now sets up Node and runs `npm ci` before validating and packaging, so the build no longer depends on the GitHub runner's default Node.
- Consolidated the three injected video-targeting functions in the service worker into one helper, so probe, seek, and status reads can't drift apart.
- README now uses the Chrome Web Store screenshots inline next to the features they show, and describes PlaybackKeys as a Chromium extension built and tested on Chrome.

### Fixed
- Release ZIP now contains `manifest.json` at the root instead of nested under a `PlaybackKeys/` folder, so Chrome Web Store uploads accept it.
- Validation script now asserts the Git tag matches `v${manifest.version}`, that the CHANGELOG's first release heading matches the manifest version, and that the produced ZIP has the right layout.
- Removed em dashes from user-facing copy in the README and landing page so the writing reads naturally.

## [0.4.0] - 2026-05-05

### Added
- Added release validation and packaging scripts so Web Store ZIPs include only extension runtime files.
- Added an optional Playwright smoke test for the unpacked extension command path.
- Added upload-ready Chrome Web Store screenshots under `assets/chrome-web-store/`.

### Changed
- Updated extension description to "Control browser videos with global keyboard shortcuts. Pause, skip, rewind, and change speed without switching tabs."
- Video targeting now uses the same visible/controllable video filter for commands, status reads, and seeking.

### Fixed
- Onboarding page CSS now uses design tokens instead of hardcoded dark hex values, so it renders correctly in both light and dark mode
- Privacy policy now documents the `contextMenus` permission.
- Onboarding copy now describes global shortcuts more accurately and no longer uses a placeholder shortcut-settings URL.

## [0.3.0] - 2026-05-04

### Added
- Windows symbol mappings for improved platform-specific keyboard display
- Landing page and improved documentation

### Changed
- Enhanced content scripts to harden against TrustedHTML CSPs and orphaned context scenarios
- Moved documentation site to `/docs` directory for local loading

### Fixed
- Fixed popup shortcut badge overlap issue

## [0.2.0] - 2026-04-XX

### Added
- Initial stable release
- Global keyboard shortcuts for YouTube, Vimeo, Udemy, and Coursera
- Play/pause, speed control, and skip controls
- Tab targeting logic for multiple open videos
- Speed UI with visual indicator pill
- Extension popup with playback controls
- Settings page for site customization
- Install-time onboarding page

### Features
- No account required
- No telemetry or network requests
- Full privacy — all data stays on device
- Minimal permissions (narrow host permission list by default)
- Per-site opt-in or bulk enable option
