#!/usr/bin/env node
// G8-P8 — render the phase × tier sidebar matrix + unlock criteria from code.
//
//   node scripts/docs/render-unlock-matrix.mjs            # write JSON + docs
//   node scripts/docs/render-unlock-matrix.mjs --check    # exit 1 when stale
//
// Writes:
//   web/content/generated/unlock-matrix.json   (rendered by /docs/unlocks)
//   docs/user/menu-walkthrough.md              (two marked sections only)
//
// The builder lives in ./unlock-matrix.ts and imports the live nav catalogue
// and gate engine through the `@/` alias; tsx's `tsImport` resolves both
// from web/tsconfig.json so this stays a plain `node` invocation (no build
// step, no tsx CLI on PATH). The colocated vitest re-runs the same builder
// and diffs against the committed files, so a nav / gate change without a
// docs refresh fails `npm test`.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { register as registerEsm } from "tsx/esm/api";
import { register as registerCjs } from "tsx/cjs/api";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "../..");
const repoRoot = resolve(webRoot, "..");

export const JSON_OUT = resolve(webRoot, "content/generated/unlock-matrix.json");
export const DOC_OUT = resolve(repoRoot, "docs/user/menu-walkthrough.md");

export async function loadBuilder() {
  // Register tsx for both loaders: web/ has no "type":"module", so
  // src/**/*.ts files resolve through the CJS path, and the `@/` tsconfig
  // alias must be installed there too (the ESM-only `tsImport` is not
  // enough). TSX_TSCONFIG_PATH keeps the alias correct when invoked from
  // outside web/.
  process.env.TSX_TSCONFIG_PATH ??= resolve(webRoot, "tsconfig.json");
  const unregisterCjs = registerCjs();
  const unregisterEsm = registerEsm({ tsconfig: process.env.TSX_TSCONFIG_PATH });
  try {
    return await import("./unlock-matrix.mts");
  } finally {
    await unregisterEsm();
    unregisterCjs();
  }
}

export async function render() {
  const mod = await loadBuilder();
  const matrix = mod.buildUnlockMatrix();
  const json = JSON.stringify(matrix, null, 2) + "\n";
  const doc = mod.applyToDoc(readFileSync(DOC_OUT, "utf8"), matrix);
  return { matrix, json, doc };
}

async function main() {
  const check = process.argv.includes("--check");
  const { json, doc } = await render();
  const stale = [];
  let currentJson = "";
  try {
    currentJson = readFileSync(JSON_OUT, "utf8");
  } catch {
    currentJson = "";
  }
  if (currentJson !== json) stale.push(JSON_OUT);
  if (readFileSync(DOC_OUT, "utf8") !== doc) stale.push(DOC_OUT);

  if (check) {
    if (stale.length > 0) {
      console.error("unlock-matrix: stale —\n  " + stale.join("\n  ") + "\nRun: node scripts/docs/render-unlock-matrix.mjs");
      process.exit(1);
    }
    console.log("unlock-matrix: up to date");
    return;
  }
  mkdirSync(dirname(JSON_OUT), { recursive: true });
  writeFileSync(JSON_OUT, json);
  writeFileSync(DOC_OUT, doc);
  console.log(`unlock-matrix: wrote ${stale.length === 0 ? "(no change) " : ""}${JSON_OUT}\n                       ${DOC_OUT}`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
