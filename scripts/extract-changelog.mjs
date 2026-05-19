import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const tag = process.env.GITHUB_REF_NAME || process.argv[2];
if (!tag) {
  console.error("Usage: extract-changelog.mjs <tag>  (or set GITHUB_REF_NAME)");
  process.exit(1);
}
const version = tag.startsWith("v") ? tag.slice(1) : tag;

const changelog = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
const lines = changelog.split("\n");

let start = -1;
let end = lines.length;
for (let i = 0; i < lines.length; i++) {
  const match = lines[i].match(/^## \[([^\]]+)\]/);
  if (!match) continue;
  if (start === -1 && match[1] === version) {
    start = i + 1;
    continue;
  }
  if (start !== -1) {
    end = i;
    break;
  }
}

if (start === -1) {
  console.error(`No CHANGELOG section found for version ${version}.`);
  process.exit(1);
}

const body = lines.slice(start, end).join("\n").trim() + "\n";
const outPath = process.argv[3] || join(ROOT, "dist", "release-notes.md");
writeFileSync(outPath, body);
console.log(`Wrote release notes for ${version} to ${outPath}`);
