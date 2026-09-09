// Bilibili watch-page adapter (ADR-0001 / #8 + sticky rate #3).
// Single seam for path gating, Controllable-video presence, and Command apply.
// Hybrid drive: window.player for play/pause/seek when present; rate always on
// the Controllable video. Desired rate sticks on this watch until reset or the
// watch identity (BV and/or cid) changes. MAIN-world handler and the worker
// probe both use this.

(() => {
  // Probe/seek/status re-inject this file into MAIN world. Keep a single
  // sticky-rate owner: a second run must not orphan the first interval/patch.
  const root = typeof globalThis !== "undefined" ? globalThis : window;
  if (root.PlaybackKeysBilibili) return;

  const HOST_RE = /^www\.bilibili\.com$/i;
  const RATE_TICK_MS = 250;

  const rateDesc = (() => {
    try {
      return Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, "playbackRate");
    } catch {
      return null;
    }
  })();

  // Sticky desired-rate state for the current watch identity.
  let desiredRate = null;
  let stickyIdentity = null;
  let boundVideo = null;
  let rateInterval = null;
  let mediaObserver = null;
  let identityListenerAttached = false;

  function asLocation(locationLike) {
    if (!locationLike) return null;
    if (typeof locationLike === "string") {
      try { return new URL(locationLike); } catch { return null; }
    }
    // Location / URL-like
    if (typeof locationLike.hostname === "string" && typeof locationLike.pathname === "string") {
      return locationLike;
    }
    return null;
  }

  function isWatchPath(pathname) {
    return (
      pathname.startsWith("/video/") ||
      pathname.startsWith("/list/") ||
      pathname.startsWith("/bangumi/play/")
    );
  }

  function isBilibiliHost(locationLike) {
    const loc = asLocation(locationLike);
    return !!(loc && HOST_RE.test(loc.hostname));
  }

  function isWatchPage(locationLike) {
    const loc = asLocation(locationLike);
    if (!loc) return false;
    return HOST_RE.test(loc.hostname) && isWatchPath(loc.pathname || "/");
  }

  // Watch identity: BV and/or cid (or Bangumi ep/ss). Sticky rate clears when
  // this key changes; Controllable-video swaps on the same key keep the rate.
  function watchIdentity(locationLike) {
    const loc = asLocation(locationLike);
    if (!loc || !isWatchPage(loc)) return null;
    const path = loc.pathname || "/";
    let search;
    try {
      search = new URLSearchParams(loc.search || "");
    } catch {
      search = new URLSearchParams();
    }

    let bvid = search.get("bvid") || "";
    const bvMatch = path.match(/\/video\/(BV[\w]+)/i);
    if (bvMatch) bvid = bvMatch[1];

    let cid = search.get("cid") || "";
    if (!cid) {
      const p = search.get("p");
      if (p) cid = `p${p}`;
    }

    let bangumi = "";
    const bgMatch = path.match(/\/bangumi\/play\/((?:ep|ss)[\w]+)/i);
    if (bgMatch) bangumi = bgMatch[1];

    // list/ pages: identity is path + optional bvid/cid query.
    let list = "";
    if (path.startsWith("/list/")) list = path.replace(/\/+$/, "");

    return `bv:${bvid}|cid:${cid}|bg:${bangumi}|list:${list}`;
  }

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

  function pickControllableVideo(doc) {
    const root = doc || document;
    let best = null;
    let bestScore = 0;
    for (const video of root.querySelectorAll("video")) {
      const score = videoScore(video);
      if (score > bestScore) {
        best = video;
        bestScore = score;
      }
    }
    return best;
  }

  function hasControllableVideo(doc, locationLike) {
    const loc = asLocation(locationLike || (typeof location !== "undefined" ? location : null));
    if (!isWatchPage(loc)) return false;
    return pickControllableVideo(doc || document) != null;
  }

  function resolvePlayer(explicit) {
    if (explicit !== undefined) return explicit;
    try {
      return typeof window !== "undefined" ? window.player : null;
    } catch {
      return null;
    }
  }

  function fmtSpeed(r) {
    return `${(Math.round(r * 100) / 100).toFixed(2)}×`;
  }

  function msg(messages, key, fallback) {
    if (messages && typeof messages[key] === "string" && messages[key]) return messages[key];
    return fallback;
  }

  function transportPlay(player, video) {
    if (player && typeof player.play === "function") {
      try { player.play(); return; } catch { /* fall through */ }
    }
    try { video.play().catch(() => {}); } catch { /* ignore */ }
  }

  function transportPause(player, video) {
    if (player && typeof player.pause === "function") {
      try { player.pause(); return; } catch { /* fall through */ }
    }
    try { video.pause(); } catch { /* ignore */ }
  }

  function transportSeek(player, video, target) {
    if (player && typeof player.seek === "function") {
      try { player.seek(target); return true; } catch { /* fall through */ }
    }
    try {
      video.currentTime = target;
      return true;
    } catch {
      return false;
    }
  }

  function readRate(video) {
    if (rateDesc && rateDesc.get) {
      try { return rateDesc.get.call(video); } catch { /* fall through */ }
    }
    return video.playbackRate;
  }

  function writeRate(video, rate) {
    if (rateDesc && rateDesc.set) {
      try { rateDesc.set.call(video, rate); return; } catch { /* fall through */ }
    }
    try { video.playbackRate = rate; } catch { /* ignore */ }
  }

  function ensureRatePatch(video) {
    if (!video || video.__pkBiliRatePatched) return;
    if (!rateDesc || !rateDesc.configurable) return;
    try {
      Object.defineProperty(video, "playbackRate", {
        configurable: true,
        enumerable: true,
        get() { return rateDesc.get.call(video); },
        set(v) {
          if (desiredRate != null && Number(v) !== desiredRate) {
            rateDesc.set.call(video, desiredRate);
            return;
          }
          rateDesc.set.call(video, v);
        },
      });
      video.__pkBiliRatePatched = true;
    } catch { /* ignore */ }
  }

  function stopSticky() {
    desiredRate = null;
    stickyIdentity = null;
    boundVideo = null;
    if (rateInterval) {
      clearInterval(rateInterval);
      rateInterval = null;
    }
    if (mediaObserver) {
      try { mediaObserver.disconnect(); } catch { /* ignore */ }
      mediaObserver = null;
    }
  }

  function currentPageLocation() {
    try {
      return typeof location !== "undefined" ? location : null;
    } catch {
      return null;
    }
  }

  function syncStickyToIdentity(loc) {
    if (desiredRate == null) return;
    const id = watchIdentity(loc || currentPageLocation());
    if (!id || (stickyIdentity != null && id !== stickyIdentity)) {
      stopSticky();
    }
  }

  function reassertSticky(doc) {
    if (desiredRate == null) return;
    syncStickyToIdentity(currentPageLocation());
    if (desiredRate == null) return;

    const video = pickControllableVideo(doc || document);
    if (!video) return;

    if (video !== boundVideo) {
      boundVideo = video;
      ensureRatePatch(video);
    }
    if (readRate(video) !== desiredRate) writeRate(video, desiredRate);
  }

  function ensureStickyWatchers(doc) {
    if (desiredRate == null) return;

    if (!rateInterval) {
      rateInterval = setInterval(() => reassertSticky(doc || document), RATE_TICK_MS);
    }

    if (!mediaObserver && typeof MutationObserver === "function") {
      try {
        mediaObserver = new MutationObserver(() => reassertSticky(doc || document));
        mediaObserver.observe(doc || document.documentElement || document, {
          childList: true,
          subtree: true,
        });
      } catch {
        mediaObserver = null;
      }
    }

    if (!identityListenerAttached && typeof window !== "undefined") {
      identityListenerAttached = true;
      const onNav = () => syncStickyToIdentity(currentPageLocation());
      try {
        window.addEventListener("popstate", onNav);
        window.addEventListener("hashchange", onNav);
      } catch { /* ignore */ }
    }
  }

  function armSticky(video, rate, loc, doc) {
    const id = watchIdentity(loc);
    if (!id) {
      writeRate(video, rate);
      return;
    }
    desiredRate = rate;
    stickyIdentity = id;
    boundVideo = video;
    ensureRatePatch(video);
    writeRate(video, rate);
    ensureStickyWatchers(doc);
  }

  function applyCommand(payload, opts = {}) {
    const doc = opts.document || document;
    const loc = asLocation(opts.location || (typeof location !== "undefined" ? location : null));
    const messages = opts.messages || {};
    const player = resolvePlayer(opts.player);

    if (!isWatchPage(loc)) return { handled: false };

    // Drop sticky rate when the watch identity has already changed.
    syncStickyToIdentity(loc);

    const video = pickControllableVideo(doc);
    if (!video) return { handled: false };

    switch (payload?.action) {
      case "toggle": {
        if (video.paused) {
          transportPlay(player, video);
          return {
            handled: true,
            toast: { ic: "▶", name: msg(messages, "toastPlaying", "Playing"), det: "" },
          };
        }
        transportPause(player, video);
        return {
          handled: true,
          toast: { ic: "❚❚", name: msg(messages, "toastPaused", "Paused"), det: "" },
        };
      }
      case "seek": {
        const dur = video.duration;
        const seekable = video.seekable;
        const hasSeekable = seekable && seekable.length > 0;
        const upper = Number.isFinite(dur) && dur > 0
          ? dur
          : (hasSeekable ? seekable.end(seekable.length - 1) : Infinity);

        let target;
        if (Number.isFinite(payload.absoluteTime)) {
          target = payload.absoluteTime;
        } else {
          const delta = Number(payload.delta) || 0;
          target = (Number(video.currentTime) || 0) + delta;
        }
        target = Math.max(0, Math.min(upper, target));
        if (!Number.isFinite(target)) return { handled: false };

        if (!transportSeek(player, video, target)) return { handled: false };

        if (Number.isFinite(payload.absoluteTime)) {
          return { handled: true, toast: null };
        }
        const delta = Number(payload.delta) || 0;
        const sign = delta >= 0 ? "+" : "−";
        const ic = delta >= 0 ? "»" : "«";
        return { handled: true, toast: { ic, name: `${sign}${Math.abs(delta)}s`, det: "" } };
      }
      case "speed": {
        if (payload.reset) {
          stopSticky();
          writeRate(video, 1);
          return {
            handled: true,
            toast: { ic: "↺", name: msg(messages, "toastResetTo1x", "Reset to 1×"), det: "" },
          };
        }
        const min = Number.isFinite(payload.min) ? payload.min : 0.05;
        const max = Number.isFinite(payload.max) ? payload.max : 16;
        const wrap = !!payload.wrap;
        // Prefer sticky desired rate over a Hostile snap mid-Command.
        const cur = (desiredRate != null ? desiredRate : Number(readRate(video))) || 1;
        let next = Math.round((cur + (Number(payload.delta) || 0)) * 100) / 100;
        if (wrap) {
          if (next > max) next = min;
          else if (next < min) next = max;
        } else {
          next = Math.max(min, Math.min(max, next));
        }
        armSticky(video, next, loc, doc);
        const sign = (Number(payload.delta) || 0) >= 0 ? "+" : "−";
        return {
          handled: true,
          toast: {
            ic: sign,
            name: fmtSpeed(next),
            det: `${sign}${Math.abs(Number(payload.delta) || 0).toFixed(2)}×`,
          },
        };
      }
      case "noop":
        return {
          handled: true,
          toast: {
            ic: "•",
            name: msg(messages, "statusControlling", "Controlling"),
            det: (doc.title || (loc && loc.hostname) || ""),
          },
        };
      case "status":
        return {
          handled: true,
          status: {
            currentSpeed: desiredRate != null ? desiredRate : readRate(video),
            paused: video.paused,
            duration: video.duration || 0,
            currentTime: video.currentTime || 0,
          },
        };
      default:
        return { handled: false };
    }
  }

  root.PlaybackKeysBilibili = {
    isBilibiliHost,
    isWatchPage,
    hasControllableVideo,
    applyCommand,
    pickControllableVideo,
  };
})();
