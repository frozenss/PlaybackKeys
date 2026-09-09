// Bilibili watch-page adapter (ADR-0001 / #8).
// Single seam for path gating, Controllable-video presence, and Command apply.
// Hybrid drive: window.player for play/pause/seek when present; rate always on
// the Controllable video. MAIN-world handler and the worker probe both use this.

(() => {
  const HOST_RE = /^www\.bilibili\.com$/i;

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

  function applyCommand(payload, opts = {}) {
    const doc = opts.document || document;
    const loc = asLocation(opts.location || (typeof location !== "undefined" ? location : null));
    const messages = opts.messages || {};
    const player = resolvePlayer(opts.player);

    if (!isWatchPage(loc)) return { handled: false };

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
          try { video.playbackRate = 1; } catch { /* ignore */ }
          return {
            handled: true,
            toast: { ic: "↺", name: msg(messages, "toastResetTo1x", "Reset to 1×"), det: "" },
          };
        }
        const min = Number.isFinite(payload.min) ? payload.min : 0.05;
        const max = Number.isFinite(payload.max) ? payload.max : 16;
        const wrap = !!payload.wrap;
        const cur = Number(video.playbackRate) || 1;
        let next = Math.round((cur + (Number(payload.delta) || 0)) * 100) / 100;
        if (wrap) {
          if (next > max) next = min;
          else if (next < min) next = max;
        } else {
          next = Math.max(min, Math.min(max, next));
        }
        try { video.playbackRate = next; } catch { /* ignore */ }
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
            currentSpeed: video.playbackRate,
            paused: video.paused,
            duration: video.duration || 0,
            currentTime: video.currentTime || 0,
          },
        };
      default:
        return { handled: false };
    }
  }

  const api = {
    isBilibiliHost,
    isWatchPage,
    hasControllableVideo,
    applyCommand,
    pickControllableVideo,
  };

  const root = typeof globalThis !== "undefined" ? globalThis : window;
  root.PlaybackKeysBilibili = api;
})();
