import { createServer } from "node:https";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run `npm install` once, then `npm run smoke`.");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = readFileSync(join(ROOT, "tests/fixtures/video-page.html"), "utf8");
const TMP = join(ROOT, ".tmp-smoke");
const KEY = join(TMP, "localhost-key.pem");
const CERT = join(TMP, "localhost-cert.pem");

function ensureCertificate() {
  if (existsSync(KEY) && existsSync(CERT)) return;
  mkdirSync(TMP, { recursive: true });
  execFileSync("openssl", [
    "req",
    "-x509",
    "-newkey", "rsa:2048",
    "-nodes",
    "-sha256",
    "-days", "1",
    "-keyout", KEY,
    "-out", CERT,
    "-subj", "/CN=www.youtube.com",
    "-addext", "subjectAltName=DNS:www.youtube.com",
  ], { stdio: "ignore" });
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

ensureCertificate();
const server = createServer({
  key: readFileSync(KEY),
  cert: readFileSync(CERT),
}, (req, res) => {
  if (req.url !== "/") {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(FIXTURE);
});

const port = await listen(server);
const userDataDir = join(ROOT, ".tmp-smoke-profile");
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    `--host-resolver-rules=MAP www.youtube.com 127.0.0.1`,
    "--ignore-certificate-errors",
  ],
});

try {
  const page = await context.newPage();
  await page.goto(`https://www.youtube.com:${port}/`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("video");

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 5000 });

  const changed = await worker.evaluate(async (targetUrl) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url === targetUrl);
    if (!tab?.id) return false;
    const message = {
      type: "playbackkeys:command",
      payload: { action: "speed", delta: 0.25, min: 0.25, max: 4, wrap: false },
      showToast: false,
      prefs: { showToast: false, showBadge: true, toastDurationMs: 1500 },
    };
    try {
      await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content/bridge.js"],
        world: "ISOLATED",
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content/injected.js"],
        world: "MAIN",
      });
      await chrome.tabs.sendMessage(tab.id, message);
    }
    return true;
  }, page.url());
  if (!changed) throw new Error("service worker did not dispatch the speed command");

  await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25);
  const rate = await page.$eval("video", (video) => video.playbackRate);
  if (rate !== 1.25) throw new Error(`expected playbackRate 1.25, got ${rate}`);

  console.log("PlaybackKeys smoke test passed.");
} finally {
  await context.close();
  server.close();
}
