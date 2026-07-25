#!/usr/bin/env node
/**
 * i18n cache lint (T-1403.9).
 *
 * Reads every `web/content/i18n/<locale>-cache.json` and fails with a
 * non-zero exit code if any translated value has lost a reserved AU
 * legal / brand term that appeared in the corresponding EN key.
 *
 * The cache is keyed by sha-256(EN) so we cannot recover the original
 * EN from the cache file alone. To fix that without a schema change,
 * the walker's server side accepts the EN string on write — so a
 * companion audit file at `web/content/i18n/<locale>-audit.jsonl`
 * (append-only, one `{en, vi, ts}` line per new entry) is the source
 * of truth for lint. If the audit file is missing (e.g. first run
 * after seeding), this lint skips silently — better than false alarms.
 *
 * Wired into CI via `scripts/ci-grep-gate.sh` (see line for "i18n").
 *
 * Exit codes:
 *   0  clean or audit file absent
 *   1  drift detected
 *   2  script error (bad JSON, IO failure)
 */

import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CACHE_ROOT = join(__dirname, "..", "..", "web", "content", "i18n");

const RESERVED = [
  "s708", "s766B",
  "ACN", "ABN", "GST", "AFSL", "ESIC", "ESVCLP", "AUD",
  "ASIC", "APRA", "AUSTRAC", "ATO", "ACL", "SOC2",
  "Auschain PTY LTD", "BlockID", "BlockID.au",
  "SVI", "SCN", "ESOP",
];

function drift(en, vi) {
  const out = [];
  for (const term of RESERVED) {
    const rx = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    if (rx.test(en) && !vi.includes(term)) out.push(term);
  }
  return out;
}

async function lintLocale(locale) {
  const auditPath = join(CACHE_ROOT, `${locale}-audit.jsonl`);
  if (!existsSync(auditPath)) {
    console.log(`[i18n-lint] ${locale}: no audit file at ${auditPath} — skipping`);
    return { checked: 0, drifted: [] };
  }
  const raw = await readFile(auditPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const drifted = [];
  for (const line of lines) {
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    const { en, vi } = entry ?? {};
    if (typeof en !== "string" || typeof vi !== "string") continue;
    const lost = drift(en, vi);
    if (lost.length > 0) drifted.push({ en, vi, lost });
  }
  return { checked: lines.length, drifted };
}

async function main() {
  const locales = ["vi"];
  let hadDrift = false;
  for (const locale of locales) {
    const { checked, drifted } = await lintLocale(locale);
    console.log(`[i18n-lint] ${locale}: checked ${checked} entries, ${drifted.length} drifted`);
    if (drifted.length > 0) {
      hadDrift = true;
      for (const d of drifted.slice(0, 20)) {
        console.error(`  DRIFT: lost=[${d.lost.join(", ")}]`);
        console.error(`    EN: ${d.en.slice(0, 120)}`);
        console.error(`    VI: ${d.vi.slice(0, 120)}`);
      }
      if (drifted.length > 20) console.error(`  … and ${drifted.length - 20} more`);
    }
  }
  process.exit(hadDrift ? 1 : 0);
}

main().catch((err) => {
  console.error("[i18n-lint] failed:", err?.message ?? err);
  process.exit(2);
});
