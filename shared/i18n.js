(function () {
  function getMessage(key, substitutions, fallback) {
    try {
      if (globalThis.chrome && chrome.i18n && typeof chrome.i18n.getMessage === "function") {
        const value = chrome.i18n.getMessage(key, substitutions);
        if (value) return value;
      }
    } catch {
      // Local dev pages can run without the Chrome extension APIs.
    }
    return fallback || key;
  }

  function localizeDocument() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const fallback = el.textContent;
      const value = getMessage(el.dataset.i18n, undefined, fallback);
      if (value) el.textContent = value;
    });

    document.querySelectorAll("[data-i18n-html]").forEach((el) => {
      const fallback = el.innerHTML;
      const value = getMessage(el.dataset.i18nHtml, undefined, fallback);
      if (value) el.innerHTML = value;
    });

    document.querySelectorAll("[data-i18n-attr]").forEach((el) => {
      for (const pair of el.dataset.i18nAttr.split(",")) {
        const [attr, key] = pair.split(":").map((part) => part.trim());
        if (!attr || !key) continue;
        const fallback = el.getAttribute(attr) || "";
        const value = getMessage(key, undefined, fallback);
        if (value) el.setAttribute(attr, value);
      }
    });
  }

  globalThis.PlaybackKeysI18n = { t: getMessage, localizeDocument };

  if (document.body) {
    localizeDocument();
  } else if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", localizeDocument, { once: true });
  } else {
    localizeDocument();
  }
})();
