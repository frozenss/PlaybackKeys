const BUILTIN = [
  { hostname: "youtube.com", origin: "https://www.youtube.com" },
  { hostname: "youtube-nocookie.com", origin: "https://www.youtube-nocookie.com" },
  { hostname: "vimeo.com", origin: "https://vimeo.com" },
  { hostname: "udemy.com", origin: "https://www.udemy.com" },
  { hostname: "coursera.org", origin: "https://www.coursera.org" },
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
  "1-play-pause":   { key: "commandPlayPause", fallback: "Play / Pause" },
  "2-speed-up":     { key: "commandSpeedUpStep", fallback: "Speed +0.25×" },
  "3-skip-back":    { key: "commandSkipBack", fallback: "Skip back" },
  "4-skip-forward": { key: "commandSkipForward", fallback: "Skip forward" },
  "5-speed-down":   { key: "commandSpeedDownStep", fallback: "Speed −0.25×" },
  "6-speed-reset":  { key: "commandResetSpeed1x", fallback: "Reset speed to 1×" },
  "7-switch-target":{ key: "commandSwitchTargetShort", fallback: "Switch target tab" },
};

const SEEK_PRESETS  = [2, 5, 10, 15, 30];
const STEP_PRESETS  = [0.10, 0.25, 0.50, 1.00];
const TOAST_PRESETS = [800, 1500, 3000, 0];
const THEME_MODES = ["system", "light", "dark"];

const DEFAULTS = {
  seekSeconds: 5,
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
function fmtSeek(s)      { return `${s}s`; }
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

function buildSeg(containerId, presets, currentValue, fmtFn, onPick, allowCustom) {
  const c = document.getElementById(containerId);
  c.innerHTML = "";
  let isPreset = presets.includes(currentValue);
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

async function renderShortcuts() {
  const list = document.getElementById("shortcut-list");
  const cmds = await chrome.commands.getAll();
  cmds.sort((a, b) => a.name.localeCompare(b.name));
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

async function render() {
  const settings = await chrome.storage.local.get(DEFAULTS);
  settings.themeMode = globalThis.PlaybackKeysTheme?.normalizeThemeMode
    ? globalThis.PlaybackKeysTheme.normalizeThemeMode(settings.themeMode)
    : (THEME_MODES.includes(settings.themeMode) ? settings.themeMode : "system");
  cachedSettings = settings;

  // Skip
  buildSeg("seg-skip", SEEK_PRESETS, settings.seekSeconds, fmtSeek, async (v) => {
    if (v === "custom") {
      document.getElementById("custom-skip").hidden = false;
      const inp = document.getElementById("custom-skip-input");
      inp.value = String(settings.seekSeconds);
      inp.focus();
      inp.select();
      return;
    }
    await setSetting({ seekSeconds: v });
    document.getElementById("custom-skip").hidden = true;
    render();
  }, true);
  document.getElementById("custom-skip").hidden = SEEK_PRESETS.includes(settings.seekSeconds);
  document.getElementById("custom-skip-input").value = String(settings.seekSeconds);

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
  await renderShortcuts();
  document.getElementById("opt-version").textContent = `v${chrome.runtime.getManifest().version}`;
}

function wireOnce() {
  // Custom number inputs
  function clampSeek(n) {
    n = Math.round(Number(n));
    if (!Number.isFinite(n) || n < 1) n = 1;
    return n;
  }
  function clampStep(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) n = 0.01;
    return Math.round(n * 100) / 100;
  }
  const skipInp = document.getElementById("custom-skip-input");
  skipInp.addEventListener("change", async () => {
    const v = clampSeek(skipInp.value);
    skipInp.value = String(v);
    await setSetting({ seekSeconds: v });
    render();
  });
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

  // Open shortcuts
  document.getElementById("open-shortcuts").addEventListener("click", () => {
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });

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
