// Build a sideload-ready plugin folder + zip in dist/.
//
//   dist/BrushBuddy/
//     manifest.json
//     index.html
//     index.js
//   dist/BrushBuddy.zip
//
// Install in UDT (UXP Developer Tool): Add Plugin → pick the manifest.json
// inside dist/BrushBuddy/.

import { execSync } from "node:child_process";
import { mkdirSync, rmSync, copyFileSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const distDir = join(root, "dist");
const pluginDir = join(distDir, "BrushBuddy");
const zipPath = join(distDir, "BrushBuddy.zip");

console.log("[package] running webpack build…");
execSync("npm run build", { cwd: root, stdio: "inherit" });

console.log("[package] preparing dist folder…");
rmSync(distDir, { recursive: true, force: true });
mkdirSync(pluginDir, { recursive: true });

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
delete manifest.icons;
writeFileSync(join(pluginDir, "manifest.json"), JSON.stringify(manifest, null, 2));

copyFileSync(join(root, "index.html"), join(pluginDir, "index.html"));
copyFileSync(join(root, "index.js"), join(pluginDir, "index.js"));

console.log("[package] zipping…");
const psCmd = `Compress-Archive -Path '${pluginDir}\\*' -DestinationPath '${zipPath}' -Force`;
execSync(`powershell -NoProfile -Command "${psCmd}"`, { cwd: root, stdio: "inherit" });

if (!existsSync(zipPath)) {
  console.error("[package] zip failed — Compress-Archive did not produce output");
  process.exit(1);
}

console.log(`[package] done.`);
console.log(`  folder: ${pluginDir}`);
console.log(`  zip:    ${zipPath}`);
