import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed. Run `npm install` once, then `npm run smoke`.");
  process.exit(1);
}

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const WATCH_FIXTURE = readFileSync(join(ROOT, "tests/fixtures/video-page.html"), "utf8");
const MINI_FIXTURE = readFileSync(join(ROOT, "tests/fixtures/mini-player-page.html"), "utf8");
// Long fixture so three Skip intervals (defaults 5/10/30) can seek without clamping.
const SAMPLE_MP4 = readFileSync(join(ROOT, "tests/fixtures/sample-long.mp4"));
const SMOKE_ROOT = mkdtempSync(join(tmpdir(), "playbackkeys-smoke-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function fixtureFor(urlString) {
  const url = new URL(urlString);
  const path = url.pathname;
  const isWatch =
    path.startsWith("/video/") ||
    path.startsWith("/list/") ||
    path.startsWith("/bangumi/play/");

  if (url.hostname.includes("youtube.com") && path === "/") return WATCH_FIXTURE;
  if (isWatch) return WATCH_FIXTURE;
  if (path === "/" || path.startsWith("/space/")) return MINI_FIXTURE;
  return WATCH_FIXTURE;
}

const userDataDir = join(SMOKE_ROOT, "profile");
const context = await chromium.launchPersistentContext(userDataDir, {
  headless: false,
  ignoreHTTPSErrors: true,
  args: [
    `--disable-extensions-except=${ROOT}`,
    `--load-extension=${ROOT}`,
    "--autoplay-policy=no-user-gesture-required",
    "--ignore-certificate-errors",
    "--no-proxy-server",
  ],
});

// Fulfill Built-in host navigations locally so smoke never hits the network,
// live Bilibili/YouTube, or a system HTTPS interceptor.
// Chromium media always requests Range: bytes=0-; without a real 206 /
// Accept-Ranges response, seekable stays [0,0] and currentTime seeks no-op.
await context.route(/https?:\/\/www\.(youtube|bilibili)\.com\/.*/, async (route) => {
  const reqUrl = route.request().url();
  const url = new URL(reqUrl);
  if (url.pathname === "/sample.mp4") {
    const range = route.request().headers()["range"];
    if (range) {
      const match = /bytes=(\d+)-(\d*)/.exec(range);
      const start = Number(match?.[1] || 0);
      const end = match?.[2] ? Number(match[2]) : SAMPLE_MP4.length - 1;
      const slice = SAMPLE_MP4.subarray(start, end + 1);
      await route.fulfill({
        status: 206,
        contentType: "video/mp4",
        body: slice,
        headers: {
          "accept-ranges": "bytes",
          "content-range": `bytes ${start}-${end}/${SAMPLE_MP4.length}`,
          "content-length": String(slice.length),
          "access-control-allow-origin": "*",
        },
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "video/mp4",
      body: SAMPLE_MP4,
      headers: {
        "accept-ranges": "bytes",
        "content-length": String(SAMPLE_MP4.length),
        "access-control-allow-origin": "*",
      },
    });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: fixtureFor(reqUrl),
  });
});

async function waitForWorker() {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 10000 });
  return worker;
}

function extensionIdFromWorker(worker) {
  return new URL(worker.url()).host;
}

async function openFixture(hostPath) {
  const page = await context.newPage();
  // hostPath is like "www.youtube.com/" or "www.bilibili.com/video/BVtest/"
  const url = `https://${hostPath.replace(/^https?:\/\//, "")}`;
  await page.goto(url, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("video");
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1;
  }, null, { timeout: 10000 }).catch(() => {});
  return page;
}

// MV3 service workers cannot reliably message themselves; keep one extension
// page open and send from there so worker onMessage handlers actually run.
let extensionSender;
async function ensureExtensionSender(worker) {
  if (extensionSender && !extensionSender.isClosed()) return extensionSender;
  const id = extensionIdFromWorker(worker);
  extensionSender = await context.newPage();
  await extensionSender.goto(`chrome-extension://${id}/popup/popup.html`);
  return extensionSender;
}

async function dispatchCommand(worker, command) {
  const sender = await ensureExtensionSender(worker);
  return sender.evaluate(async (cmd) => {
    return chrome.runtime.sendMessage({
      type: "playbackkeys:dispatch-command",
      command: cmd,
    });
  }, command);
}

async function getStatus(worker) {
  const sender = await ensureExtensionSender(worker);
  return sender.evaluate(async () => {
    return chrome.runtime.sendMessage({ type: "playbackkeys:get-status" });
  });
}

async function sendCommandPayload(worker, pageUrl, payload, showToast = true) {
  return worker.evaluate(async ({ targetUrl, payload, showToast }) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((candidate) => candidate.url === targetUrl);
    if (!tab?.id) return { ok: false, reason: "tab-not-found" };
    const message = {
      type: "playbackkeys:command",
      payload,
      showToast,
      prefs: {
        showToast,
        showBadge: true,
        toastDurationMs: 1500,
        themeMode: "system",
      },
    };
    try {
      return await chrome.tabs.sendMessage(tab.id, message);
    } catch {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content/bridge.js"],
        world: "ISOLATED",
      });
      await chrome.scripting.executeScript({
        target: { tabId: tab.id, allFrames: true },
        files: ["content/bilibili-adapter.js", "content/injected.js"],
        world: "MAIN",
      });
      return await chrome.tabs.sendMessage(tab.id, message);
    }
  }, { targetUrl: pageUrl, payload, showToast });
}

async function readVideo(page) {
  return page.$eval("video", (video) => ({
    paused: video.paused,
    currentTime: video.currentTime,
    playbackRate: video.playbackRate,
  }));
}

async function toastVisible(page) {
  return page.evaluate(() => {
    const host = document.querySelector("[data-playbackkeys]");
    if (!host?.shadowRoot) return false;
    const toast = host.shadowRoot.querySelector(".pk-toast");
    return !!(toast && toast.classList.contains("on"));
  });
}

async function waitForToast(page) {
  await page.waitForFunction(() => {
    const host = document.querySelector("[data-playbackkeys]");
    const toast = host?.shadowRoot?.querySelector(".pk-toast");
    return !!(toast && toast.classList.contains("on"));
  }, null, { timeout: 3000 });
}

try {
  const worker = await waitForWorker();

  // --- YouTube regression: Built-in host still accepts speed via content path ---
  {
    const page = await openFixture("www.youtube.com/");
    const resp = await sendCommandPayload(worker, page.url(), {
      action: "speed",
      delta: 0.25,
      min: 0.25,
      max: 4,
      wrap: false,
    }, false);
    assert(resp?.result?.handled === true, `youtube speed should report handled, got ${JSON.stringify(resp)}`);
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25);
    const rate = await page.$eval("video", (video) => video.playbackRate);
    assert(rate === 1.25, `youtube expected playbackRate 1.25, got ${rate}`);
    await page.close();
    console.log("✓ YouTube Built-in speed regression");
  }

  // --- Bilibili watch paths: generic drive for toggle / seek / speed / reset + toast ---
  const watchPaths = [
    "www.bilibili.com/video/BVtest/",
    "www.bilibili.com/list/mltest/",
    "www.bilibili.com/bangumi/play/ss1/",
  ];

  for (const watchPath of watchPaths) {
    const page = await openFixture(watchPath);

    // Targeting: watch tab with a <video> is a valid target.
    await page.bringToFront();
    const status = await getStatus(worker);
    assert(status?.url === page.url(), `expected target ${page.url()}, got ${status?.url}`);
    assert(
      status?.status && typeof status.status.currentSpeed === "number",
      `watch path ${watchPath} should expose video status`,
    );

    // Speed up
    let resp = await sendCommandPayload(worker, page.url(), {
      action: "speed",
      delta: 0.25,
      min: 0.25,
      max: 4,
      wrap: false,
    }, true);
    assert(resp?.result?.handled === true, `${watchPath} speed should be handled`);
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25);
    assert((await readVideo(page)).playbackRate === 1.25, `${watchPath} speed did not stick`);
    await waitForToast(page);
    assert(await toastVisible(page), `${watchPath} speed should show toast`);

    // Reset speed
    resp = await sendCommandPayload(worker, page.url(), { action: "speed", reset: true }, true);
    assert(resp?.result?.handled === true, `${watchPath} reset should be handled`);
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1);
    assert((await readVideo(page)).playbackRate === 1, `${watchPath} reset did not stick`);

    // Seek forward from a known position so a 2s fixture cannot clamp the delta away.
    await page.$eval("video", (video) => {
      video.pause();
      video.currentTime = 0;
    });
    await page.waitForFunction(() => document.querySelector("video").currentTime < 0.1);
    resp = await sendCommandPayload(worker, page.url(), { action: "seek", delta: 1 }, true);
    assert(resp?.result?.handled === true, `${watchPath} seek should be handled`);
    await page.waitForFunction(() => document.querySelector("video").currentTime >= 0.9);
    assert((await readVideo(page)).currentTime >= 0.9, `${watchPath} seek did not move`);

    // Toggle play/pause: ensure known paused state first, then play, then pause.
    await page.$eval("video", (video) => { video.pause(); });
    resp = await sendCommandPayload(worker, page.url(), { action: "toggle" }, true);
    assert(resp?.result?.handled === true, `${watchPath} toggle(play) should be handled`);
    await page.waitForFunction(() => !document.querySelector("video").paused);
    assert(!(await readVideo(page)).paused, `${watchPath} toggle did not play`);
    await waitForToast(page);
    assert(await toastVisible(page), `${watchPath} toggle should show toast`);

    resp = await sendCommandPayload(worker, page.url(), { action: "toggle" }, true);
    assert(resp?.result?.handled === true, `${watchPath} toggle(pause) should be handled`);
    await page.waitForFunction(() => document.querySelector("video").paused);
    assert((await readVideo(page)).paused, `${watchPath} toggle did not pause`);

    // Worker dispatch path (pickTargetTab → command) also works on the active watch tab.
    await page.bringToFront();
    await dispatchCommand(worker, "2-speed-up");
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25);
    assert((await readVideo(page)).playbackRate === 1.25, `${watchPath} worker dispatch speed failed`);

    await page.close();
    console.log(`✓ Bilibili watch ${watchPath}`);
  }

  // --- Non-watch Bilibili paths must not be targeted even with a playing mini-player ---
  for (const nonWatch of ["www.bilibili.com/", "www.bilibili.com/space/123/"]) {
    const page = await openFixture(nonWatch);
    await page.bringToFront();

    // Give the mini-player a moment to start (autoplay).
    await sleep(300);

    const status = await getStatus(worker);
    assert(
      !status || status.url !== page.url(),
      `non-watch ${nonWatch} must not be targeted, got ${JSON.stringify(status && { url: status.url, status: status.status })}`,
    );

    const before = await readVideo(page);
    await dispatchCommand(worker, "2-speed-up");
    await sleep(400);
    const after = await readVideo(page);
    assert(
      after.playbackRate === before.playbackRate,
      `non-watch ${nonWatch} must not change rate (was ${before.playbackRate}, now ${after.playbackRate})`,
    );

    await page.close();
    console.log(`✓ Bilibili non-watch ignored ${nonWatch}`);
  }

  // --- Skip intervals (#10): migration + each interval Command seeks its delta ---
  {
    const sender = await ensureExtensionSender(worker);
    // Legacy seekSeconds migrates to interval 1; 2/3 default to 10/30.
    await sender.evaluate(async () => {
      await chrome.storage.local.clear();
      await chrome.storage.local.set({ seekSeconds: 15 });
    });
    // Touch getSettings via a no-op dispatch path (needs a target tab).
    const page = await openFixture("www.youtube.com/");
    await page.bringToFront();
    await dispatchCommand(worker, "6-speed-reset");
    const migrated = await sender.evaluate(async () => chrome.storage.local.get(["skipIntervals", "seekSeconds"]));
    assert(
      JSON.stringify(migrated.skipIntervals) === JSON.stringify([15, 10, 30]),
      `expected skipIntervals [15,10,30] after seekSeconds migration, got ${JSON.stringify(migrated.skipIntervals)}`,
    );
    console.log("✓ Skip interval seekSeconds → skipIntervals migration");

    // Distinct intervals; Commands must seek the matching delta.
    await sender.evaluate(async () => {
      await chrome.storage.local.set({ skipIntervals: [5, 10, 30] });
    });

    const cases = [
      ["3-skip-back", -5],
      ["4-skip-forward", 5],
      ["8-skip-back-2", -10],
      ["9-skip-forward-2", 10],
      ["10-skip-back-3", -30],
      ["11-skip-forward-3", 30],
    ];

    const cmds = await sender.evaluate(async () => {
      const all = await chrome.commands.getAll();
      return all.map((c) => c.name).filter((n) => n !== "_execute_action").sort();
    });
    for (const [cmd] of cases) {
      assert(cmds.includes(cmd), `manifest/chrome.commands missing ${cmd}; have ${cmds.join(",")}`);
    }
    console.log("✓ Skip interval Commands registered (1/2/3)");

    for (const [cmd, delta] of cases) {
      await page.$eval("video", (video) => {
        video.pause();
        video.currentTime = 40;
      });
      await page.waitForFunction(() => Math.abs(document.querySelector("video").currentTime - 40) < 0.25);
      await page.bringToFront();
      await dispatchCommand(worker, cmd);
      const expected = 40 + delta;
      await page.waitForFunction(
        (target) => Math.abs(document.querySelector("video").currentTime - target) < 0.35,
        expected,
        { timeout: 3000 },
      );
      const time = (await readVideo(page)).currentTime;
      assert(
        Math.abs(time - expected) < 0.35,
        `${cmd} expected ~${expected}s, got ${time}`,
      );
    }
    await page.close();
    console.log("✓ Skip interval Commands seek expected deltas");
  }

  console.log("PlaybackKeys smoke test passed.");
} finally {
  await context.close();
  rmSync(SMOKE_ROOT, { recursive: true, force: true });
}
