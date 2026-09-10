#!/usr/bin/env node
// Check every official_url in the AU funding seed files still resolves.
//
// HEADs each URL with a browser User-Agent (GrantConnect / NT / CBRIN 403 or
// 429 non-browser UAs); falls back to a GET when HEAD is refused (405/403)
// because several gov.au CDNs reject HEAD outright. Prints one line per URL
// that did not answer 2xx/3xx (or timed out) so the /admin/funding reviewer
// can flag the row. Exit code 1 when any URL failed.
//
// Network-only tool — never run from vitest. Usage (from web/):
//   node scripts/verify-funding-urls.mjs                 # both seed files
//   node scripts/verify-funding-urls.mjs --only=grants   # or programs
//   node scripts/verify-funding-urls.mjs --concurrency=4 --timeout=15000
//   node scripts/verify-funding-urls.mjs --json          # machine-readable
//
// T0239 / G11 sprint S2. The G11-P7 refresh cron reuses the same check per
// row and bumps status_confidence → low on repeated failures.

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, "..");

const args = process.argv.slice(2);
const flag = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : def;
};
const ONLY = flag("only", "all");
const CONCURRENCY = Math.max(1, Number(flag("concurrency", "6")) || 6);
const TIMEOUT_MS = Math.max(1000, Number(flag("timeout", "12000")) || 12000);
const JSON_OUT = args.includes("--json");

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const HEADERS = {
  "user-agent": UA,
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-AU,en;q=0.9",
};

function readSeed(rel) {
  return JSON.parse(readFileSync(resolve(WEB_DIR, rel), "utf8"));
}

const targets = [];
if (ONLY !== "programs") {
  for (const g of readSeed("content/data/grants-au.seed.json").grants ?? []) {
    if (g.official_url) targets.push({ kind: "grant", id: g.id, url: g.official_url });
  }
}
if (ONLY !== "grants") {
  for (const p of readSeed("content/data/programs-au.seed.json").programs ?? []) {
    if (p.official_url) targets.push({ kind: "program", id: p.id, url: p.official_url });
  }
}

async function probe(url, method) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, headers: HEADERS, redirect: "follow", signal: ctrl.signal });
    // Drain a GET body so the socket is released promptly.
    if (method === "GET" && res.body) await res.arrayBuffer().catch(() => undefined);
    return { status: res.status, finalUrl: res.url };
  } finally {
    clearTimeout(timer);
  }
}

async function check(target) {
  const started = Date.now();
  try {
    let r = await probe(target.url, "HEAD");
    if (r.status === 405 || r.status === 403 || r.status === 404 || r.status >= 500) {
      r = await probe(target.url, "GET");
    }
    const ok = r.status >= 200 && r.status < 400;
    return { ...target, ok, status: r.status, finalUrl: r.finalUrl, ms: Date.now() - started };
  } catch (err) {
    const reason = err && err.name === "AbortError" ? "timeout" : String(err?.message ?? err);
    return { ...target, ok: false, status: 0, error: reason, ms: Date.now() - started };
  }
}

async function runPool(items, worker, size) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await worker(items[i]);
      }
    }),
  );
  return out;
}

const results = await runPool(targets, check, CONCURRENCY);
const failures = results.filter((r) => !r.ok);

if (JSON_OUT) {
  console.log(JSON.stringify({ checked: results.length, failed: failures.length, failures }, null, 2));
} else {
  console.log(`Checked ${results.length} URLs (${targets.filter((t) => t.kind === "grant").length} grants, ${targets.filter((t) => t.kind === "program").length} programs)`);
  for (const f of failures) {
    const why = f.error ? f.error : `HTTP ${f.status}`;
    console.log(`  ✗ ${f.kind.padEnd(7)} ${f.id.padEnd(44)} ${why.padEnd(10)} ${f.url}`);
  }
  console.log(failures.length ? `${failures.length} URL(s) need review.` : "All URLs answered 2xx/3xx.");
}

process.exit(failures.length ? 1 : 0);
