/**
 * zh_CN AHK bridge panel copy (#19).
 * Seam: _locales/zh_CN/messages.json (AHK user-visible message strings).
 *
 * Acceptance: panel prose is Chinese; glossary terms External hotkey,
 * Command, and AHK bridge script stay English where they appear.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function loadMessages(locale) {
  return JSON.parse(
    readFileSync(join(ROOT, `_locales/${locale}/messages.json`), "utf8"),
  );
}

const HAS_CJK = /[\u3400-\u9fff]/;
const en = loadMessages("en");
const zh = loadMessages("zh_CN");

/** Panel / clear-all strings that must be Chinese prose (not en walls). */
const PANEL_PROSE_KEYS = [
  "ahkWindowsOnly",
  "ahkBridgeTitle",
  "ahkBridgeDesc",
  "ahkBridgeNote",
  "ahkBridgeGuidance",
  "ahkClearMappings",
  "ahkClearMappingsConfirm",
];

/** All user-visible AHK keys that should be localized (short labels too). */
const ALL_AHK_KEYS = [
  ...PANEL_PROSE_KEYS,
  "ahkRecordExternal",
  "ahkRecording",
  "ahkClearExternal",
  "ahkNoExternal",
  "ahkChromeTargetMissing",
  "ahkHighCollisionWarn",
  "ahkDownload",
  "ahkDownloadDisabledReason",
  "ahkSkipUnboundReason",
  "ahkDriftHint",
  "ahkDriftDismiss",
];

for (const key of ALL_AHK_KEYS) {
  assert(en[key]?.message, `en missing ${key}`);
  assert(zh[key]?.message, `zh_CN missing ${key}`);
}

// --- Slice 1: panel title/desc/note/guidance/clear-all are Chinese prose ---

for (const key of PANEL_PROSE_KEYS) {
  const zhMsg = zh[key].message;
  const enMsg = en[key].message;
  assert(
    zhMsg !== enMsg,
    `${key}: zh_CN must not mirror English wall of text`,
  );
  assert(
    HAS_CJK.test(zhMsg),
    `${key}: zh_CN must contain Chinese characters, got: ${zhMsg}`,
  );
}

// --- Slice 2: glossary terms stay English where the English source uses them ---

function assertKeepsGlossaryTerm(key, term) {
  const enMsg = en[key].message;
  if (!enMsg.includes(term)) return;
  assert(
    zh[key].message.includes(term),
    `${key}: must keep glossary term "${term}" in English`,
  );
}

for (const key of ALL_AHK_KEYS) {
  assertKeepsGlossaryTerm(key, "External hotkey");
  assertKeepsGlossaryTerm(key, "Command");
  assertKeepsGlossaryTerm(key, "AHK bridge script");
  assertKeepsGlossaryTerm(key, "AutoHotkey");
}

// Plural forms in English still map to the singular glossary stem in Chinese copy.
for (const key of ALL_AHK_KEYS) {
  const enMsg = en[key].message;
  const zhMsg = zh[key].message;
  if (/\bExternal hotkeys\b/.test(enMsg)) {
    assert(
      zhMsg.includes("External hotkey"),
      `${key}: English "External hotkeys" → keep "External hotkey" in zh_CN`,
    );
  }
  if (/\bCommands\b/.test(enMsg)) {
    assert(
      zhMsg.includes("Command"),
      `${key}: English "Commands" → keep "Command" in zh_CN`,
    );
  }
}

console.log("ahk-zh-cn-locale-test: ok");
