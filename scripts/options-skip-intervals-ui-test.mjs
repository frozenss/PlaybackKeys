/**
 * Options-page DOM tests for Playback Skip intervals (#17).
 * Seam: options page UI (chrome-extension://…/options/options.html).
 *
 * Playback Skip interval rows are seconds-only; Shortcuts keeps the Command
 * list and the single browser-shortcuts CTA.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run `npm install` once, then re-run.");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PROFILE = mkdtempSync(join(tmpdir(), "playbackkeys-options-skip-ui-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// Chromium only exposes MV3 extension service workers reliably with a headed
// persistent context (same constraint as scripts/smoke-test.mjs).
const context = await chromium.launchPersistentContext(PROFILE, {
  headless: false,
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--no-proxy-server",
  ],
});

try {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 15000 });
  const extensionId = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/options/options.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#skip-intervals .skip-interval-row", { timeout: 10000 });

  const snapshot = await page.evaluate(() => {
    const playback = document.getElementById("playback");
    const shortcuts = document.getElementById("shortcuts");
    const rows = [...document.querySelectorAll("#skip-intervals .skip-interval-row")];
    return {
      rowCount: rows.length,
      rowsWithSecondsSeg: rows.filter((row) => row.querySelector(".seg")).length,
      chordChipCount: document.querySelectorAll("#skip-intervals .skip-chord-chip").length,
      playbackOpenSkipShortcuts: Boolean(playback?.querySelector("#open-skip-shortcuts")),
      playbackOpenShortcuts: Boolean(playback?.querySelector("#open-shortcuts")),
      shortcutsListPresent: Boolean(shortcuts?.querySelector("#shortcut-list .shortcut-row")),
      shortcutsCtaPresent: Boolean(shortcuts?.querySelector("#open-shortcuts")),
      openShortcutsCount: document.querySelectorAll("#open-shortcuts").length,
      openSkipShortcutsCount: document.querySelectorAll("#open-skip-shortcuts").length,
    };
  });

  assert(snapshot.rowCount === 3, `expected 3 Skip interval rows, got ${snapshot.rowCount}`);
  assert(
    snapshot.rowsWithSecondsSeg === 3,
    `expected seconds presets on each Skip interval row, got ${snapshot.rowsWithSecondsSeg}`,
  );
  assert(
    snapshot.chordChipCount === 0,
    `Playback Skip interval rows must not show Command chord chips, found ${snapshot.chordChipCount}`,
  );
  assert(
    snapshot.playbackOpenSkipShortcuts === false,
    "Playback must not show #open-skip-shortcuts",
  );
  assert(
    snapshot.playbackOpenShortcuts === false,
    "Playback must not host the Shortcuts CTA",
  );
  assert(
    snapshot.openSkipShortcutsCount === 0,
    "duplicate Playback shortcuts control must be removed from the page",
  );
  assert(
    snapshot.shortcutsListPresent === true,
    "Shortcuts section must still render the Command list",
  );
  assert(
    snapshot.shortcutsCtaPresent === true && snapshot.openShortcutsCount === 1,
    "Shortcuts section must keep exactly one Open Chrome shortcut settings control",
  );

  // Saving Skip interval seconds still works and remains the Playback control.
  await page.locator("#skip-intervals .skip-interval-row").nth(0).locator(".seg button", { hasText: "15s" }).click();
  await page.waitForFunction(async () => {
    const stored = await chrome.storage.local.get("skipIntervals");
    return Array.isArray(stored.skipIntervals) && stored.skipIntervals[0] === 15;
  }, null, { timeout: 5000 });

  const saved = await page.evaluate(async () => {
    const stored = await chrome.storage.local.get("skipIntervals");
    return stored.skipIntervals;
  });
  assert(
    JSON.stringify(saved) === JSON.stringify([15, 10, 30]),
    `expected skipIntervals [15,10,30] after preset click, got ${JSON.stringify(saved)}`,
  );

  console.log("options Skip intervals UI tests passed.");
} finally {
  await context.close();
  rmSync(PROFILE, { recursive: true, force: true });
}
