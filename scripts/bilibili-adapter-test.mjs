/**
 * Adapter-seam tests for the Bilibili watch-page adapter (#8).
 * Talks only to PlaybackKeysBilibili — no extension worker, no live Bilibili.
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
const ADAPTER = readFileSync(join(ROOT, "content/bilibili-adapter.js"), "utf8");
const WATCH_FIXTURE = readFileSync(join(ROOT, "tests/fixtures/video-page.html"), "utf8");
const MINI_FIXTURE = readFileSync(join(ROOT, "tests/fixtures/mini-player-page.html"), "utf8");
const SAMPLE_MP4 = readFileSync(join(ROOT, "tests/fixtures/sample.mp4"));
const SMOKE_ROOT = mkdtempSync(join(tmpdir(), "playbackkeys-bilibili-adapter-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixtureFor(urlString) {
  const path = new URL(urlString).pathname;
  const isWatch =
    path.startsWith("/video/") ||
    path.startsWith("/list/") ||
    path.startsWith("/bangumi/play/");
  if (isWatch) return WATCH_FIXTURE;
  return MINI_FIXTURE;
}

const context = await chromium.launchPersistentContext(join(SMOKE_ROOT, "profile"), {
  headless: true,
  args: ["--autoplay-policy=no-user-gesture-required", "--no-proxy-server"],
});

await context.route(/https?:\/\/www\.bilibili\.com\/.*/, async (route) => {
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

async function openPage(hostPath) {
  const page = await context.newPage();
  await page.goto(`https://${hostPath.replace(/^https?:\/\//, "")}`, {
    waitUntil: "domcontentloaded",
  });
  await page.addScriptTag({ content: ADAPTER });
  return page;
}

async function openWatchWithPlayer(hostPath) {
  const page = await openPage(hostPath);
  await page.waitForSelector("video");
  await page.waitForFunction(() => {
    const v = document.querySelector("video");
    return v && v.readyState >= 1;
  }, null, { timeout: 10000 });

  // Stub Hostile player: owns play/pause/seek, syncs to the media node so
  // Controllable-video state stays observable; records invocations for asserts.
  await page.evaluate(() => {
    const video = document.querySelector("video");
    const calls = { play: 0, pause: 0, seek: [] };
    window.player = {
      play() {
        calls.play += 1;
        video.play().catch(() => {});
      },
      pause() {
        calls.pause += 1;
        video.pause();
      },
      seek(seconds) {
        calls.seek.push(seconds);
        video.currentTime = seconds;
      },
    };
    window.__pkPlayerCalls = calls;
  });
  return page;
}

const MESSAGES = {
  toastPlaying: "Playing",
  toastPaused: "Paused",
  toastResetTo1x: "Reset to 1×",
};

try {
  // --- Path gating ---
  {
    const page = await openPage("www.bilibili.com/video/BVtest/");
    const inScope = await page.evaluate(() => PlaybackKeysBilibili.isWatchPage(location));
    assert(inScope === true, "/video/ should be in-scope");
    await page.close();
  }
  {
    const page = await openPage("www.bilibili.com/list/mltest/");
    assert(await page.evaluate(() => PlaybackKeysBilibili.isWatchPage(location)) === true, "/list/ in-scope");
    await page.close();
  }
  {
    const page = await openPage("www.bilibili.com/bangumi/play/ss1/");
    assert(await page.evaluate(() => PlaybackKeysBilibili.isWatchPage(location)) === true, "/bangumi/play/ in-scope");
    await page.close();
  }
  {
    const page = await openPage("www.bilibili.com/");
    assert(await page.evaluate(() => PlaybackKeysBilibili.isBilibiliHost(location)) === true, "/ is bilibili host");
    assert(await page.evaluate(() => PlaybackKeysBilibili.isWatchPage(location)) === false, "/ not in-scope");
    assert(await page.evaluate(() => PlaybackKeysBilibili.hasControllableVideo()) === false, "/ must not claim Controllable video");
    assert(
      (await page.evaluate(() => PlaybackKeysBilibili.applyCommand({ action: "toggle" }))).handled === false,
      "/ must not handle Commands",
    );
    await page.close();
  }
  {
    const page = await openPage("www.bilibili.com/space/123/");
    assert(await page.evaluate(() => PlaybackKeysBilibili.isWatchPage(location)) === false, "/space/ not in-scope");
    assert(await page.evaluate(() => PlaybackKeysBilibili.hasControllableVideo()) === false, "/space/ must not claim Controllable video");
    assert(
      (await page.evaluate(() => PlaybackKeysBilibili.applyCommand({ action: "speed", delta: 0.25 }))).handled === false,
      "/space/ must not handle Commands",
    );
    await page.close();
  }
  console.log("✓ path gating");

  // --- Controllable video on watch fixtures ---
  for (const watchPath of [
    "www.bilibili.com/video/BVtest/",
    "www.bilibili.com/list/mltest/",
    "www.bilibili.com/bangumi/play/ss1/",
  ]) {
    const page = await openWatchWithPlayer(watchPath);
    const present = await page.evaluate(() => PlaybackKeysBilibili.hasControllableVideo());
    assert(present === true, `${watchPath} should have Controllable video`);
    await page.close();
  }
  console.log("✓ Controllable video present on watch paths");

  // --- Hybrid drive: play/pause/seek via window.player; rate on media node ---
  for (const watchPath of [
    "www.bilibili.com/video/BVtest/",
    "www.bilibili.com/list/mltest/",
    "www.bilibili.com/bangumi/play/ss1/",
  ]) {
    const page = await openWatchWithPlayer(watchPath);

    await page.evaluate(() => {
      const v = document.querySelector("video");
      v.pause();
    });

    let result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, `${watchPath} toggle(play) should be handled`);
    assert(result?.toast?.name === "Playing", `${watchPath} toggle play toast, got ${JSON.stringify(result)}`);
    await page.waitForFunction(() => !document.querySelector("video").paused);
    let calls = await page.evaluate(() => window.__pkPlayerCalls);
    assert(calls.play >= 1, `${watchPath} toggle(play) must invoke window.player.play`);

    result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, `${watchPath} toggle(pause) should be handled`);
    assert(result?.toast?.name === "Paused", `${watchPath} toggle pause toast`);
    await page.waitForFunction(() => document.querySelector("video").paused);
    calls = await page.evaluate(() => window.__pkPlayerCalls);
    assert(calls.pause >= 1, `${watchPath} toggle(pause) must invoke window.player.pause`);

    await page.evaluate(() => {
      document.querySelector("video").currentTime = 0;
      window.__pkPlayerCalls.seek = [];
    });
    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({ action: "seek", delta: 1 });
    });
    assert(result?.handled === true, `${watchPath} seek should be handled`);
    await page.waitForFunction(() => document.querySelector("video").currentTime >= 0.9);
    calls = await page.evaluate(() => window.__pkPlayerCalls);
    assert(calls.seek.length >= 1, `${watchPath} seek must invoke window.player.seek`);
    assert(calls.seek[0] >= 0.9, `${watchPath} player.seek target should be ~1s, got ${calls.seek[0]}`);

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert(result?.handled === true, `${watchPath} speed should be handled`);
    const rate = await page.$eval("video", (v) => v.playbackRate);
    assert(rate === 1.25, `${watchPath} rate must be written on media node, got ${rate}`);
    // Speed must not go through player API.
    const playerHasSpeed = await page.evaluate(() => typeof window.player.speed === "function" || typeof window.player.setSpeed === "function");
    assert(playerHasSpeed === false, `${watchPath} fixture player should not expose speed (rate stays on media node)`);

    result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "speed", reset: true }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, `${watchPath} reset should be handled`);
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1, `${watchPath} reset writes 1× on media node`);

    result = await page.evaluate(() => PlaybackKeysBilibili.applyCommand({ action: "status" }));
    assert(result?.handled === true && result.status, `${watchPath} status should return fields`);
    assert(typeof result.status.currentSpeed === "number", `${watchPath} status.currentSpeed`);
    assert(typeof result.status.paused === "boolean", `${watchPath} status.paused`);

    await page.close();
    console.log(`✓ hybrid drive ${watchPath}`);
  }

  // --- Missing window.player: transport falls back to media node ---
  {
    const page = await openPage("www.bilibili.com/video/BVtest/");
    await page.waitForSelector("video");
    await page.waitForFunction(() => document.querySelector("video").readyState >= 1);
    await page.evaluate(() => {
      delete window.player;
      const v = document.querySelector("video");
      v.pause();
    });

    let result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "toggle without player should still handle");
    await page.waitForFunction(() => !document.querySelector("video").paused);
    assert(!(await page.$eval("video", (v) => v.paused)), "fallback play on media node");

    result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "pause without player should handle");
    await page.waitForFunction(() => document.querySelector("video").paused);

    await page.evaluate(() => { document.querySelector("video").currentTime = 0; });
    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({ action: "seek", delta: 1 });
    });
    assert(result?.handled === true, "seek without player should handle");
    await page.waitForFunction(() => document.querySelector("video").currentTime >= 0.9);

    await page.close();
    console.log("✓ fallback transport without window.player");
  }

  console.log("Bilibili adapter tests passed.");
} finally {
  await context.close();
  rmSync(SMOKE_ROOT, { recursive: true, force: true });
}
