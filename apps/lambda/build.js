#!/usr/bin/env node
/**
 * Build the Lambda deployment package.
 *
 * Output: build/taxtrace-lambda.zip — ready to upload via `aws lambda update-function-code`.
 *
 * Steps:
 *   1. esbuild src/index.ts → build/index.js (bundle Hono + Drizzle + handler)
 *   2. Copy the SQLite database in
 *   3. Copy native better-sqlite3 binary (Linux ARM64)
 *   4. Zip everything
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const esbuild = require("esbuild");

const ROOT = __dirname;
const BUILD = path.join(ROOT, "build");
const STAGE = path.join(BUILD, "stage");

fs.rmSync(BUILD, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

console.log("📦 Bundling Hono handler with esbuild…");
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "src/index.ts")],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "cjs",
  outfile: path.join(STAGE, "index.js"),
  external: ["better-sqlite3"], // keep native module external
  minify: true,
  sourcemap: false,
  logLevel: "info",
});

console.log("📋 Copying SQLite database…");
const dbSrc = path.resolve(ROOT, "../../packages/db/data/taxtrace.db");
const dbDst = path.join(STAGE, "taxtrace.db");
fs.copyFileSync(dbSrc, dbDst);
const dbSize = fs.statSync(dbDst).size;
console.log(`   taxtrace.db: ${(dbSize / 1024).toFixed(1)} KB`);

console.log("📋 Installing better-sqlite3 (skeleton)…");
const nodeModules = path.join(STAGE, "node_modules");
fs.mkdirSync(nodeModules, { recursive: true });

execSync(
  `npm install --prefix "${STAGE}" --no-package-lock --no-save --omit=dev better-sqlite3@11.7.0`,
  { stdio: "inherit", shell: true },
);

console.log("📥 Replacing macOS binary with Linux ARM64 prebuilt…");
const releaseDir = path.join(STAGE, "node_modules/better-sqlite3/build/Release");
fs.rmSync(releaseDir, { recursive: true, force: true });
fs.mkdirSync(releaseDir, { recursive: true });

// Download Linux ARM64 prebuilt binary from better-sqlite3 GitHub releases.
// NODE_MODULE_VERSION 127 = Node.js 22.x ABI.
const PREBUILD_URL =
  "https://github.com/WiseLibs/better-sqlite3/releases/download/v11.7.0/better-sqlite3-v11.7.0-node-v127-linux-arm64.tar.gz";

const tarGz = path.join(BUILD, "prebuild.tar.gz");
execSync(`curl -sL "${PREBUILD_URL}" -o "${tarGz}"`, { stdio: "inherit" });
execSync(`tar -xzf "${tarGz}" -C "${releaseDir}" --strip-components=2`, {
  stdio: "inherit",
  shell: true,
});

// Verify the binary
const binaryPath = path.join(releaseDir, "better_sqlite3.node");
if (!fs.existsSync(binaryPath)) {
  console.error("❌ Linux ARM64 binary missing after extraction");
  process.exit(1);
}
const stat = execSync(`file "${binaryPath}"`, { encoding: "utf8" });
console.log("   binary:", stat.trim());
if (!stat.includes("ELF") || !stat.includes("aarch64")) {
  console.error("❌ Binary is not Linux ARM64 ELF");
  process.exit(1);
}

console.log("🗜️ Creating zip…");
const zipPath = path.join(BUILD, "taxtrace-lambda.zip");
execSync(`cd "${STAGE}" && zip -qr "${zipPath}" .`, { stdio: "inherit" });
const zipSize = fs.statSync(zipPath).size;
console.log(`✅ Done: ${zipPath} (${(zipSize / 1024 / 1024).toFixed(2)} MB)`);
