import {
  SKIP_INTERVAL_DEFAULTS,
  SKIP_INTERVAL_COUNT,
  SKIP_INTERVAL_PRESETS,
  SKIP_INTERVAL_COMMAND_PAIRS,
  normalizeSkipIntervals,
} from "../shared/skip-intervals.js";

const BUILTIN = [
  { hostname: "youtube.com", origin: "https://www.youtube.com" },
  { hostname: "youtube-nocookie.com", origin: "https://www.youtube-nocookie.com" },
  { hostname: "vimeo.com", origin: "https://vimeo.com" },
  { hostname: "udemy.com", origin: "https://www.udemy.com" },
  { hostname: "coursera.org", origin: "https://www.coursera.org" },
  { hostname: "www.bilibili.com", origin: "https://www.bilibili.com" },
];

function detectIsMac() {
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || "";
  if (/mac/i.test(platform)) return true;
  if (/mac|iphone|ipad|ipod/i.test(navigator.platform || "")) return true;
  if (/Macintosh|Mac OS X|iPhone|iPad/i.test(navigator.userAgent || "")) return true;
  return false;
}
const isMac = detectIsMac();
const t = globalThis.PlaybackKeysI18n?.t || ((key, _subs, fallback) => fallback || key);

const COMMAND_LABELS = {
  "1-play-pause":    { key: "commandPlayPause", fallback: "Play / Pause" },
  "2-speed-up":      { key: "commandSpeedUpStep", fallback: "Speed +0.25×" },
  "3-skip-back":     { key: "commandSkipBack", fallback: "Skip back 1" },
  "4-skip-forward":  { key: "commandSkipForward", fallback: "Skip forward 1" },
  "5-speed-down":    { key: "commandSpeedDownStep", fallback: "Speed −0.25×" },
  "6-speed-reset":   { key: "commandResetSpeed1x", fallback: "Reset speed to 1×" },
  "7-switch-target": { key: "commandSwitchTargetShort", fallback: "Switch target tab" },
  "8-skip-back-2":   { key: "commandSkipBack2", fallback: "Skip back 2" },
  "9-skip-forward-2":{ key: "commandSkipForward2", fallback: "Skip forward 2" },
  "10-skip-back-3":  { key: "commandSkipBack3", fallback: "Skip back 3" },
  "11-skip-forward-3": { key: "commandSkipForward3", fallback: "Skip forward 3" },
};

const STEP_PRESETS  = [0.10, 0.25, 0.50, 1.00];
const TOAST_PRESETS = [800, 1500, 3000, 0];
const THEME_MODES = ["system", "light", "dark"];

const DEFAULTS = {
  skipIntervals: [...SKIP_INTERVAL_DEFAULTS],
  speedStep: 0.25,
  speedMin: 0.25,
  speedMax: 4.0,
  wrapSpeed: false,
  showToast: true,
  showBadge: true,
  toastDurationMs: 1500,
  themeMode: "system",
  enabledOrigins: {},
  perSiteDisabled: {},
  runOnAllSites: false,
};

function fmtToastDur(ms) { return ms === 0 ? t("off", undefined, "off") : `${(ms / 1000).toFixed(1)}s`; }
function fmtSpeed(s)     { return `${s.toFixed(2)}×`; }
function fmtSkipInterval(s) { return `${s}s`; }
function fmtTheme(mode) {
  const labels = {
    system: t("themeSystem", undefined, "System"),
    light: t("themeLight", undefined, "Light"),
    dark: t("themeDark", undefined, "Dark"),
  };
  return labels[mode] || labels.system;
}

function flashSaved() {
  const el = document.querySelector(".save");
  if (!el) return;
  el.classList.add("flash");
  clearTimeout(flashSaved._t);
  flashSaved._t = setTimeout(() => el.classList.remove("flash"), 600);
}

async function setSetting(patch) {
  await chrome.storage.local.set(patch);
  flashSaved();
}

function buildSeg(container, presets, currentValue, fmtFn, onPick, allowCustom) {
  const c = typeof container === "string" ? document.getElementById(container) : container;
  c.innerHTML = "";
  const isPreset = presets.includes(currentValue);
  for (const v of presets) {
    const b = document.createElement("button");
    b.textContent = fmtFn(v);
    b.classList.toggle("on", v === currentValue);
    b.addEventListener("click", () => { onPick(v); });
    c.appendChild(b);
  }
  if (allowCustom) {
    const custom = document.createElement("button");
    custom.textContent = t("custom", undefined, "Custom");
    custom.classList.toggle("on", !isPreset);
    custom.addEventListener("click", () => { onPick("custom"); });
    c.appendChild(custom);
  }
}

function clampSkipIntervalSeconds(n) {
  n = Math.round(Number(n));
  if (!Number.isFinite(n) || n < 1) n = 1;
  return n;
}

async function setSkipInterval(index, seconds) {
  const settings = cachedSettings || DEFAULTS;
  const next = normalizeSkipIntervals(settings).slice();
  next[index] = clampSkipIntervalSeconds(seconds);
  await setSetting({ skipIntervals: next });
  render();
}

async function renderSkipIntervals(settings, commandMap) {
  const root = document.getElementById("skip-intervals");
  root.innerHTML = "";
  const intervals = normalizeSkipIntervals(settings);

  for (let i = 0; i < SKIP_INTERVAL_COUNT; i++) {
    const seconds = intervals[i];
    const [backId, forwardId] = SKIP_INTERVAL_COMMAND_PAIRS[i];
    const row = document.createElement("div");
    row.className = "opt-row skip-interval-row";

    const lbl = document.createElement("div");
    lbl.className = "lbl";
    const title = document.createElement("span");
    title.textContent = t("skipIntervalN", [String(i + 1)], `Skip interval ${i + 1}`);
    const desc = document.createElement("small");
    desc.textContent = t("skipIntervalDesc", undefined, "Seconds jumped by this Skip back / forward pair");
    lbl.append(title, desc);

    const controls = document.createElement("div");
    controls.className = "skip-interval-controls";

    const seg = document.createElement("div");
    seg.className = "seg";
    const customWrap = document.createElement("div");
    customWrap.className = "seg-custom";
    customWrap.hidden = SKIP_INTERVAL_PRESETS.includes(seconds);
    const customInput = document.createElement("input");
    customInput.type = "number";
    customInput.min = "1";
    customInput.value = String(seconds);
    const unit = document.createElement("span");
    unit.className = "unit";
    unit.textContent = t("unitSeconds", undefined, "seconds");
    customWrap.append(customInput, unit);

    buildSeg(seg, SKIP_INTERVAL_PRESETS, seconds, fmtSkipInterval, async (v) => {
      if (v === "custom") {
        customWrap.hidden = false;
        customInput.value = String(seconds);
        customInput.focus();
        customInput.select();
        return;
      }
      customWrap.hidden = true;
      await setSkipInterval(i, v);
    }, true);

    customInput.addEventListener("change", async () => {
      const v = clampSkipIntervalSeconds(customInput.value);
      customInput.value = String(v);
      await setSkipInterval(i, v);
    });

    const chords = document.createElement("div");
    chords.className = "skip-interval-chords";
    for (const cmdId of [backId, forwardId]) {
      const meta = COMMAND_LABELS[cmdId];
      const chip = document.createElement("div");
      chip.className = "skip-chord-chip";
      const name = document.createElement("span");
      name.className = "skip-chord-name";
      name.textContent = t(meta.key, undefined, meta.fallback);
      const keys = document.createElement("span");
      keys.className = "shortcut-keys";
      const shortcut = commandMap.get(cmdId)?.shortcut || "";
      keys.appendChild(chordElement(shortcut));
      chip.append(name, keys);
      chords.appendChild(chip);
    }

    controls.append(seg, customWrap, chords);
    row.append(lbl, controls);
    root.appendChild(row);
  }
}

function applyAria(el, on) {
  el.setAttribute("role", "switch");
  el.setAttribute("aria-checked", String(!!on));
  if (!el.hasAttribute("tabindex")) el.tabIndex = 0;
}

function setupSwitch(id, getValue, onChange) {
  const el = document.getElementById(id);
  function render(v) {
    el.classList.toggle("on", !!v);
    applyAria(el, !!v);
  }
  render(getValue());
  el.addEventListener("click", async () => {
    const next = !el.classList.contains("on");
    await onChange(next);
    render(next);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); el.click(); }
  });
  return { render };
}

function bindSwitch(el, getValue, onClick) {
  function render(v) {
    el.classList.toggle("on", !!v);
    applyAria(el, !!v);
  }
  render(getValue());
  el.addEventListener("click", onClick);
  el.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); el.click(); }
  });
  return { render };
}

async function renderSites(settings) {
  const list = document.getElementById("site-list");
  list.innerHTML = "";

  // Built-in sites first
  for (const site of BUILTIN) {
    const row = document.createElement("div");
    row.className = "site-row";
    const isOn = !settings.perSiteDisabled[site.origin];
    const host = document.createElement("span");
    host.className = "host";
    host.textContent = site.hostname;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = t("builtInTag", undefined, "BUILT-IN");
    const sw = document.createElement("div");
    sw.className = "switch-lg";
    sw.setAttribute("aria-label", t("toggleEnableOnHost", [site.hostname], `Enable on ${site.hostname}`));
    bindSwitch(sw, () => isOn, async () => {
      const cur = (await chrome.storage.local.get({ perSiteDisabled: {} })).perSiteDisabled;
      const wasOn = sw.classList.contains("on");
      const nextOn = !wasOn;
      if (nextOn) delete cur[site.origin];
      else cur[site.origin] = true;
      sw.classList.toggle("on", nextOn);
      applyAria(sw, nextOn);
        await setSetting({ perSiteDisabled: cur });
      });
    row.append(host, tag, sw);
    list.appendChild(row);
  }

  // Custom (user-enabled) hosts
  const customOrigins = Object.keys(settings.enabledOrigins || {});
  for (const origin of customOrigins) {
    const hostname = (() => { try { return new URL(origin).hostname; } catch { return origin; } })();
    const row = document.createElement("div");
    row.className = "site-row custom";
    const host = document.createElement("span");
    host.className = "host";
    host.textContent = hostname;
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.textContent = t("customTag", undefined, "CUSTOM");
    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-ghost";
    removeBtn.textContent = t("remove", undefined, "Remove");
    removeBtn.addEventListener("click", async () => {
      await chrome.permissions.remove({ origins: [`${origin}/*`] }).catch(() => {});
      const { enabledOrigins = {} } = await chrome.storage.local.get({ enabledOrigins: {} });
      delete enabledOrigins[origin];
      await setSetting({ enabledOrigins });
      render();
    });
    row.append(host, tag, removeBtn);
    list.appendChild(row);
  }
}

function translateShortcutPart(part) {
  if (!isMac) return part;
  if (part === "Ctrl" || part === "Command") return "⌘";
  if (part === "Shift") return "⇧";
  if (part === "Alt") return "⌥";
  if (part === "MacCtrl") return "⌃";
  return part;
}

function shortcutParts(shortcut) {
  if (!shortcut) return null;
  if (shortcut.includes("+")) {
    return shortcut.split("+").map((part) => translateShortcutPart(part.trim())).filter(Boolean);
  }
  const parts = [];
  let rest = shortcut;
  for (const symbol of ["⌃", "⌥", "⇧", "⌘"]) {
    if (rest.includes(symbol)) {
      parts.push(symbol);
      rest = rest.replace(symbol, "");
    }
  }
  if (rest) parts.push(rest);
  return parts.length > 0 ? parts : [shortcut];
}

function chordElement(shortcut) {
  const parts = shortcutParts(shortcut);
  const chord = document.createElement("span");
  chord.className = "kbd-chord";
  if (!parts) {
    chord.classList.add("unbound");
    const key = document.createElement("span");
    key.className = "key add-key";
    key.textContent = t("add", undefined, "add");
    chord.appendChild(key);
    return chord;
  }
  parts.forEach((part, index) => {
    if (index > 0) {
      const plus = document.createElement("span");
      plus.className = "plus";
      plus.textContent = "+";
      chord.appendChild(plus);
    }
    const key = document.createElement("span");
    key.className = "key";
    key.textContent = part;
    chord.appendChild(key);
  });
  return chord;
}

function chordPlainText(shortcut) {
  const parts = shortcutParts(shortcut);
  if (!parts) return t("unbound", undefined, "unbound");
  return parts.join(isMac ? "" : "+");
}

const COMMAND_ORDER = Object.keys(COMMAND_LABELS);

async function renderShortcuts(commandMap) {
  const list = document.getElementById("shortcut-list");
  const cmds = commandMap
    ? [...commandMap.values()]
    : await chrome.commands.getAll();
  cmds.sort((a, b) => {
    const ai = COMMAND_ORDER.indexOf(a.name);
    const bi = COMMAND_ORDER.indexOf(b.name);
    const aKey = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bKey = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return aKey - bKey || a.name.localeCompare(b.name);
  });
  list.innerHTML = "";
  for (const cmd of cmds) {
    if (cmd.name === "_execute_action") continue;
    const meta = COMMAND_LABELS[cmd.name];
    if (!meta) continue;
    const row = document.createElement("div");
    row.className = "shortcut-row" + (cmd.shortcut ? "" : " is-unbound");
    const label = t(meta.key, undefined, meta.fallback);
    const unbound = t("unbound", undefined, "unbound");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = label;
    if (!cmd.shortcut) {
      const small = document.createElement("small");
      small.textContent = unbound;
      name.appendChild(small);
    }

    const keys = document.createElement("span");
    keys.className = "shortcut-keys";
    keys.setAttribute("aria-label", `${label}: ${chordPlainText(cmd.shortcut)}`);
    keys.appendChild(chordElement(cmd.shortcut));

    row.append(name, keys);
    list.appendChild(row);
  }
}

let cachedSettings = null;

async function loadSettings() {
  // Raw get (no defaults) so missing skipIntervals still migrates seekSeconds.
  const stored = await chrome.storage.local.get(null);
  const skipIntervals = normalizeSkipIntervals(stored);
  if (!Array.isArray(stored.skipIntervals)) {
    await chrome.storage.local.set({ skipIntervals });
  }
  const settings = { ...DEFAULTS, ...stored, skipIntervals };
  settings.themeMode = globalThis.PlaybackKeysTheme?.normalizeThemeMode
    ? globalThis.PlaybackKeysTheme.normalizeThemeMode(settings.themeMode)
    : (THEME_MODES.includes(settings.themeMode) ? settings.themeMode : "system");
  return settings;
}

async function render() {
  const settings = await loadSettings();
  cachedSettings = settings;

  const cmds = await chrome.commands.getAll();
  const commandMap = new Map(cmds.map((cmd) => [cmd.name, cmd]));
  await renderSkipIntervals(settings, commandMap);

  // Speed step
  buildSeg("seg-step", STEP_PRESETS, settings.speedStep, fmtSpeed, async (v) => {
    if (v === "custom") {
      document.getElementById("custom-step").hidden = false;
      const inp = document.getElementById("custom-step-input");
      inp.value = String(settings.speedStep);
      inp.focus();
      inp.select();
      return;
    }
    await setSetting({ speedStep: v });
    document.getElementById("custom-step").hidden = true;
    render();
  }, true);
  document.getElementById("custom-step").hidden = STEP_PRESETS.includes(settings.speedStep);
  document.getElementById("custom-step-input").value = String(settings.speedStep);

  // Toast duration
  buildSeg("seg-toastdur", TOAST_PRESETS, settings.toastDurationMs, fmtToastDur, async (v) => {
    await setSetting({ toastDurationMs: v });
    render();
  }, false);

  // Theme
  buildSeg("seg-theme", THEME_MODES, settings.themeMode, fmtTheme, async (v) => {
    if (globalThis.PlaybackKeysTheme?.setThemeMode) {
      await globalThis.PlaybackKeysTheme.setThemeMode(v);
      flashSaved();
    } else {
      await setSetting({ themeMode: v });
    }
    render();
  }, false);

  // Range inputs
  document.getElementById("speed-min").value = settings.speedMin;
  document.getElementById("speed-max").value = settings.speedMax;

  // Switches — keep visual class and aria-checked in lockstep.
  function setSwitch(id, on) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.toggle("on", !!on);
    applyAria(el, !!on);
  }
  setSwitch("wrap-toggle",  settings.wrapSpeed);
  setSwitch("toast-toggle", settings.showToast);
  setSwitch("badge-toggle", settings.showBadge);

  // All-sites toggle: only "on" if BOTH the user setting AND the granted
  // <all_urls> permission line up. Re-check the permission on every render
  // because the user can revoke it from chrome://extensions at any time.
  const allSitesGranted = await chrome.permissions
    .contains({ origins: ["<all_urls>"] }).catch(() => false);
  setSwitch("all-sites-toggle", !!settings.runOnAllSites && allSitesGranted);

  await renderSites(settings);
  await renderShortcuts(commandMap);
  document.getElementById("opt-version").textContent = `v${chrome.runtime.getManifest().version}`;
}

function wireOnce() {
  function clampStep(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) n = 0.01;
    return Math.round(n * 100) / 100;
  }
  const stepInp = document.getElementById("custom-step-input");
  stepInp.addEventListener("change", async () => {
    const v = clampStep(stepInp.value);
    stepInp.value = String(v);
    await setSetting({ speedStep: v });
    render();
  });

  // Range inputs — enforce 0.05 <= min < max <= 8 with at least 0.05 spacing.
  const SPEED_FLOOR = 0.05;
  const SPEED_CEIL  = 8.0;
  const SPEED_GAP   = 0.05;

  document.getElementById("speed-min").addEventListener("change", async (e) => {
    let v = Number(e.target.value);
    const cur = await chrome.storage.local.get({ speedMin: 0.25, speedMax: 4.0 });
    if (!Number.isFinite(v)) v = cur.speedMin;
    v = Math.round(v * 100) / 100;
    if (v < SPEED_FLOOR) v = SPEED_FLOOR;
    if (v > cur.speedMax - SPEED_GAP) v = Math.max(SPEED_FLOOR, cur.speedMax - SPEED_GAP);
    e.target.value = String(v);
    await setSetting({ speedMin: v });
    render();
  });
  document.getElementById("speed-max").addEventListener("change", async (e) => {
    let v = Number(e.target.value);
    const cur = await chrome.storage.local.get({ speedMin: 0.25, speedMax: 4.0 });
    if (!Number.isFinite(v)) v = cur.speedMax;
    v = Math.round(v * 100) / 100;
    if (v > SPEED_CEIL) v = SPEED_CEIL;
    if (v < cur.speedMin + SPEED_GAP) v = Math.min(SPEED_CEIL, cur.speedMin + SPEED_GAP);
    e.target.value = String(v);
    await setSetting({ speedMax: v });
    render();
  });

  // Switches
  setupSwitch("wrap-toggle",  () => cachedSettings?.wrapSpeed,  (v) => setSetting({ wrapSpeed: v }));
  setupSwitch("toast-toggle", () => cachedSettings?.showToast,  (v) => setSetting({ showToast: v }));
  setupSwitch("badge-toggle", () => cachedSettings?.showBadge,  (v) => setSetting({ showBadge: v }));

  // All-sites toggle: requests / removes the <all_urls> optional permission.
  const allSitesEl = document.getElementById("all-sites-toggle");
  allSitesEl.setAttribute("aria-label", t("runOnAllSites", undefined, "Run on all sites"));
  applyAria(allSitesEl, allSitesEl.classList.contains("on"));
  allSitesEl.addEventListener("keydown", (e) => {
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); allSitesEl.click(); }
  });
  allSitesEl.addEventListener("click", async (e) => {
    const el = e.currentTarget;
    const next = !el.classList.contains("on");
    if (next) {
      const confirmed = confirm(t(
        "confirmRunOnAllSites",
        undefined,
        "Run on all sites asks Chrome for access to every website you visit. You can usually use the per-site Enable button instead. Continue?",
      ));
      if (!confirmed) return;
      const ok = await chrome.permissions.request({ origins: ["<all_urls>"] });
      if (!ok) return;
      await setSetting({ runOnAllSites: true });
    } else {
      await chrome.permissions.remove({ origins: ["<all_urls>"] }).catch(() => {});
      await setSetting({ runOnAllSites: false });
    }
    render();
  });

  // Open shortcuts (Playback section + Shortcuts section)
  function openShortcutSettings() {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  }
  document.getElementById("open-shortcuts").addEventListener("click", openShortcutSettings);
  document.getElementById("open-skip-shortcuts").addEventListener("click", openShortcutSettings);

  // Reset to defaults
  document.getElementById("reset-defaults").addEventListener("click", async () => {
    if (!confirm(t(
      "confirmResetDefaults",
      undefined,
      "Reset all PlaybackKeys settings to defaults? This won't remove granted site permissions.",
    ))) return;
    await chrome.storage.local.set(DEFAULTS);
    await globalThis.PlaybackKeysTheme?.setThemeMode?.(DEFAULTS.themeMode);
    flashSaved();
    render();
  });

  // Sidebar nav active state
  const links = document.querySelectorAll(".nav-link");
  function setActive() {
    let activeId = links[0].getAttribute("href").slice(1);
    for (const link of links) {
      const id = link.getAttribute("href").slice(1);
      const el = document.getElementById(id);
      if (el && el.getBoundingClientRect().top < 120) activeId = id;
    }
    links.forEach((l) => l.classList.toggle("active", l.getAttribute("href") === `#${activeId}`));
  }
  setActive();
  window.addEventListener("scroll", setActive, { passive: true });
}

(async function main() {
  wireOnce();
  await render();
})();
