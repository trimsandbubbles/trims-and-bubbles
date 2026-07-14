#!/usr/bin/env node
// Greps src/config/business.ts for TODO_CLIENT markers so nothing ships
// unnoticed. Run with: npm run check:placeholders

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const configPath = path.join(__dirname, "..", "src", "config", "business.ts");
const contents = readFileSync(configPath, "utf-8");

const lines = contents.split("\n");
const findings = [];

lines.forEach((line, i) => {
  if (line.includes("TODO_CLIENT")) {
    findings.push({ line: i + 1, text: line.trim() });
  }
});

if (findings.length === 0) {
  console.log("✅ No TODO_CLIENT placeholders remaining in src/config/business.ts — ready to launch!");
  process.exit(0);
}

console.log(
  `\n⚠️  ${findings.length} placeholder${findings.length === 1 ? "" : "s"} still need real content before launch (src/config/business.ts):\n`,
);
for (const f of findings) {
  console.log(`  L${f.line}: ${f.text}`);
}
console.log("\nFill these in, then re-run `npm run check:placeholders`.\n");
process.exit(1);
