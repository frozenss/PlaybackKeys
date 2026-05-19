import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RUNTIME_PATHS = [
  "manifest.json",
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

function makePackage() {
  validateManifest();
  validateRuntimeFiles();
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

if (process.argv.includes("--package")) makePackage();
else if (!process.exitCode) console.log("PlaybackKeys release checks passed.");
