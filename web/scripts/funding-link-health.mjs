#!/usr/bin/env node
// W1 (2026-10-20, docs/pricing-v5-plan.md § 5) — weekly `official_url` health
// job for au_grants + au_programs. Read-only by default.
//
//   node scripts/funding-link-health.mjs                    # DB rows (seed files if no DB creds), report only
//   node scripts/funding-link-health.mjs --source seed      # the committed seed files
//   node scripts/funding-link-health.mjs --apply            # + DB writes (lead runs this)
//   --only grants|programs  --hide-after-days 7  --host-delay 1500  --concurrency 4
//   --timeout 15000  --out-dir <dir>  --json  --dry-run (no report files either)
//
// Polite: one request at a time per host with --host-delay ms between them,
// at most --concurrency hosts in flight, HEAD then GET (gov.au CDNs refuse
// HEAD), redirects followed by hand (loop / > 5 hops = broken), browser UA
// (GrantConnect / NT / CBRIN 403 non-browser UAs — same as
// scripts/verify-funding-urls.mjs), 15 s timeout. Loopback / private hosts
// are never probed.
//
// Writes content/reports/funding-link-health-latest.json (state: per row
// verdict + first_failed_at carried week to week, summary, proposals,
// proposed_sql) and appends the summary to funding-link-health.jsonl.
//
// --apply (needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY):
//   - rows broken ≥ --hide-after-days → status_confidence = 'low' (the
//     existing needs-review lever; no link-status column exists yet) and one
//     `unreachable` line each in grants-review-queue.jsonl for /admin/funding;
//   - when public.au_programs.link_status exists (proposed migration
//     supabase/pending-authority/0475_funding_link_status.sql, NOT applied),
//     link_status / link_checked_at / link_broken_since for every checked row.
// Never deletes, never changes `status`, never rewrites official_url
// (redirect targets are proposed as commented SQL for a human to verify).
//
// Exit: 0 ok, 1 when any row is broken ≥ the threshold, 2 on a crash.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { appendJsonl, envVal, readJson, WEB_DIR, writeJsonAtomic } from "./lib/ops-env.mjs";
import { MAX_FOLLOW_HOPS } from "./lib/link-check-core.mjs";
import {
  HIDE_AFTER_DAYS,
  buildProposals,
  formatHealth,
  groupByHost,
  mergeHealth,
  rowsFromDb,
  rowsFromSeeds,
  summarizeHealth,
} from "./lib/funding-link-health-core.mjs";
import { isPrivateHost } from "./link-check.mjs";

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
const HEADERS = { "user-agent": UA, accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8", "accept-language": "en-AU,en;q=0.9" };

export function parseHealthArgs(argv) {
  const out = { source: null, only: "all", apply: false, hideAfterDays: HIDE_AFTER_DAYS, hostDelayMs: 1500, concurrency: 4, timeoutMs: 15_000, outDir: null, json: false, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => (a.includes("=") ? a.split("=").slice(1).join("=") : argv[++i]);
    const key = a.split("=")[0];
    if (key === "--source") out.source = val() === "seed" ? "seed" : "db";
    else if (key === "--only") {
      const v = String(val() ?? "");
      out.only = v === "grants" || v === "programs" ? v : "all";
    }
    else if (key === "--apply") out.apply = true;
    else if (key === "--hide-after-days") out.hideAfterDays = Math.max(1, Number(val()) || HIDE_AFTER_DAYS);
    else if (key === "--host-delay") out.hostDelayMs = Math.max(0, Number(val()) || 0);
    else if (key === "--concurrency") out.concurrency = Math.max(1, Math.min(8, Number(val()) || 4));
    else if (key === "--timeout") out.timeoutMs = Math.max(1000, Number(val()) || 15_000);
    else if (key === "--out-dir") out.outDir = String(val() ?? "");
    else if (key === "--json") out.json = true;
    else if (key === "--dry-run") out.dryRun = true;
  }
  return out;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One URL, one method, redirects by hand. Never throws. */
async function follow(url, method, { fetchImpl, timeoutMs, lookup }) {
  const chain = [];
  const visited = new Set();
  let current = url;
  for (let hop = 0; hop <= MAX_FOLLOW_HOPS; hop++) {
    if (visited.has(current)) return { status: null, error: "redirect_loop", hops: hop, final_url: current };
    visited.add(current);
    let host;
    try {
      host = new URL(current).hostname;
    } catch {
      return { status: null, error: "bad_url", hops: hop, final_url: current };
    }
    if (await isPrivateHost(host, lookup)) return { status: null, error: "skipped_private", hops: hop, final_url: current };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    let res;
    try {
      res = await fetchImpl(current, { method, redirect: "manual", headers: HEADERS, signal: ctrl.signal });
    } catch (err) {
      const name = err instanceof Error ? err.name : "error";
      const code = err?.cause?.code ? String(err.cause.code) : "";
      return { status: null, error: name === "AbortError" ? "timeout" : code || name, hops: hop, final_url: current };
    } finally {
      clearTimeout(timer);
    }
    try {
      await res.body?.cancel();
    } catch {
      /* ignore */
    }
    const location = res.headers?.get?.("location");
    if (res.status >= 300 && res.status < 400 && location) {
      chain.push(current);
      try {
        current = new URL(location, current).toString();
      } catch {
        return { status: res.status, error: "bad_location", hops: hop + 1, final_url: null };
      }
      continue;
    }
    return { status: res.status, hops: chain.length, final_url: current };
  }
  return { status: null, error: "too_many_redirects", hops: MAX_FOLLOW_HOPS + 1, final_url: current };
}

/** HEAD, then GET when HEAD is refused / inconclusive. */
export async function checkUrl(url, deps) {
  const h = await follow(url, "HEAD", deps);
  if (h.error === "skipped_private" || h.error === "bad_url") return h;
  const retry = h.error || [401, 403, 404, 405, 429, 999].includes(h.status) || h.status >= 500;
  return retry ? follow(url, "GET", deps) : h;
}

/** Walk hosts with bounded concurrency; one request at a time per host. */
export async function checkAll(targets, { concurrency, hostDelayMs, ...deps }) {
  const hosts = Array.from(groupByHost(targets).values());
  const results = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, hosts.length) }, async () => {
      while (next < hosts.length) {
        const list = hosts[next++];
        for (let i = 0; i < list.length; i++) {
          if (i > 0 && hostDelayMs) await sleep(hostDelayMs);
          const t = list[i];
          const r = await checkUrl(t.url, deps);
          results.push({ kind: t.kind, id: t.id, url: t.url, ...r });
        }
      }
    }),
  );
  return results;
}

async function supabaseClient(env) {
  const rawUrl = envVal("SUPABASE_URL", env) || envVal("NEXT_PUBLIC_SUPABASE_URL", env);
  const key = envVal("SUPABASE_SERVICE_ROLE_KEY", env);
  if (!rawUrl || !key) return null;
  const { createClient } = await import("@supabase/supabase-js");
  return createClient(rawUrl, key, { auth: { persistSession: false } });
}

async function loadDbTargets(db, only) {
  const targets = [];
  if (only !== "programs") {
    const { data, error } = await db.from("au_grants").select("id,name,official_url,status,status_confidence,exclude_from_matching");
    if (error) throw new Error(`au_grants: ${error.message}`);
    targets.push(...rowsFromDb("grant", data));
  }
  if (only !== "grants") {
    const { data, error } = await db.from("au_programs").select("id,name,official_url,status,status_confidence");
    if (error) throw new Error(`au_programs: ${error.message}`);
    targets.push(...rowsFromDb("program", data));
  }
  return targets;
}

async function schemaHasLinkStatus(db) {
  if (!db) return false;
  const { error } = await db.from("au_programs").select("id,link_status").limit(1);
  return !error;
}

export async function main(argv = process.argv.slice(2), deps = {}) {
  const args = parseHealthArgs(argv);
  const log = deps.log ?? ((s) => process.stdout.write(`${s}\n`));
  const now = deps.now ? deps.now() : new Date();
  const outDir = args.outDir ? path.resolve(args.outDir) : path.join(WEB_DIR, "content", "reports");
  const latestFile = path.join(outDir, "funding-link-health-latest.json");

  const db = deps.db !== undefined ? deps.db : args.source === "seed" ? null : await supabaseClient(deps.env ?? process.env);
  if (args.apply && !db) {
    log("[funding-link-health] --apply needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (DB source) — nothing applied");
    return { exitCode: 2, summary: null };
  }
  const source = db ? "db" : "seed";
  let targets;
  if (db) targets = await loadDbTargets(db, args.only);
  else {
    const read = (rel) => JSON.parse(readFileSync(path.join(deps.webDir ?? WEB_DIR, rel), "utf8"));
    targets = rowsFromSeeds(read("content/data/grants-au.seed.json"), read("content/data/programs-au.seed.json"), args.only);
  }
  const hasLinkStatus = await schemaHasLinkStatus(db);

  const results = await checkAll(targets, {
    concurrency: args.concurrency,
    hostDelayMs: args.hostDelayMs,
    timeoutMs: args.timeoutMs,
    fetchImpl: deps.fetchImpl ?? globalThis.fetch,
    lookup: deps.lookup,
  });

  const prev = readJson(latestFile, null);
  const state = mergeHealth(prev?.rows ?? {}, results, now);
  const proposals = buildProposals(state, targets, { now, hideAfterDays: args.hideAfterDays, hasLinkStatus });
  const summary = summarizeHealth(state, proposals, { ts: now.toISOString(), source, hasLinkStatus, hideAfterDays: args.hideAfterDays, now });

  if (args.apply && db) {
    const applied = { status_confidence_low: 0, link_status: 0, queued: 0, errors: [] };
    for (const m of proposals.mark_low) {
      const { error } = await db.from(m.table).update({ status_confidence: "low", updated_at: now.toISOString() }).eq("id", m.id);
      if (error) applied.errors.push(`${m.table}.${m.id}: ${error.message}`);
      else applied.status_confidence_low += 1;
    }
    for (const l of proposals.link_status) {
      const { error } = await db.from(l.table).update({ link_status: l.link_status, link_checked_at: now.toISOString(), link_broken_since: l.link_broken_since }).eq("id", l.id);
      if (error) applied.errors.push(`${l.table}.${l.id}: ${error.message}`);
      else applied.link_status += 1;
    }
    // /admin/funding reads the review queue (src/lib/funding/review-queue.ts).
    const queuePath = deps.queuePath ?? path.join(WEB_DIR, "content", "reports", "grants-review-queue.jsonl");
    for (const m of proposals.mark_low) {
      appendJsonl(queuePath, {
        ts: now.toISOString(),
        kind: m.table === "au_grants" ? "grant" : "program",
        id: m.id,
        url: m.url,
        reason: "unreachable",
        hint: { http_status: m.status ?? null, error: m.error ?? null, broken_since: m.broken_since, source: "funding-link-health" },
        current: { status_confidence: "low" },
      });
      applied.queued += 1;
    }
    summary.applied = applied;
  }

  if (!args.dryRun) {
    writeJsonAtomic(latestFile, { ...summary, rows: state });
    // History row: counts + the broken ids only (the full state lives in latest).
    appendJsonl(path.join(outDir, "funding-link-health.jsonl"), {
      ts: summary.ts,
      source: summary.source,
      checked: summary.checked,
      ok: summary.ok,
      broken: summary.broken,
      unverifiable: summary.unverifiable,
      broken_over_threshold: summary.broken_over_threshold,
      broken_ids: summary.broken_rows.map((b) => `${b.kind}:${b.id}`),
      ...(summary.applied ? { applied: summary.applied } : {}),
    });
  }
  log(args.json ? JSON.stringify(summary) : formatHealth(summary));
  if (summary.applied && !args.json) log(`  applied: ${JSON.stringify(summary.applied)}`);
  return { exitCode: summary.broken_over_threshold > 0 ? 1 : 0, summary, state };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then(
    ({ exitCode }) => process.exit(exitCode),
    (err) => {
      process.stderr.write(`[funding-link-health] crashed: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
      process.exit(2);
    },
  );
}
