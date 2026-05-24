import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_PATHS = [
  "manifest.json",
  "_locales",
  "service-worker.js",
  "content",
  "popup",
  "options",
  "onboarding",
  "shared",
  "icons/icon-16.png",
  "icons/icon-32.png",
  "icons/icon-48.png",
  "icons/icon-128.png",
  "LICENSE",
];
const REQUIRED_PERMISSIONS = ["storage", "tabs", "scripting", "contextMenus"];
const STORE_LISTING_LOCALES = {
  English: "en",
  Spanish: "es",
  "Portuguese Brazil": "pt_BR",
  German: "de",
  French: "fr",
  Turkish: "tr",
  Japanese: "ja",
  Korean: "ko",
  "Chinese Simplified": "zh_CN",
};
const STORE_SUPPORTED_SITES = ["YouTube", "Udemy", "Vimeo", "Coursera"];
const FORBIDDEN_PACKAGE_PATHS = [
  ".git",
  ".github",
  "docs",
  "assets",
  "README.md",
  "CHANGELOG.md",
  "icons/source",
  "package.json",
  "scripts",
  "tests",
];

function readJson(path) {
  return JSON.parse(readFileSync(join(ROOT, path), "utf8"));
}

function assert(condition, message) {
  if (!condition) {
    console.error(`\n[PlaybackKeys release check] ${message}`);
    process.exitCode = 1;
  }
}

function walk(path, out = []) {
  const abs = join(ROOT, path);
  const stat = statSync(abs);
  if (stat.isDirectory()) {
    for (const name of readdirSync(abs)) walk(join(path, name), out);
  } else {
    out.push(path);
  }
  return out;
}

function copyPath(srcRel, destRoot) {
  const src = join(ROOT, srcRel);
  const dest = join(destRoot, srcRel);
  const stat = statSync(src);
  if (stat.isDirectory()) {
    for (const name of readdirSync(src)) copyPath(join(srcRel, name), destRoot);
    return;
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}

function validateManifest() {
  const manifest = readJson("manifest.json");
  const pkg = readJson("package.json");

  assert(manifest.manifest_version === 3, "manifest_version must stay at 3.");
  assert(manifest.version === pkg.version, "manifest.json and package.json versions must match.");
  assert(!manifest.update_url, "Do not commit update_url; Chrome Web Store injects it.");
  for (const permission of REQUIRED_PERMISSIONS) {
    assert(manifest.permissions?.includes(permission), `Missing permission: ${permission}`);
  }
  assert(manifest.optional_host_permissions?.includes("*://*/*"), "Optional host permission should remain explicit.");

  const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
  const firstReleaseHeading = changelog.match(/^## \[([^\]]+)\]/m);
  assert(
    firstReleaseHeading && firstReleaseHeading[1] === manifest.version,
    `CHANGELOG.md's first release heading must be ## [${manifest.version}] (found: ${firstReleaseHeading ? firstReleaseHeading[1] : "none"}).`,
  );

  const tag = process.env.GITHUB_REF_NAME;
  if (tag) {
    assert(
      tag === `v${manifest.version}`,
      `Git tag ${tag} does not match expected v${manifest.version} (from manifest.json).`,
    );
  }
}

function validateRuntimeFiles() {
  for (const path of RUNTIME_PATHS) {
    assert(existsSync(join(ROOT, path)), `Missing runtime path: ${path}`);
  }
  for (const path of walk("content").concat(walk("popup"), walk("options"), walk("onboarding"), walk("shared"))) {
    assert(!path.endsWith(".map"), `Source map should not be packaged: ${path}`);
  }
}

function placeholderKeys(message) {
  return Object.keys(message.placeholders || {}).sort();
}

function validateLocales() {
  const localeRoot = join(ROOT, "_locales");
  assert(existsSync(localeRoot), "Missing _locales directory.");
  if (!existsSync(localeRoot)) return;

  const basePath = join(localeRoot, "en", "messages.json");
  assert(existsSync(basePath), "Missing _locales/en/messages.json.");
  if (!existsSync(basePath)) return;

  const base = readJson("_locales/en/messages.json");
  const baseKeys = Object.keys(base).sort();
  const localeDirs = readdirSync(localeRoot)
    .filter((name) => statSync(join(localeRoot, name)).isDirectory())
    .sort();

  for (const locale of localeDirs) {
    const relPath = `_locales/${locale}/messages.json`;
    assert(existsSync(join(ROOT, relPath)), `Missing ${relPath}.`);
    if (!existsSync(join(ROOT, relPath))) continue;

    const messages = readJson(relPath);
    const keys = Object.keys(messages).sort();
    const missing = baseKeys.filter((key) => !keys.includes(key));
    const extra = keys.filter((key) => !baseKeys.includes(key));
    assert(missing.length === 0, `${relPath} missing keys: ${missing.join(", ")}`);
    assert(extra.length === 0, `${relPath} has extra keys: ${extra.join(", ")}`);

    for (const key of baseKeys) {
      const entry = messages[key];
      if (!entry) continue;
      assert(typeof entry.message === "string" && entry.message.length > 0, `${relPath}:${key} must have a non-empty message.`);
      assert(typeof entry.description === "string" && entry.description.length > 0, `${relPath}:${key} must have a non-empty description.`);

      const expectedPlaceholders = placeholderKeys(base[key]);
      const actualPlaceholders = placeholderKeys(entry);
      assert(
        expectedPlaceholders.join("\0") === actualPlaceholders.join("\0"),
        `${relPath}:${key} placeholders must match en (${expectedPlaceholders.join(", ")}).`,
      );
    }
  }
}

function parseStoreListing() {
  const doc = readFileSync(join(ROOT, "docs/chrome-store-localized-listing.md"), "utf8");
  const sections = {};
  const matches = [...doc.matchAll(/^## (.+)$/gm)];

  for (let i = 0; i < matches.length; i += 1) {
    const heading = matches[i][1];
    const start = matches[i].index + matches[i][0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : doc.length;
    sections[heading] = doc.slice(start, end).trim();
  }

  return sections;
}

function validateStoreListing() {
  const sections = parseStoreListing();

  for (const [heading, locale] of Object.entries(STORE_LISTING_LOCALES)) {
    const section = sections[heading];
    assert(!!section, `Chrome Store listing is missing locale section: ${heading}.`);
    if (!section) continue;

    const localeMessages = readJson(`_locales/${locale}/messages.json`);
    const nameMatch = section.match(/^Extension name: (.+)$/m);
    const shortMatch = section.match(/^Short description: (.+)$/m);
    const fullMatch = section.match(/^Full description:\n\n([\s\S]+?)\n\nInternal search keywords,/m);

    assert(nameMatch?.[1] === localeMessages.appName.message, `${heading} store listing name must match _locales/${locale}/messages.json appName.`);
    assert(shortMatch?.[1] === localeMessages.appDescription.message, `${heading} store listing short description must match _locales/${locale}/messages.json appDescription.`);
    assert(!!fullMatch?.[1]?.trim(), `${heading} store listing must have a full description.`);
    assert(section.includes("https://github.com/mehmetdemircs/PlaybackKeys"), `${heading} store listing must include the source-code URL.`);
    assert(section.includes("https://mehmetdemircs.github.io/PlaybackKeys/PRIVACY/"), `${heading} store listing must include the privacy-policy URL.`);

    const fullDescription = fullMatch?.[1] || "";
    const siteIndexes = STORE_SUPPORTED_SITES.map((site) => fullDescription.indexOf(site));
    assert(siteIndexes.every((index) => index >= 0), `${heading} store listing full description must mention ${STORE_SUPPORTED_SITES.join(", ")}.`);
    assert(
      siteIndexes.every((index, i) => i === 0 || index > siteIndexes[i - 1]),
      `${heading} store listing must mention supported sites in this order: ${STORE_SUPPORTED_SITES.join(", ")}.`,
    );
  }
}

function makePackage() {
  validateManifest();
  validateRuntimeFiles();
  validateLocales();
  validateStoreListing();
  if (process.exitCode) process.exit(process.exitCode);

  const manifest = readJson("manifest.json");
  const distRoot = join(ROOT, "dist");
  const packageRoot = join(distRoot, "PlaybackKeys");
  const zipName = `PlaybackKeys-v${manifest.version}.zip`;
  const zipPath = join(distRoot, zipName);

  rmSync(packageRoot, { recursive: true, force: true });
  mkdirSync(packageRoot, { recursive: true });

  for (const path of RUNTIME_PATHS) copyPath(path, packageRoot);

  for (const forbidden of FORBIDDEN_PACKAGE_PATHS) {
    assert(!existsSync(join(packageRoot, forbidden)), `Forbidden package path included: ${forbidden}`);
  }
  if (process.exitCode) process.exit(process.exitCode);

  rmSync(zipPath, { force: true });
  execFileSync("zip", ["-qr", zipPath, "."], { cwd: packageRoot, stdio: "inherit" });

  const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert(
    entries.includes("manifest.json"),
    "ZIP must contain manifest.json at the root (Chrome Web Store requirement).",
  );
  assert(
    !entries.some((e) => e.startsWith("PlaybackKeys/")),
    "ZIP must not nest files under a PlaybackKeys/ directory.",
  );
  if (process.exitCode) process.exit(process.exitCode);

  console.log(`Created ${relative(ROOT, zipPath)}`);
}

validateManifest();
validateRuntimeFiles();
validateLocales();
validateStoreListing();

if (process.argv.includes("--package")) makePackage();
else if (!process.exitCode) console.log("PlaybackKeys release checks passed.");
