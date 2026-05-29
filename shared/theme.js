(function () {
  const STORAGE_KEY = "themeMode";
  const DEFAULT_MODE = "system";
  const VALID_MODES = new Set(["system", "light", "dark"]);
  const LOCAL_FALLBACK_KEY = "playbackkeys:themeMode";
  const media = typeof matchMedia === "function"
    ? matchMedia("(prefers-color-scheme: dark)")
    : null;

  let currentMode = DEFAULT_MODE;

  function normalizeThemeMode(mode) {
    return VALID_MODES.has(mode) ? mode : DEFAULT_MODE;
  }

  function effectiveTheme(mode) {
    const normalized = normalizeThemeMode(mode);
    if (normalized === "light" || normalized === "dark") return normalized;
    return media && media.matches ? "dark" : "light";
  }

  function applyThemeMode(mode) {
    currentMode = normalizeThemeMode(mode);
    const theme = effectiveTheme(currentMode);
    document.documentElement.dataset.themeMode = currentMode;
    document.documentElement.dataset.theme = theme;
  }

  function getLocalThemeMode() {
    try {
      return normalizeThemeMode(localStorage.getItem(LOCAL_FALLBACK_KEY));
    } catch {
      return DEFAULT_MODE;
    }
  }

  function setLocalThemeMode(mode) {
    try {
      localStorage.setItem(LOCAL_FALLBACK_KEY, normalizeThemeMode(mode));
    } catch {
      // Ignore storage failures; the current page can still repaint.
    }
  }

  async function getThemeMode() {
    try {
      if (globalThis.chrome && chrome.storage && chrome.storage.local) {
        const stored = await chrome.storage.local.get({ [STORAGE_KEY]: DEFAULT_MODE });
        return normalizeThemeMode(stored[STORAGE_KEY]);
      }
    } catch {
      // Local preview pages can run without extension storage.
    }
    return getLocalThemeMode();
  }

  async function setThemeMode(mode) {
    const next = normalizeThemeMode(mode);
    applyThemeMode(next);
    setLocalThemeMode(next);
    try {
      if (globalThis.chrome && chrome.storage && chrome.storage.local) {
        await chrome.storage.local.set({ [STORAGE_KEY]: next });
        return next;
      }
    } catch {
      // Fall back to localStorage below for local previews.
    }
    return next;
  }

  async function initTheme() {
    applyThemeMode(getLocalThemeMode());
    applyThemeMode(await getThemeMode());
  }

  if (globalThis.chrome && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes[STORAGE_KEY]) return;
      applyThemeMode(changes[STORAGE_KEY].newValue);
    });
  }

  if (media) {
    const onSystemThemeChange = () => {
      if (currentMode === "system") applyThemeMode(currentMode);
    };
    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", onSystemThemeChange);
    } else if (typeof media.addListener === "function") {
      media.addListener(onSystemThemeChange);
    }
  }

  globalThis.PlaybackKeysTheme = {
    getThemeMode,
    setThemeMode,
    applyThemeMode,
    normalizeThemeMode,
    effectiveTheme: () => effectiveTheme(currentMode),
  };

  initTheme();
})();
