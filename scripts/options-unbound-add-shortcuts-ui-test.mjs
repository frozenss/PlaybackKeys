/**
 * Options-page DOM tests for unbound Add → browser shortcuts (#18).
 * Seam: options page UI (chrome-extension://…/options/options.html).
 *
 * Unbound dashed "add" chips open chrome://extensions/shortcuts (same as the
 * Shortcuts CTA). Bound Command rows stay read-only. Shortcuts section
 * clarifies that browser "Activate the extension" only opens the popup.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
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
const PROFILE = mkdtempSync(join(tmpdir(), "playbackkeys-options-unbound-add-"));

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
  await page.goto(`chrome-extension://${extensionId}/options/options.html`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector("#shortcut-list .shortcut-row", { timeout: 10000 });

  const installTabsCreateSpy = async () => {
    await page.evaluate(() => {
      window.__pkOpenedShortcutUrls = [];
      const original = chrome.tabs.create.bind(chrome.tabs);
      chrome.tabs.create = (createProperties, callback) => {
        window.__pkOpenedShortcutUrls.push(createProperties?.url || "");
        if (typeof callback === "function") callback({ id: -1 });
        return Promise.resolve({ id: -1 });
      };
      window.__pkTabsCreateOriginal = original;
    });
  };

  const openedUrls = async () =>
    page.evaluate(() => window.__pkOpenedShortcutUrls?.slice() || []);

  await installTabsCreateSpy();

  const snapshot = await page.evaluate(() => {
    const unboundAdd = document.querySelector(
      "#shortcut-list .shortcut-row.is-unbound .kbd-chord.unbound",
    );
    const boundChord = document.querySelector(
      "#shortcut-list .shortcut-row:not(.is-unbound) .kbd-chord:not(.unbound)",
    );
    const note = document.getElementById("activate-extension-note");
    const noteText = (note?.textContent || "").trim();
    return {
      hasUnboundAdd: Boolean(unboundAdd),
      hasBoundChord: Boolean(boundChord),
      notePresent: Boolean(note),
      noteText,
      noteI18nKey: note?.dataset?.i18n || "",
      unboundIsButton:
        unboundAdd?.getAttribute("role") === "button" ||
        unboundAdd?.closest("button, a, [role='button']") != null,
      boundIsButtonOrLink:
        boundChord?.closest("button, a, [role='button']") != null ||
        boundChord?.tagName === "BUTTON" ||
        boundChord?.tagName === "A",
    };
  });

  assert(snapshot.hasUnboundAdd, "expected at least one unbound Add chip in Shortcuts");
  assert(snapshot.hasBoundChord, "expected at least one bound Command chord in Shortcuts");
  assert(
    snapshot.notePresent &&
      snapshot.noteI18nKey === "activateExtensionNote" &&
      snapshot.noteText.length > 0,
    "Shortcuts must render the Activate-the-extension clarification note",
  );
  // Spec phrases live in the English source message (browser UI locale may differ).
  const enNote = JSON.parse(
    readFileSync(join(ROOT, "_locales/en/messages.json"), "utf8"),
  ).activateExtensionNote.message;
  assert(
    /Activate the extension/i.test(enNote) &&
      /popup/i.test(enNote) &&
      /Opt-in/i.test(enNote) &&
      /master switch/i.test(enNote),
    "en activateExtensionNote must clarify popup-only (not Opt-in, not Command master switch)",
  );
  assert(snapshot.unboundIsButton, "unbound Add chip must be an accessible control");
  assert(
    snapshot.boundIsButtonOrLink === false,
    "bound Command chords must remain read-only displays (not buttons/links)",
  );

  // Click unbound Add → same destination as the Shortcuts CTA.
  await page.locator("#shortcut-list .shortcut-row.is-unbound .kbd-chord.unbound").first().click();
  let urls = await openedUrls();
  assert(
    urls.length === 1 && urls[0] === SHORTCUTS_URL,
    `unbound Add must open ${SHORTCUTS_URL}, got ${JSON.stringify(urls)}`,
  );

  // Bound rows must not open the shortcuts page when clicked.
  await page.locator("#shortcut-list .shortcut-row:not(.is-unbound) .kbd-chord").first().click();
  urls = await openedUrls();
  assert(
    urls.length === 1,
    `bound chord click must not open shortcuts (still ${JSON.stringify(urls)})`,
  );

  // Existing CTA still works.
  await page.locator("#open-shortcuts").click();
  urls = await openedUrls();
  assert(
    urls.length === 2 && urls[1] === SHORTCUTS_URL,
    `Shortcuts CTA must still open ${SHORTCUTS_URL}, got ${JSON.stringify(urls)}`,
  );

  console.log("options unbound Add → shortcuts UI tests passed.");
} finally {
  await context.close();
  rmSync(PROFILE, { recursive: true, force: true });
}
