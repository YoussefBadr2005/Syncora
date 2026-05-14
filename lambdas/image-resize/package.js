const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = __dirname;
const out = path.join(root, "function.zip");
const stage = path.join(root, "dist");
const nmSrc = path.join(root, "node_modules");
const nmDst = path.join(stage, "node_modules");

if (fs.existsSync(out)) fs.unlinkSync(out);
if (fs.existsSync(nmDst)) fs.rmSync(nmDst, { recursive: true, force: true });

console.log("Copying node_modules into dist/...");
fs.cpSync(nmSrc, nmDst, { recursive: true });

console.log("Creating function.zip...");
execSync(
  `powershell -NoProfile -Command "Compress-Archive -Force -Path '${stage}\\*' -DestinationPath '${out}'"`,
  { stdio: "inherit" }
);

fs.rmSync(nmDst, { recursive: true, force: true });

const mb = (fs.statSync(out).size / 1024 / 1024).toFixed(1);
console.log(`\nfunction.zip ready — ${mb} MB`);
