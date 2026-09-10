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
const CUSTOM_MEDIA_FIXTURE = readFileSync(join(ROOT, "tests/fixtures/bilibili-custom-media.html"), "utf8");
const MINI_FIXTURE = readFileSync(join(ROOT, "tests/fixtures/mini-player-page.html"), "utf8");
const SAMPLE_MP4 = readFileSync(join(ROOT, "tests/fixtures/sample.mp4"));
const SMOKE_ROOT = mkdtempSync(join(tmpdir(), "playbackkeys-bilibili-adapter-"));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function fixtureFor(urlString) {
  const path = new URL(urlString).pathname;
  // Custom-media watch fixture: site element only, no scorable <video> (#4).
  if (path.startsWith("/video/BVcustom")) return CUSTOM_MEDIA_FIXTURE;
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

async function openCustomMediaWithPlayer(hostPath) {
  const page = await openPage(hostPath);
  await page.waitForSelector("bwp-video");
  await page.waitForFunction(() => customElements.get("bwp-video"));

  // Hybrid stub: transport via window.player, rate on the custom media element.
  await page.evaluate(() => {
    const media = document.querySelector("bwp-video");
    const calls = { play: 0, pause: 0, seek: [] };
    window.player = {
      play() {
        calls.play += 1;
        media.play();
      },
      pause() {
        calls.pause += 1;
        media.pause();
      },
      seek(seconds) {
        calls.seek.push(seconds);
        media.currentTime = seconds;
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

    // Skip burst toast payload from the service worker must win over raw delta (#11).
    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "seek",
        delta: 10,
        burstToast: { ic: "»", name: "+30s", det: "" },
        toastHideMs: 2000,
      });
    });
    assert(result?.handled === true, `${watchPath} burst seek handled`);
    assert(result?.toast?.name === "+30s", `${watchPath} burstToast must override delta toast`);
    assert(result?.toast?.hideMs === 2000, `${watchPath} toastHideMs must pass through`);

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

  // --- Sticky desired rate (#3): survives Hostile 1× snap well past 5s ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVsticky/?cid=1");

    const sped = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert(sped?.handled === true, "sticky: speed Command should be handled");
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1.25, "sticky: rate after Command");

    // Hostile login-wall snap back to 1× (immediate).
    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25, null, {
      timeout: 2000,
    });
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1.25,
      "sticky: desired rate restored after immediate Hostile snap",
    );

    // Well past the generic ~5s window: snap again and still stick.
    await page.waitForTimeout(5500);
    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25, null, {
      timeout: 2000,
    });
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1.25,
      "sticky: desired rate still restored well past 5s",
    );

    await page.close();
    console.log("✓ sticky desired rate past Hostile snap (>5s)");
  }

  // --- Reset clears stickiness; later Hostile 1× is left alone ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVreset/?cid=1");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.5,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1.5, "reset-case: sped to 1.5×");

    const reset = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "speed", reset: true }, { messages });
    }, MESSAGES);
    assert(reset?.handled === true, "reset should be handled");
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1, "reset writes 1×");

    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForTimeout(600);
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1,
      "after reset, Hostile 1× must be left alone (no re-apply)",
    );

    // Speeding up again re-arms stickiness.
    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25, null, {
      timeout: 2000,
    });
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1.25,
      "speed after reset re-arms sticky rate",
    );

    await page.close();
    console.log("✓ reset clears stickiness");
  }

  // --- Same BV+cid, new media node: desired rate moves without another Command ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVswap/?cid=9");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.75,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1.75, "swap: initial rate 1.75×");

    // Quality/codec swap: replace the media node, keep URL identity.
    await page.evaluate(() => {
      const old = document.querySelector("video");
      const next = document.createElement("video");
      next.id = "pk-video-swapped";
      next.src = old.currentSrc || old.src;
      next.muted = true;
      next.controls = true;
      next.style.width = "640px";
      next.style.height = "360px";
      old.replaceWith(next);
      // Re-point Hostile player at the new node.
      const calls = window.__pkPlayerCalls;
      window.player = {
        play() { calls.play += 1; next.play().catch(() => {}); },
        pause() { calls.pause += 1; next.pause(); },
        seek(seconds) { calls.seek.push(seconds); next.currentTime = seconds; },
      };
    });

    await page.waitForSelector("#pk-video-swapped");
    await page.waitForFunction(() => {
      const v = document.querySelector("video");
      return v && v.id === "pk-video-swapped" && v.readyState >= 1;
    }, null, { timeout: 10000 });

    // No new speed Command — sticky rate should land on the new node.
    await page.waitForFunction(() => {
      const v = document.querySelector("#pk-video-swapped");
      return v && v.playbackRate === 1.75;
    }, null, { timeout: 3000 });
    assert(
      (await page.$eval("#pk-video-swapped", (v) => v.playbackRate)) === 1.75,
      "swap: desired rate applied to new Controllable video",
    );

    // Hostile snap on the new node still loses.
    await page.evaluate(() => {
      document.querySelector("#pk-video-swapped").playbackRate = 1;
    });
    await page.waitForFunction(() => document.querySelector("#pk-video-swapped").playbackRate === 1.75, null, {
      timeout: 2000,
    });

    await page.close();
    console.log("✓ same-identity media node swap keeps rate");
  }

  // --- New BV or cid: desired rate cleared; no re-apply on the new identity ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVold/?cid=1");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 1,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 2, "identity: armed at 2×");

    // In-page identity change (cid). Rebind of *control* is #6; this ticket
    // only requires sticky rate to stop re-applying the previous watch's rate.
    await page.evaluate(() => {
      history.pushState({}, "", "/video/BVold/?cid=2");
      window.dispatchEvent(new PopStateEvent("popstate"));
      // New identity's media starts at 1× (as a fresh watch would).
      document.querySelector("video").playbackRate = 1;
    });

    await page.waitForTimeout(600);
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1,
      "new cid: previous desired rate must not be re-applied",
    );

    // Hostile write of 1× still left alone on the new identity.
    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForTimeout(600);
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1,
      "new cid: no sticky rate until a new speed Command",
    );

    await page.close();
    console.log("✓ new cid clears desired rate");
  }

  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVone/?cid=1");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.5,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1.5, "bv-change: armed at 1.5×");

    await page.evaluate(() => {
      history.pushState({}, "", "/video/BVtwo/?cid=1");
      window.dispatchEvent(new PopStateEvent("popstate"));
      document.querySelector("video").playbackRate = 1;
    });

    await page.waitForTimeout(600);
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1,
      "new BV: previous desired rate must not be re-applied",
    );

    await page.close();
    console.log("✓ new BV clears desired rate");
  }

  // --- Re-inject must not orphan sticky state (SW probe re-executes the file) ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVreinject/?cid=1");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1.25, "re-inject: armed at 1.25×");

    // Second inject (same source the worker loads before probe/seek/status).
    await page.addScriptTag({ content: ADAPTER });

    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 1.25, null, {
      timeout: 2000,
    });
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1.25,
      "re-inject: sticky rate still owned after second script load",
    );

    const reset = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "speed", reset: true }, { messages });
    }, MESSAGES);
    assert(reset?.handled === true, "re-inject: reset handled on surviving API");
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1, "re-inject: reset writes 1×");

    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForTimeout(600);
    assert(
      (await page.$eval("video", (v) => v.playbackRate)) === 1,
      "re-inject: reset stops re-apply on surviving API",
    );

    await page.close();
    console.log("✓ re-inject keeps single sticky owner");
  }

  // --- Speed range uses global max (default 4×), not Bilibili's 2× menu ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVfast/?cid=1");

    let result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 1.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert(result?.handled === true, "above-2x: handled");
    assert((await page.$eval("video", (v) => v.playbackRate)) === 2.25, "above-2x: 2.25 exceeds Bilibili menu");

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 2,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 4, "global max 4×");

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: true,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 0.25, "wrap at max → min");

    await page.evaluate(() => {
      document.querySelector("video").playbackRate = 1;
    });
    await page.waitForFunction(() => document.querySelector("video").playbackRate === 0.25, null, {
      timeout: 2000,
    });

    await page.close();
    console.log("✓ global speed min/max/wrap (max 4×)");
  }

  // --- Custom media element as Controllable video (#4) ---
  // Fixture has only bwp-video + an unscorable leftover <video>. Generic
  // querySelectorAll("video")+score alone must not be enough to pass.
  {
    const page = await openCustomMediaWithPlayer("www.bilibili.com/video/BVcustom/");

    const probe = await page.evaluate(() => {
      function videoScore(el) {
        const r = el.getBoundingClientRect();
        if (r.width < 80 || r.height < 60) return 0;
        if (r.bottom < 0 || r.right < 0) return 0;
        if (r.top > (window.innerHeight || 1e6)) return 0;
        if (r.left > (window.innerWidth || 1e6)) return 0;
        if (el.readyState < 1 && !el.currentSrc && !el.src) return 0;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return 0;
        const area = Math.max(0, r.width) * Math.max(0, r.height);
        return (!el.paused && el.readyState > 1 ? area * 2 : area);
      }
      let best = null;
      let bestScore = 0;
      for (const video of document.querySelectorAll("video")) {
        const score = videoScore(video);
        if (score > bestScore) {
          best = video;
          bestScore = score;
        }
      }
      return {
        genericScorable: best != null,
        hasControllable: PlaybackKeysBilibili.hasControllableVideo(),
        tag: PlaybackKeysBilibili.pickControllableVideo()?.tagName || null,
      };
    });
    assert(probe.genericScorable === false, "custom fixture must have no scorable HTML <video>");
    assert(probe.hasControllable === true, "custom media element must count as Controllable video present");
    assert(probe.tag === "BWP-VIDEO", `Controllable video should be bwp-video, got ${probe.tag}`);

    await page.evaluate(() => {
      document.querySelector("bwp-video").pause();
    });

    let result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "custom: toggle(play) handled");
    assert(result?.toast?.name === "Playing", "custom: play toast");
    assert(
      (await page.$eval("bwp-video", (el) => el.paused)) === false,
      "custom: toggle play must unpause bwp-video",
    );
    let calls = await page.evaluate(() => window.__pkPlayerCalls);
    assert(calls.play >= 1, "custom: toggle(play) must invoke window.player.play");

    result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "custom: toggle(pause) handled");
    assert(
      (await page.$eval("bwp-video", (el) => el.paused)) === true,
      "custom: toggle pause must pause bwp-video",
    );
    calls = await page.evaluate(() => window.__pkPlayerCalls);
    assert(calls.pause >= 1, "custom: toggle(pause) must invoke window.player.pause");

    await page.evaluate(() => {
      document.querySelector("bwp-video").currentTime = 0;
      window.__pkPlayerCalls.seek = [];
    });
    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({ action: "seek", delta: 5 });
    });
    assert(result?.handled === true, "custom: seek handled");
    assert(
      (await page.$eval("bwp-video", (el) => el.currentTime)) >= 4.9,
      "custom: seek must change bwp-video currentTime",
    );
    calls = await page.evaluate(() => window.__pkPlayerCalls);
    assert(calls.seek.length >= 1, "custom: seek must invoke window.player.seek");

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert(result?.handled === true, "custom: speed handled");
    assert(
      (await page.$eval("bwp-video", (el) => el.playbackRate)) === 1.25,
      "custom: speed must write rate on bwp-video",
    );

    result = await page.evaluate(() => PlaybackKeysBilibili.applyCommand({ action: "status" }));
    assert(result?.handled === true && result.status, "custom: status handled");
    assert(result.status.paused === true, "custom: status.paused after pause");
    assert(result.status.currentSpeed === 1.25, "custom: status.currentSpeed");

    await page.close();
    console.log("✓ custom media element Controllable + hybrid Commands");
  }

  // Missing window.player: transport falls back onto the custom media element.
  {
    const page = await openPage("www.bilibili.com/video/BVcustom/");
    await page.waitForSelector("bwp-video");
    await page.evaluate(() => {
      delete window.player;
      document.querySelector("bwp-video").pause();
    });

    let result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "custom fallback: toggle handled");
    assert(
      (await page.$eval("bwp-video", (el) => el.paused)) === false,
      "custom fallback: play on bwp-video",
    );

    await page.evaluate(() => { document.querySelector("bwp-video").currentTime = 10; });
    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({ action: "seek", delta: -3 });
    });
    assert(result?.handled === true, "custom fallback: seek handled");
    assert(
      (await page.$eval("bwp-video", (el) => el.currentTime)) === 7,
      "custom fallback: seek on bwp-video",
    );

    await page.close();
    console.log("✓ custom media element fallback without window.player");
  }

  // --- Picture-in-Picture: same Controllable video even when the in-page box
  // is unscorable (hidden / zero-size / opacity 0). Prefer
  // document.pictureInPictureElement over generic size/opacity scoring (#5). ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVpip/");
    await page.evaluate(() => {
      const v = document.querySelector("video");
      Object.defineProperty(document, "pictureInPictureElement", {
        configurable: true,
        get() { return v; },
      });
      // Simulate the in-page box collapsing once Picture-in-Picture is open.
      v.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:0;height:0;opacity:0;visibility:hidden";
    });

    const probe = await page.evaluate(() => ({
      hasControllable: PlaybackKeysBilibili.hasControllableVideo(),
      picked: PlaybackKeysBilibili.pickControllableVideo()?.id || null,
      pipTag: document.pictureInPictureElement?.tagName || null,
    }));
    assert(probe.pipTag === "VIDEO", `Picture-in-Picture fixture must expose VIDEO, got ${probe.pipTag}`);
    assert(probe.hasControllable === true, "Picture-in-Picture: targeting must still report Controllable video");
    assert(probe.picked === "pk-video", `Picture-in-Picture: Controllable video must be the PiP node, got ${probe.picked}`);

    await page.evaluate(() => {
      const v = document.querySelector("video");
      v.pause();
      v.currentTime = 0.5;
      v.playbackRate = 1;
    });

    let result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "Picture-in-Picture: toggle must be handled");
    assert(
      (await page.$eval("video", (el) => el.paused)) === false,
      "Picture-in-Picture: toggle must play the PiP video node",
    );

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({ action: "seek", delta: 1 });
    });
    assert(result?.handled === true, "Picture-in-Picture: seek must be handled");
    assert(
      (await page.$eval("video", (el) => el.currentTime)) >= 1.4,
      "Picture-in-Picture: seek must change the PiP video node",
    );

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert(result?.handled === true, "Picture-in-Picture: speed must be handled");
    assert(
      (await page.$eval("video", (el) => el.playbackRate)) === 1.25,
      "Picture-in-Picture: speed must write rate on the PiP video node",
    );

    await page.close();
    console.log("✓ Picture-in-Picture Controllable + Commands with unscorable in-page box");
  }

  // --- Watch-page Site mini-player: small corner box on /video/ stays
  // Controllable; off-watch Site mini-player remains out of scope (#5). ---
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVmini/");
    await page.evaluate(() => {
      const v = document.querySelector("video");
      v.style.cssText = "position:fixed;right:16px;bottom:16px;width:240px;height:135px";
    });

    assert(
      (await page.evaluate(() => PlaybackKeysBilibili.hasControllableVideo())) === true,
      "watch-page Site mini-player: Controllable video present",
    );

    await page.evaluate(() => {
      document.querySelector("video").pause();
    });
    const result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "watch-page Site mini-player: toggle handled");
    assert(
      (await page.$eval("video", (el) => el.paused)) === false,
      "watch-page Site mini-player: Commands still drive the watch video",
    );
    await page.close();
  }
  {
    // Non-watch paths already load the Site mini-player fixture via fixtureFor.
    const page = await openPage("www.bilibili.com/");
    assert(
      (await page.evaluate(() => PlaybackKeysBilibili.hasControllableVideo())) === false,
      "off-watch Site mini-player on / must stay out of scope",
    );
    assert(
      (await page.evaluate(() => PlaybackKeysBilibili.applyCommand({ action: "toggle" }))).handled === false,
      "off-watch Site mini-player on / must not handle Commands",
    );
    await page.close();
  }
  console.log("✓ watch-page Site mini-player Controllable; off-watch excluded");

  // --- In-page watch-identity rebind (#6) ---
  // After pushState to a new BV/cid/episode with a new media node, the next
  // Command must drive the new Controllable video (not the detached old one),
  // and the previous watch's desired rate must not come along. No synthetic
  // popstate: real SPA navigation updates location via pushState alone.
  async function rebindToNewWatch(page, { nextPath, nextVideoId }) {
    await page.evaluate(({ nextPath, nextVideoId }) => {
      const old = document.querySelector("video");
      old.id = "pk-video-old";
      window.__pkOldVideo = old;

      history.pushState({}, "", nextPath);

      const next = document.createElement("video");
      next.id = nextVideoId;
      next.src = old.currentSrc || old.src || "/sample.mp4";
      next.muted = true;
      next.controls = true;
      next.style.width = "640px";
      next.style.height = "360px";
      next.playbackRate = 1;
      old.replaceWith(next);

      const calls = window.__pkPlayerCalls || { play: 0, pause: 0, seek: [] };
      calls.play = 0;
      calls.pause = 0;
      calls.seek = [];
      window.__pkPlayerCalls = calls;
      window.player = {
        play() { calls.play += 1; next.play().catch(() => {}); },
        pause() { calls.pause += 1; next.pause(); },
        seek(seconds) { calls.seek.push(seconds); next.currentTime = seconds; },
      };
    }, { nextPath, nextVideoId });

    await page.waitForSelector(`#${nextVideoId}`);
    await page.waitForFunction((id) => {
      const v = document.getElementById(id);
      return v && v.readyState >= 1;
    }, nextVideoId, { timeout: 10000 });
  }

  async function assertCommandsDriveNewNode(page, { label, newVideoId }) {
    // Drop window.player so toggle/seek observations hit the Controllable
    // video node itself (a player stub closed over `next` can mask a stale pick).
    await page.evaluate((id) => {
      delete window.player;
      const v = document.getElementById(id);
      v.pause();
      v.currentTime = 0.25;
      v.playbackRate = 1;
      if (window.__pkOldVideo) {
        window.__pkOldVideo.pause();
        window.__pkOldVideo.currentTime = 0.25;
        window.__pkOldVideo.playbackRate = 1;
      }
    }, newVideoId);

    assert(
      (await page.evaluate(() => PlaybackKeysBilibili.pickControllableVideo()?.id)) === newVideoId,
      `${label}: Controllable video must be the new identity's node`,
    );

    let result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, `${label}: toggle handled on new identity`);
    assert(
      (await page.$eval(`#${newVideoId}`, (v) => v.paused)) === false,
      `${label}: toggle must play the new Controllable video`,
    );
    assert(
      await page.evaluate(() => window.__pkOldVideo.paused === true),
      `${label}: toggle must not play the detached old video`,
    );

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({ action: "seek", delta: 1 });
    });
    assert(result?.handled === true, `${label}: seek handled on new identity`);
    assert(
      (await page.$eval(`#${newVideoId}`, (v) => v.currentTime)) >= 1.1,
      `${label}: seek must move the new Controllable video`,
    );
    assert(
      await page.evaluate(() => window.__pkOldVideo.currentTime < 0.5),
      `${label}: seek must not move the detached old video`,
    );

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert(result?.handled === true, `${label}: speed handled on new identity`);
    assert(
      (await page.$eval(`#${newVideoId}`, (v) => v.playbackRate)) === 1.25,
      `${label}: speed must write rate on the new Controllable video`,
    );
    assert(
      await page.evaluate(() => window.__pkOldVideo.playbackRate === 1),
      `${label}: speed must not write rate on the detached old video`,
    );
  }

  // Multi-P: same BV, cid change.
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVmultipart/?cid=1001");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 1,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 2, "multi-P rebind: armed at 2×");

    await rebindToNewWatch(page, {
      nextPath: "/video/BVmultipart/?cid=1002",
      nextVideoId: "pk-video-p2",
    });

    await page.waitForTimeout(600);
    assert(
      (await page.$eval("#pk-video-p2", (v) => v.playbackRate)) === 1,
      "multi-P rebind: previous desired rate must not land on the new part",
    );

    await assertCommandsDriveNewNode(page, {
      label: "multi-P rebind",
      newVideoId: "pk-video-p2",
    });

    await page.close();
    console.log("✓ multi-P cid/part change rebinds Commands to new node");
  }

  // VOD season-style: BV change without full reload.
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVseasonOld/");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.75,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1.75, "season rebind: armed at 1.75×");

    await rebindToNewWatch(page, {
      nextPath: "/video/BVseasonNew/",
      nextVideoId: "pk-video-season-new",
    });

    await page.waitForTimeout(600);
    assert(
      (await page.$eval("#pk-video-season-new", (v) => v.playbackRate)) === 1,
      "season rebind: previous desired rate must not land on the new BV",
    );

    await assertCommandsDriveNewNode(page, {
      label: "season rebind",
      newVideoId: "pk-video-season-new",
    });

    await page.close();
    console.log("✓ VOD season BV change rebinds Commands to new node");
  }

  // Bangumi episode change.
  {
    const page = await openWatchWithPlayer("www.bilibili.com/bangumi/play/ep1001/");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.5,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 1.5, "bangumi rebind: armed at 1.5×");

    await rebindToNewWatch(page, {
      nextPath: "/bangumi/play/ep1002/",
      nextVideoId: "pk-video-ep1002",
    });

    await page.waitForTimeout(600);
    assert(
      (await page.$eval("#pk-video-ep1002", (v) => v.playbackRate)) === 1,
      "bangumi rebind: previous desired rate must not land on the new episode",
    );

    await assertCommandsDriveNewNode(page, {
      label: "bangumi rebind",
      newVideoId: "pk-video-ep1002",
    });

    await page.close();
    console.log("✓ Bangumi episode change rebinds Commands to new node");
  }

  // SPA-style: old media node stays in the document and remains scorable while
  // a new Controllable video is mounted after the identity change. Drive falls
  // back to the media node (no window.player) so play/seek/speed observations
  // cannot be masked by a stub that always targets the new element.
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVspaOld/?cid=1");

    await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 1,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert((await page.$eval("video", (v) => v.playbackRate)) === 2, "spa dual-node: armed at 2×");

    await page.evaluate(() => {
      const old = document.querySelector("video");
      old.id = "pk-video-old";

      history.pushState({}, "", "/video/BVspaNew/?cid=2");

      const next = document.createElement("video");
      next.id = "pk-video-new";
      next.src = old.currentSrc || old.src || "/sample.mp4";
      next.muted = true;
      next.controls = true;
      next.style.width = "640px";
      next.style.height = "360px";
      next.playbackRate = 1;
      // Keep the previous watch's node in-document and scorable (same box size).
      old.style.cssText = "width:640px;height:360px";
      document.body.appendChild(next);
      delete window.player;
    });

    await page.waitForSelector("#pk-video-new");
    await page.waitForFunction(() => {
      const v = document.getElementById("pk-video-new");
      return v && v.readyState >= 1;
    }, null, { timeout: 10000 });

    await page.waitForTimeout(600);
    assert(
      (await page.$eval("#pk-video-new", (v) => v.playbackRate)) === 1,
      "spa dual-node: previous desired rate must not stick on the new identity",
    );
    assert(
      (await page.evaluate(() => PlaybackKeysBilibili.pickControllableVideo()?.id)) === "pk-video-new",
      "spa dual-node: Controllable video must be the new identity's node",
    );

    await page.evaluate(() => {
      const old = document.getElementById("pk-video-old");
      const next = document.getElementById("pk-video-new");
      old.pause();
      old.currentTime = 0.2;
      next.pause();
      next.currentTime = 0.2;
    });

    let result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "spa dual-node: toggle handled");
    assert(
      (await page.$eval("#pk-video-new", (v) => v.paused)) === false,
      "spa dual-node: toggle must play the new Controllable video",
    );
    assert(
      (await page.$eval("#pk-video-old", (v) => v.paused)) === true,
      "spa dual-node: toggle must not play the previous watch's video",
    );

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({ action: "seek", delta: 1 });
    });
    assert(result?.handled === true, "spa dual-node: seek handled");
    assert(
      (await page.$eval("#pk-video-new", (v) => v.currentTime)) >= 1.0,
      "spa dual-node: seek must move the new Controllable video",
    );
    assert(
      (await page.$eval("#pk-video-old", (v) => v.currentTime)) < 0.5,
      "spa dual-node: seek must not move the previous watch's video",
    );

    result = await page.evaluate(() => {
      return PlaybackKeysBilibili.applyCommand({
        action: "speed",
        delta: 0.25,
        min: 0.25,
        max: 4,
        wrap: false,
      });
    });
    assert(result?.handled === true, "spa dual-node: speed handled");
    assert(
      (await page.$eval("#pk-video-new", (v) => v.playbackRate)) === 1.25,
      "spa dual-node: speed must write rate on the new Controllable video",
    );
    assert(
      (await page.$eval("#pk-video-old", (v) => v.playbackRate)) !== 1.25,
      "spa dual-node: previous watch video must not receive the new speed Command",
    );

    await page.close();
    console.log("✓ SPA dual-node identity change rebinds to the new Controllable video");
  }

  // Full page load of a new watch URL still works (no regression vs #8).
  {
    const page = await openWatchWithPlayer("www.bilibili.com/video/BVfreshload/");
    await page.evaluate(() => {
      document.querySelector("video").pause();
    });
    const result = await page.evaluate((messages) => {
      return PlaybackKeysBilibili.applyCommand({ action: "toggle" }, { messages });
    }, MESSAGES);
    assert(result?.handled === true, "full load: toggle handled");
    assert(
      (await page.$eval("video", (v) => v.paused)) === false,
      "full load: Controllable video still driven after ordinary navigation",
    );
    await page.close();
    console.log("✓ full page load of watch URL still handles Commands");
  }

  console.log("Bilibili adapter tests passed.");
} finally {
  await context.close();
  rmSync(SMOKE_ROOT, { recursive: true, force: true });
}
