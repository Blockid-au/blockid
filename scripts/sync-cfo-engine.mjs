#!/usr/bin/env node
/** Exact-source vendoring for the SVI CFO sandbox. No generated logic diverges.
 * node scripts/sync-cfo-engine.mjs [--check] [--source-root DIR] [--target-root DIR]
 */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
let sourceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let targetRoot;
let check = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--check") check = true;
  else if (["--source-root", "--target-root"].includes(args[i]) && args[i + 1] && !args[i + 1].startsWith("--")) {
    if (args[i++] === "--source-root") sourceRoot = resolve(args[i]);
    else targetRoot = resolve(args[i]);
  } else throw new Error(`Unknown or incomplete option: ${args[i]}`);
}
targetRoot ??= resolve(sourceRoot, "../startupvalueindex.com");
if (sourceRoot === targetRoot) throw new Error("Source and target repositories must differ");
const files = ["cfo-methodology-core.ts", "cfo-projection-core.ts", "cfo-assessment-drivers.ts", "cfo-projection-valuation.ts", "cfo-scenario.ts"];
const destination = join(targetRoot, "src/lib/valuation/cfo-shared");
const manifest = { schemaVersion: "cfo-shared-manifest/1", sourceDirectory: "web/src/lib/valuation", files: {} };
const sources = new Map();
// Read all source bytes before touching the target, so a missing source cannot
// leave a partly updated copy. Paths/clock timestamps are excluded from hashes.
for (const file of files) {
  const bytes = await readFile(join(sourceRoot, manifest.sourceDirectory, file));
  sources.set(file, bytes);
  manifest.files[file] = createHash("sha256").update(bytes).digest("hex");
}
const manifestBytes = JSON.stringify(manifest, null, 2) + "\n";
if (check) {
  const drift = [];
  for (const [file, bytes] of sources) {
    const current = await readFile(join(destination, file)).catch(() => null);
    if (!current || !current.equals(bytes)) drift.push(file);
  }
  const currentManifest = await readFile(join(destination, "manifest.json"), "utf8").catch(() => null);
  if (currentManifest !== manifestBytes) drift.push("manifest.json");
  if (drift.length) { process.stderr.write(`CFO shared source drift: ${drift.join(", ")}\n`); process.exitCode = 1; }
  else process.stdout.write(`CFO shared source check passed (${files.length} files).\n`);
} else {
  await mkdir(destination, { recursive: true });
  for (const [file, bytes] of sources) await writeFile(join(destination, file), bytes);
  await writeFile(join(destination, "manifest.json"), manifestBytes);
  process.stdout.write(`Synced ${files.length} CFO sources to ${destination}.\n`);
}
