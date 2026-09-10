import {
  SKIP_INTERVAL_DEFAULTS,
  SKIP_INTERVAL_COUNT,
  SKIP_INTERVAL_PRESETS,
  SKIP_INTERVAL_COMMAND_PAIRS,
  normalizeSkipIntervals,
} from "../shared/skip-intervals.js";
import { captureExternalHotkey } from "../shared/external-hotkey.js";
import {
  AHK_BRIDGE_STORAGE,
  clearedAhkBridgeStorage,
  generateAhkBridge,
  isWindowsPlatform,
  normalizeExternalHotkeyMapping,
  resetPatchOmitsAhkBridgeStorage,
} from "../shared/ahk-bridge.js";

/** AHK bridge companion storage lives in AHK_BRIDGE_STORAGE (not DEFAULTS). */
const AHK_SCRIPT_FILENAME = "PlaybackKeys.ahk";

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

function detectIsWindows() {
  return isWindowsPlatform({
    userAgentDataPlatform: navigator.userAgentData?.platform || "",
    platform: navigator.platform || "",
    userAgent: navigator.userAgent || "",
  });
}

const isMac = detectIsMac();
const isWindows = detectIsWindows();
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

function sortCommands(cmds) {
  return [...cmds].sort((a, b) => {
    const ai = COMMAND_ORDER.indexOf(a.name);
    const bi = COMMAND_ORDER.indexOf(b.name);
    const aKey = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bKey = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return aKey - bKey || a.name.localeCompare(b.name);
  });
}

async function renderShortcuts(commandMap) {
  const list = document.getElementById("shortcut-list");
  const cmds = sortCommands(
    commandMap ? [...commandMap.values()] : await chrome.commands.getAll(),
  );
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

/** @type {string | null} */
let recordingCommandId = null;
/** @type {((e: KeyboardEvent) => void) | null} */
let recordingKeyHandler = null;

function stopExternalHotkeyRecording() {
  if (recordingKeyHandler) {
    window.removeEventListener("keydown", recordingKeyHandler, true);
    recordingKeyHandler = null;
  }
  recordingCommandId = null;
}

/**
 * Normalize stored External hotkey mappings via the generator contract.
 * @param {unknown} raw
 * @returns {Array<{ commandId: string, ahkHotkey: string, label?: string }>}
 */
function normalizeAhkExternalMappings(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {Array<{ commandId: string, ahkHotkey: string, label?: string }>} */
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const normalized = normalizeExternalHotkeyMapping(row);
    if (!normalized || seen.has(normalized.commandId)) continue;
    seen.add(normalized.commandId);
    out.push(normalized);
  }
  return out;
}
async function loadAhkExternalMappings() {
  const stored = await chrome.storage.local.get({ [AHK_BRIDGE_STORAGE.externalMappings]: [] });
  return normalizeAhkExternalMappings(stored[AHK_BRIDGE_STORAGE.externalMappings]);
}

async function saveAhkExternalMappings(mappings) {
  const normalized = normalizeAhkExternalMappings(mappings);
  await chrome.storage.local.set({ [AHK_BRIDGE_STORAGE.externalMappings]: normalized });
  flashSaved();
  return normalized;
}

/**
 * @param {chrome.commands.Command[] | Iterable<chrome.commands.Command>} cmds
 * @returns {Record<string, string>}
 */
function commandShortcutsFromCommands(cmds) {
  /** @type {Record<string, string>} */
  const out = {};
  for (const cmd of cmds) {
    if (!cmd?.name || cmd.name === "_execute_action") continue;
    out[cmd.name] = typeof cmd.shortcut === "string" ? cmd.shortcut : "";
  }
  return out;
}

async function loadAhkLastChordSnapshot() {
  const stored = await chrome.storage.local.get({ [AHK_BRIDGE_STORAGE.lastChordSnapshot]: null });
  const raw = stored[AHK_BRIDGE_STORAGE.lastChordSnapshot];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  /** @type {Record<string, string>} */
  const out = {};
  for (const [commandId, shortcut] of Object.entries(raw)) {
    out[commandId] = typeof shortcut === "string" ? shortcut : "";
  }
  return out;
}

async function saveAhkLastChordSnapshot(snapshot) {
  const next =
    snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) ? { ...snapshot } : {};
  await chrome.storage.local.set({ [AHK_BRIDGE_STORAGE.lastChordSnapshot]: next });
  return next;
}

async function loadAhkDriftDismissedFingerprint() {
  const stored = await chrome.storage.local.get({ [AHK_BRIDGE_STORAGE.driftDismissedFingerprint]: "" });
  return typeof stored[AHK_BRIDGE_STORAGE.driftDismissedFingerprint] === "string"
    ? stored[AHK_BRIDGE_STORAGE.driftDismissedFingerprint]
    : "";
}

async function saveAhkDriftDismissedFingerprint(fingerprint) {
  await chrome.storage.local.set({
    [AHK_BRIDGE_STORAGE.driftDismissedFingerprint]: typeof fingerprint === "string" ? fingerprint : "",
  });
}

/**
 * Fingerprint of mapped Command chords (current + last generate) for dismiss persistence.
 * Hint returns when mappings or chords change enough to alter this value.
 *
 * @param {Array<{ commandId: string }>} mappings
 * @param {Record<string, string>} commandShortcuts
 * @param {Record<string, string> | null} lastSnapshot
 */
function ahkDriftFingerprint(mappings, commandShortcuts, lastSnapshot) {
  const ids = [...new Set(mappings.map((row) => row.commandId))].sort();
  /** @type {Record<string, { current: string, last: string }>} */
  const rows = {};
  for (const id of ids) {
    rows[id] = {
      current: typeof commandShortcuts?.[id] === "string" ? commandShortcuts[id] : "",
      last: typeof lastSnapshot?.[id] === "string" ? lastSnapshot[id] : "",
    };
  }
  return JSON.stringify(rows);
}

/**
 * @param {Map<string, chrome.commands.Command> | null | undefined} commandMap
 */
async function buildAhkGenerateInput(commandMap) {
  const cmds = commandMap ? [...commandMap.values()] : await chrome.commands.getAll();
  const mappings = await loadAhkExternalMappings();
  const commandShortcuts = commandShortcutsFromCommands(cmds);
  const lastSnapshot = await loadAhkLastChordSnapshot();
  return { mappings, commandShortcuts, lastSnapshot };
}

async function currentCommandMap() {
  const cmds = await chrome.commands.getAll();
  return new Map(cmds.map((cmd) => [cmd.name, cmd]));
}

/**
 * @param {Map<string, chrome.commands.Command> | null | undefined} commandMap
 */
async function downloadAhkBridgeScript(commandMap) {
  const { mappings, commandShortcuts, lastSnapshot } = await buildAhkGenerateInput(commandMap);
  const result = generateAhkBridge({ mappings, commandShortcuts, lastSnapshot });
  if (!result.eligible || !result.scriptText) return;

  const blob = new Blob([result.scriptText], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = url;
    a.download = AHK_SCRIPT_FILENAME;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(url);
  }

  // Successful generate stores the live chord snapshot and clears dismiss state.
  await saveAhkLastChordSnapshot(commandShortcuts);
  await saveAhkDriftDismissedFingerprint("");
  await updateAhkDownloadUi(commandMap);
}

/**
 * Update Download eligibility, skip reasons, and expanded-only drift hint.
 * @param {Map<string, chrome.commands.Command> | null | undefined} commandMap
 */
async function updateAhkDownloadUi(commandMap) {
  if (!isWindows) return;
  const downloadBtn = document.getElementById("ahk-download");
  const reasonEl = document.getElementById("ahk-download-reason");
  const skipEl = document.getElementById("ahk-skip-reasons");
  const driftEl = document.getElementById("ahk-drift-hint");
  const panel = document.getElementById("ahk-bridge");
  if (!downloadBtn || !reasonEl || !skipEl || !driftEl || !panel) return;

  const { mappings, commandShortcuts, lastSnapshot } = await buildAhkGenerateInput(commandMap);
  const result = generateAhkBridge({ mappings, commandShortcuts, lastSnapshot });

  downloadBtn.disabled = !result.eligible;
  if (result.eligible) {
    reasonEl.textContent = "";
    reasonEl.hidden = true;
  } else {
    reasonEl.textContent = t(
      "ahkDownloadDisabledReason",
      undefined,
      "Need at least one External hotkey whose Command already has a Chrome target chord.",
    );
    reasonEl.hidden = false;
  }

  if (result.skippedUnbound.length > 0) {
    const labels = result.skippedUnbound.map((row) => {
      const meta = COMMAND_LABELS[row.commandId];
      const commandLabel = meta
        ? t(meta.key, undefined, meta.fallback)
        : row.commandId;
      const hotkey = row.label || row.ahkHotkey;
      return `${commandLabel} (${hotkey})`;
    });
    skipEl.textContent = t(
      "ahkSkipUnboundReason",
      [labels.join(", ")],
      `Skipped in script (Chrome target unbound): ${labels.join(", ")}`,
    );
    skipEl.hidden = false;
  } else {
    skipEl.textContent = "";
    skipEl.hidden = true;
  }

  const fingerprint = ahkDriftFingerprint(mappings, commandShortcuts, lastSnapshot);
  const dismissed = await loadAhkDriftDismissedFingerprint();
  const panelExpanded = panel instanceof HTMLDetailsElement ? panel.open : true;
  const showDrift = panelExpanded && result.drift && fingerprint !== dismissed;
  driftEl.hidden = !showDrift;
}

async function upsertAhkExternalMapping(mapping) {
  const current = await loadAhkExternalMappings();
  const next = current.filter((row) => row.commandId !== mapping.commandId);
  next.push({
    commandId: mapping.commandId,
    ahkHotkey: mapping.ahkHotkey,
    ...(mapping.label != null ? { label: mapping.label } : {}),
  });
  // Keep Command order stable for readability.
  next.sort((a, b) => {
    const ai = COMMAND_ORDER.indexOf(a.commandId);
    const bi = COMMAND_ORDER.indexOf(b.commandId);
    const aKey = ai === -1 ? Number.MAX_SAFE_INTEGER : ai;
    const bKey = bi === -1 ? Number.MAX_SAFE_INTEGER : bi;
    return aKey - bKey;
  });
  return saveAhkExternalMappings(next);
}

async function clearAhkExternalMapping(commandId) {
  const current = await loadAhkExternalMappings();
  return saveAhkExternalMappings(current.filter((row) => row.commandId !== commandId));
}

async function clearAllAhkBridgeState() {
  stopExternalHotkeyRecording();
  await chrome.storage.local.set(clearedAhkBridgeStorage());
}

/**
 * Non-Windows: muted Windows-only note, full AHK configurator hidden.
 * Windows: collapsed advanced panel available; note hidden.
 */
function applyAhkBridgePlatformGating() {
  const note = document.getElementById("ahk-windows-only");
  const panel = document.getElementById("ahk-bridge");
  if (note) note.hidden = isWindows;
  if (panel) panel.hidden = !isWindows;
}

function startExternalHotkeyRecording(commandId, commandMap) {
  stopExternalHotkeyRecording();
  recordingCommandId = commandId;

  recordingKeyHandler = async (e) => {
    if (recordingCommandId !== commandId) return;
    e.preventDefault();
    e.stopPropagation();

    const captured = captureExternalHotkey(e);
    if (!captured) return;

    // Detach capture before any modal so the confirm dialog cannot re-enter the listener.
    stopExternalHotkeyRecording();

    if (captured.cancel) {
      await renderAhkBridge(commandMap);
      return;
    }

    if (captured.highCollision) {
      const ok = confirm(t(
        "ahkHighCollisionWarn",
        undefined,
        "This External hotkey is commonly typed. While a supported browser window is usable, AutoHotkey will swallow it globally. Bind it anyway?",
      ));
      if (!ok) {
        await renderAhkBridge(commandMap);
        return;
      }
    }

    await upsertAhkExternalMapping({
      commandId,
      ahkHotkey: captured.ahkHotkey,
      label: captured.label,
    });
    await renderAhkBridge(commandMap);
  };

  window.addEventListener("keydown", recordingKeyHandler, true);
}

async function renderAhkBridge(commandMap) {
  applyAhkBridgePlatformGating();
  const list = document.getElementById("ahk-mapping-list");
  if (!list || !isWindows) return;

  const mappings = await loadAhkExternalMappings();
  const byCommand = new Map(mappings.map((row) => [row.commandId, row]));
  const cmds = sortCommands(
    commandMap ? [...commandMap.values()] : await chrome.commands.getAll(),
  );

  list.innerHTML = "";
  for (const cmd of cmds) {
    if (cmd.name === "_execute_action") continue;
    const meta = COMMAND_LABELS[cmd.name];
    if (!meta) continue;

    const mapping = byCommand.get(cmd.name);
    const targetMissing = !cmd.shortcut;
    const isRecording = recordingCommandId === cmd.name;

    const row = document.createElement("div");
    row.className = "ahk-mapping-row" + (targetMissing ? " is-target-missing" : "");

    const name = document.createElement("div");
    name.className = "cmd-name";
    name.textContent = t(meta.key, undefined, meta.fallback);
    if (targetMissing) {
      const small = document.createElement("small");
      small.textContent = t(
        "ahkChromeTargetMissing",
        undefined,
        "Chrome target chord missing",
      );
      name.appendChild(small);
    }

    const external = document.createElement("div");
    external.className = "ahk-external";
    const hotkeyLabel = document.createElement("span");
    hotkeyLabel.className = "hotkey-label" + (mapping ? "" : " is-empty");
    if (isRecording) {
      hotkeyLabel.textContent = t("ahkRecording", undefined, "Press a key…");
    } else if (mapping) {
      hotkeyLabel.textContent = mapping.label || mapping.ahkHotkey;
    } else {
      hotkeyLabel.textContent = t("ahkNoExternal", undefined, "No External hotkey");
    }
    external.appendChild(hotkeyLabel);
    if (mapping && !isRecording) {
      const ahkSyntax = document.createElement("span");
      ahkSyntax.className = "hotkey-ahk";
      ahkSyntax.textContent = mapping.ahkHotkey;
      external.appendChild(ahkSyntax);
    }

    const actions = document.createElement("div");
    actions.className = "ahk-mapping-actions";

    const recordBtn = document.createElement("button");
    recordBtn.type = "button";
    recordBtn.className = "btn-ghost" + (isRecording ? " is-recording" : "");
    recordBtn.textContent = isRecording
      ? t("ahkRecording", undefined, "Press a key…")
      : t("ahkRecordExternal", undefined, "Record");
    recordBtn.addEventListener("click", async () => {
      if (recordingCommandId === cmd.name) {
        stopExternalHotkeyRecording();
        await renderAhkBridge(commandMap);
        return;
      }
      startExternalHotkeyRecording(cmd.name, commandMap);
      await renderAhkBridge(commandMap);
    });
    actions.appendChild(recordBtn);

    if (mapping && !isRecording) {
      const clearBtn = document.createElement("button");
      clearBtn.type = "button";
      clearBtn.className = "btn-ghost";
      clearBtn.textContent = t("ahkClearExternal", undefined, "Clear");
      clearBtn.addEventListener("click", async () => {
        stopExternalHotkeyRecording();
        await clearAhkExternalMapping(cmd.name);
        await renderAhkBridge(commandMap);
      });
      actions.appendChild(clearBtn);
    }

    row.append(name, external, actions);
    list.appendChild(row);
  }

  await updateAhkDownloadUi(commandMap);
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
  await renderAhkBridge(commandMap);
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

  // AHK bridge: download, clear-all, drift dismiss, expanded-only drift chrome
  applyAhkBridgePlatformGating();
  const ahkPanel = document.getElementById("ahk-bridge");
  const ahkDownloadBtn = document.getElementById("ahk-download");
  const ahkClearMappingsBtn = document.getElementById("ahk-clear-mappings");
  const ahkDriftDismissBtn = document.getElementById("ahk-drift-dismiss");
  if (ahkDownloadBtn) {
    ahkDownloadBtn.addEventListener("click", async () => {
      if (ahkDownloadBtn.disabled) return;
      await downloadAhkBridgeScript(await currentCommandMap());
    });
  }
  if (ahkClearMappingsBtn) {
    ahkClearMappingsBtn.addEventListener("click", async () => {
      if (!confirm(t(
        "ahkClearMappingsConfirm",
        undefined,
        "Clear all External hotkey mappings and AHK bridge download snapshot state?",
      ))) return;
      await clearAllAhkBridgeState();
      flashSaved();
      await renderAhkBridge(await currentCommandMap());
    });
  }
  if (ahkDriftDismissBtn) {
    ahkDriftDismissBtn.addEventListener("click", async () => {
      const commandMap = await currentCommandMap();
      const { mappings, commandShortcuts, lastSnapshot } = await buildAhkGenerateInput(commandMap);
      const fingerprint = ahkDriftFingerprint(mappings, commandShortcuts, lastSnapshot);
      await saveAhkDriftDismissedFingerprint(fingerprint);
      await updateAhkDownloadUi(commandMap);
    });
  }
  if (ahkPanel instanceof HTMLDetailsElement) {
    ahkPanel.addEventListener("toggle", async () => {
      await updateAhkDownloadUi(await currentCommandMap());
    });
  }

  // Reset to defaults (playback settings only — AHK bridge companion state stays intact)
  document.getElementById("reset-defaults").addEventListener("click", async () => {
    if (!confirm(t(
      "confirmResetDefaults",
      undefined,
      "Reset all PlaybackKeys settings to defaults? This won't remove granted site permissions.",
    ))) return;
    if (!resetPatchOmitsAhkBridgeStorage(DEFAULTS)) {
      throw new Error("DEFAULTS must omit AHK bridge storage keys");
    }
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
