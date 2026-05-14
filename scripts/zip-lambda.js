#!/usr/bin/env node
// Usage: node zip-lambda.js <lambda-dir>
// Zips dist/ contents + node_modules/ into function.zip.
// Files from dist/ land at the ZIP root (index.js, not dist/index.js).

const path = require("path");
const fs = require("fs");
const { execFileSync } = require("child_process");

const lambdaDir = path.resolve(process.argv[2]);
const zipPath = path.join(lambdaDir, "function.zip");
const distPath = path.join(lambdaDir, "dist");
const modsPath = path.join(lambdaDir, "node_modules");
const stagingPath = path.join(lambdaDir, "_staging");

if (!fs.existsSync(distPath)) {
  console.error("dist/ not found in", lambdaDir);
  process.exit(1);
}

if (fs.existsSync(zipPath)) fs.unlinkSync(zipPath);

// Stage: copy dist/* and node_modules/ into a flat staging dir,
// then zip the staging dir contents so index.js lands at the ZIP root.
const psScript = `
$ErrorActionPreference = 'Stop'
$zip     = '${zipPath.replace(/\\/g, "\\\\")}'
$dist    = '${distPath.replace(/\\/g, "\\\\")}'
$mods    = '${modsPath.replace(/\\/g, "\\\\")}'
$staging = '${stagingPath.replace(/\\/g, "\\\\")}'

# Clean and recreate staging dir
if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null

# Copy dist CONTENTS (not the dist folder itself) into staging root
Copy-Item -Path "$dist\\*" -Destination $staging -Recurse

# Copy node_modules folder into staging
Copy-Item -Path $mods -Destination "$staging\\node_modules" -Recurse

# Zip everything inside staging (contents land at zip root)
$items = Get-ChildItem -Path $staging | ForEach-Object { $_.FullName }
Compress-Archive -Path $items -DestinationPath $zip

# Cleanup staging
Remove-Item $staging -Recurse -Force

Write-Host "Created $zip"
`;

execFileSync(
  "powershell.exe",
  ["-NoProfile", "-NonInteractive", "-Command", psScript],
  { stdio: "inherit" }
);
