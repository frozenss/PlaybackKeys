# Changelog

All notable changes to PlaybackKeys will be documented in this file.

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
