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
};
// Interval 2/3 Commands stay keyboard-first (options + Chrome shortcuts), not onboarding.
const ORDER = [
  "1-play-pause", "2-speed-up", "3-skip-back", "4-skip-forward",
  "5-speed-down", "6-speed-reset", "7-switch-target",
];

// Suggested chord parts (just the digits) for the unbound commands.
const SUGGESTED = isMac
  ? {
      "5-speed-down":    ["⌘", "⇧", "7"],
      "6-speed-reset":   ["⌘", "⇧", "0"],
      "7-switch-target": null,
    }
  : {
      "5-speed-down":    ["Ctrl", "Shift", "7"],
      "6-speed-reset":   ["Ctrl", "Shift", "0"],
      "7-switch-target": null,
    };

function translateKey(p) {
  if (!isMac) return p;
  if (p === "Ctrl" || p === "Command") return "⌘";
  if (p === "Shift") return "⇧";
  if (p === "Alt") return "⌥";
  if (p === "MacCtrl") return "⌃";
  return p;
}

function chordParts(shortcut) {
  if (!shortcut) return null;
  // Windows/Linux format: "Ctrl+Shift+1"
  if (shortcut.includes("+")) {
    return shortcut.split("+").map((p) => translateKey(p.trim()));
  }
  // macOS format from chrome.commands.getAll() is a concatenated symbol
  // string like "⇧⌘1" with no separator. Split out modifier glyphs, leave
  // the trailing key as-is.
  const parts = [];
  let rest = shortcut;
  for (const sym of ["⌃", "⌥", "⇧", "⌘"]) {
    if (rest.includes(sym)) {
      parts.push(sym);
      rest = rest.replace(sym, "");
    }
  }
  if (rest) parts.push(rest);
  return parts.length > 0 ? parts : [shortcut];
}
function chordHTML(parts) {
  if (!parts) return `<span class="kbd-chord"><span class="key">${t("add", undefined, "add")}</span></span>`;
  return `<span class="kbd-chord">` +
    parts.map((p, i) => (i > 0 ? `<span class="plus">+</span>` : "") + `<span class="key">${p}</span>`).join("") +
    `</span>`;
}
function chordShort(parts) {
  if (!parts) return "—";
  return parts.join(isMac ? "" : "+");
}

async function renderShortcutList() {
  const cmds = await chrome.commands.getAll();
  const map = {};
  for (const c of cmds) map[c.name] = chordParts(c.shortcut);

  const list = document.getElementById("ob-shortcut-list");
  list.innerHTML = "";
  for (const name of ORDER) {
    const meta = COMMAND_LABELS[name];
    const liveChord = map[name];
    let chordEl;
    let extraClass = "";
    let suffix = "";
    if (liveChord) {
      chordEl = chordHTML(liveChord);
    } else if (SUGGESTED[name]) {
      // Suggested but not yet bound: show dimmed.
      chordEl = `<span class="kbd-chord suggested">` +
        SUGGESTED[name].map((p, i) => (i > 0 ? `<span class="plus">+</span>` : "") + `<span class="key">${p}</span>`).join("") +
        `</span>`;
      extraClass = "is-suggested";
      suffix = `<span class="ob-sc-tag">${t("suggested", undefined, "suggested")}</span>`;
    } else {
      chordEl = `<span class="kbd-chord unbound"><span class="key">${t("add", undefined, "add")}</span></span>`;
      extraClass = "is-unbound";
      suffix = `<span class="ob-sc-tag">${t("yourChoice", undefined, "your choice")}</span>`;
    }
    const row = document.createElement("div");
    row.className = "ob-sc-row " + extraClass;
    row.innerHTML = `${chordEl}<span class="name">${t(meta.key, undefined, meta.fallback)}</span>${suffix}`;
    list.appendChild(row);
  }

  // Apply chord text inside the demo control buttons.
  document.querySelectorAll("[data-chord]").forEach((el) => {
    const cmdName = el.dataset.chord;
    const parts = map[cmdName];
    el.innerHTML = parts ? chordHTML(parts) : chordHTML(null);
  });

  // Update callout copy: only show macOS screenshot note if Mac.
  if (!isMac) {
    document.getElementById("ob-callout-text").innerHTML =
      t("onboardingNonMacCallout", undefined, `Skip uses <b>3</b> and <b>4</b> by default. Rebind anything in <code>chrome://extensions/shortcuts</code>.`);
  }
}

(function wireDemo() {
  const demo  = document.getElementById("ob-demo");
  const ppEl  = document.getElementById("ob-pp");
  const ppIc  = document.getElementById("ob-pp-icon");
  const badgeV = document.getElementById("ob-badge-v");
  const progress = document.getElementById("ob-progress");
  const toastIc = document.getElementById("ob-toast-ic");
  const toastName = document.getElementById("ob-toast-name");
  const toastDet  = document.getElementById("ob-toast-det");

  const state = { playing: false, speed: 1, progress: 32 };
  let toastTimer = null;

  function fmtSpeed(s) { return `${s.toFixed(2)}×`; }
  function setIcon() {
    if (state.playing) {
      ppIc.innerHTML = `<polygon points="7,4 21,12 7,20" fill="#3a3a40"/>`;
    } else {
      ppIc.innerHTML = `<rect x="6" y="5" width="4" height="14" rx="1" fill="#3a3a40"/><rect x="14" y="5" width="4" height="14" rx="1" fill="#3a3a40"/>`;
    }
  }
  function bump() {
    ppEl.classList.add("bump");
    setTimeout(() => ppEl.classList.remove("bump"), 220);
  }
  function flash(name, det, glyph) {
    toastName.textContent = name;
    toastDet.textContent  = det;
    toastIc.textContent   = glyph;
    demo.classList.add("toast-on");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => demo.classList.remove("toast-on"), 1300);
  }
  function applySpeed() {
    badgeV.textContent = fmtSpeed(state.speed);
    demo.classList.toggle("has-speed", Math.abs(state.speed - 1) > 0.01);
  }
  function applyProgress() {
    progress.style.width = `${Math.max(0, Math.min(100, state.progress))}%`;
  }

  const actions = {
    toggle: () => {
      state.playing = !state.playing;
      setIcon();
      bump();
      flash(state.playing ? t("toastPlaying", undefined, "Playing") : t("toastPaused", undefined, "Paused"), "⌘⇧1", state.playing ? "▶" : "❚❚");
    },
    "skip-back": () => {
      state.progress = Math.max(0, state.progress - 8);
      applyProgress();
      bump();
      flash(t("commandSkipBack", undefined, "Skip back"), "−5s", "«");
    },
    "skip-forward": () => {
      state.progress = Math.min(100, state.progress + 8);
      applyProgress();
      bump();
      flash(t("commandSkipForward", undefined, "Skip forward"), "+5s", "»");
    },
    "speed-up": () => {
      state.speed = Math.min(4, Math.round((state.speed + 0.25) * 100) / 100);
      applySpeed();
      bump();
      flash(fmtSpeed(state.speed), "+0.25×", "+");
    },
    "speed-down": () => {
      state.speed = Math.max(0.25, Math.round((state.speed - 0.25) * 100) / 100);
      applySpeed();
      bump();
      flash(fmtSpeed(state.speed), "−0.25×", "−");
    },
  };

  document.querySelectorAll(".ob-control[data-act]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const fn = actions[btn.dataset.act];
      if (fn) fn();
    });
  });

  setIcon();
  applyProgress();
  applySpeed();
})();

function openSettings(e) {
  if (e) e.preventDefault();
  chrome.runtime.openOptionsPage();
}
document.getElementById("ob-go-settings").addEventListener("click", openSettings);
const inlineShortcuts = document.getElementById("ob-go-shortcuts-inline");
if (inlineShortcuts) {
  inlineShortcuts.addEventListener("click", (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
  });
}
const inlineSettings = document.getElementById("ob-go-settings-inline");
if (inlineSettings) inlineSettings.addEventListener("click", openSettings);
function openShortcuts(e) {
  if (e) e.preventDefault();
  chrome.tabs.create({ url: "chrome://extensions/shortcuts" });
}
document.getElementById("ob-go-shortcuts").addEventListener("click", openShortcuts);
document.getElementById("ob-open-shortcuts").addEventListener("click", openShortcuts);

renderShortcutList();
