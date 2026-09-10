/**
 * Onboarding DOM tests for unbound Add → browser shortcuts (#18).
 * Seam: onboarding page UI (chrome-extension://…/onboarding/onboarding.html).
 *
 * Unbound dashed "add" chips open chrome://extensions/shortcuts, matching
 * the existing Shortcuts CTAs. Suggested (dimmed) chords are out of scope.
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
const PROFILE = mkdtempSync(join(tmpdir(), "playbackkeys-onboarding-unbound-add-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const SHORTCUTS_URL = "chrome://extensions/shortcuts";

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
  await page.goto(`chrome-extension://${extensionId}/onboarding/onboarding.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#ob-shortcut-list .ob-sc-row", { timeout: 10000 });

  await page.evaluate(() => {
    window.__pkOpenedShortcutUrls = [];
    chrome.tabs.create = (createProperties, callback) => {
      window.__pkOpenedShortcutUrls.push(createProperties?.url || "");
      if (typeof callback === "function") callback({ id: -1 });
      return Promise.resolve({ id: -1 });
    };
  });

  const openedUrls = async () =>
    page.evaluate(() => window.__pkOpenedShortcutUrls?.slice() || []);

  const hasUnbound = await page.evaluate(() =>
    Boolean(document.querySelector("#ob-shortcut-list .ob-sc-row.is-unbound .kbd-chord.unbound")),
  );
  assert(hasUnbound, "expected at least one unbound Add chip in onboarding");

  await page.locator("#ob-shortcut-list .ob-sc-row.is-unbound .kbd-chord.unbound").first().click();
  let urls = await openedUrls();
  assert(
    urls.length === 1 && urls[0] === SHORTCUTS_URL,
    `onboarding unbound Add must open ${SHORTCUTS_URL}, got ${JSON.stringify(urls)}`,
  );

  // Existing CTA still works and shares the same destination.
  await page.locator("#ob-open-shortcuts").click();
  urls = await openedUrls();
  assert(
    urls.length === 2 && urls[1] === SHORTCUTS_URL,
    `onboarding Shortcuts CTA must still open ${SHORTCUTS_URL}, got ${JSON.stringify(urls)}`,
  );

  console.log("onboarding unbound Add → shortcuts UI tests passed.");
} finally {
  await context.close();
  rmSync(PROFILE, { recursive: true, force: true });
}
