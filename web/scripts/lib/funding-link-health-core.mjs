// W1 (2026-10-20, docs/pricing-v5-plan.md § 5) — pure helpers for
// scripts/funding-link-health.mjs, the weekly `official_url` health job for
// au_grants / au_programs. No I/O; pinned by scripts/funding-link-health.test.mjs.
//
// State model (content/reports/funding-link-health-latest.json `rows`), keyed
// `<kind>:<id>`:
//   { kind, id, url, verdict: ok|broken|unverifiable, status, error,
//     final_url, hops, first_failed_at, last_ok_at, last_checked_at,
//     consecutive_failures }
// `first_failed_at` survives week to week while the same URL keeps failing;
// an `unverifiable` week (403/429 bot wall) neither starts nor clears it.
//
// Schema reality (0311_au_funding.sql): there is NO link-status column. The
// only existing lever is `status_confidence` ('low' = needs review, the same
// convention the seed files and the G11-P7 refresh cron use), so `--apply`
// writes `status_confidence = 'low'` for rows broken longer than the hide
// threshold, and the report carries a proposed additive migration
// (supabase/pending-authority/0475_funding_link_status.sql) that would let
// the directories hide them. When that column exists, proposals switch to it.

import { externalVerdict } from "./link-check-core.mjs";

export const HIDE_AFTER_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Seed files → check targets (rows excluded from matching are skipped). */
export function rowsFromSeeds(grantsSeed, programsSeed, only = "all") {
  const out = [];
  if (only !== "programs") {
    for (const g of grantsSeed?.grants ?? []) {
      if (!g?.id || !g.official_url || g.exclude_from_matching) continue;
      out.push({ kind: "grant", table: "au_grants", id: g.id, name: g.name ?? g.id, url: g.official_url, status: g.status ?? null, status_confidence: g.status_confidence ?? null });
    }
  }
  if (only !== "grants") {
    for (const p of programsSeed?.programs ?? []) {
      if (!p?.id || !p.official_url) continue;
      out.push({ kind: "program", table: "au_programs", id: p.id, name: p.name ?? p.id, url: p.official_url, status: p.status ?? null, status_confidence: p.status_confidence ?? null });
    }
  }
  return out;
}

/** DB rows (already selected) → check targets. */
export function rowsFromDb(kind, rows) {
  const table = kind === "grant" ? "au_grants" : "au_programs";
  return (rows ?? [])
    .filter((r) => r?.id && typeof r.official_url === "string" && /^https?:\/\//i.test(r.official_url) && !r.exclude_from_matching)
    .map((r) => ({ kind, table, id: r.id, name: r.name ?? r.id, url: r.official_url, status: r.status ?? null, status_confidence: r.status_confidence ?? null, link_status: r.link_status }));
}

/** `{ status, error, final_url, hops }` → ok | broken | unverifiable (same rules as the site link check). */
export function verdictOf(result) {
  return externalVerdict(result?.status ?? null, result?.error ?? null);
}

/**
 * Hosts in `targets`, each with its URLs in order — the CLI walks one host at
 * a time with a delay between requests (polite: never two concurrent
 * requests to the same government CDN).
 */
export function groupByHost(targets) {
  const map = new Map();
  for (const t of targets) {
    let host = "";
    try {
      host = new URL(t.url).hostname.toLowerCase();
    } catch {
      host = "(invalid)";
    }
    if (!map.has(host)) map.set(host, []);
    map.get(host).push(t);
  }
  return map;
}

/**
 * Merge this week's results into last week's state rows.
 * `results`: `[{ kind, id, url, status, error, final_url, hops }]`.
 */
export function mergeHealth(prevRows, results, now = new Date()) {
  const nowIso = now.toISOString();
  const out = {};
  for (const r of results) {
    const key = `${r.kind}:${r.id}`;
    const prev = prevRows?.[key];
    const sameUrl = prev && prev.url === r.url;
    const verdict = verdictOf(r);
    const base = {
      kind: r.kind,
      id: r.id,
      url: r.url,
      verdict,
      status: r.status ?? null,
      error: r.error ?? null,
      final_url: r.final_url ?? null,
      hops: r.hops ?? 0,
      last_checked_at: nowIso,
    };
    if (verdict === "ok") {
      out[key] = { ...base, first_failed_at: null, last_ok_at: nowIso, consecutive_failures: 0 };
    } else if (verdict === "broken") {
      const carried = sameUrl && prev.first_failed_at ? prev.first_failed_at : nowIso;
      out[key] = { ...base, first_failed_at: carried, last_ok_at: sameUrl ? prev.last_ok_at ?? null : null, consecutive_failures: (sameUrl ? prev.consecutive_failures ?? 0 : 0) + 1 };
    } else {
      // unverifiable: we could not look — carry the previous failure clock untouched
      out[key] = {
        ...base,
        first_failed_at: sameUrl ? prev.first_failed_at ?? null : null,
        last_ok_at: sameUrl ? prev.last_ok_at ?? null : null,
        consecutive_failures: sameUrl ? prev.consecutive_failures ?? 0 : 0,
      };
    }
  }
  return out;
}

/** Whole days a row has been failing (0 when not failing). */
export function brokenDays(row, now = new Date()) {
  if (!row?.first_failed_at) return 0;
  const t = Date.parse(row.first_failed_at);
  return Number.isFinite(t) ? Math.floor((now.getTime() - t) / DAY_MS) : 0;
}

/** SQL string literal. */
export function sqlLiteral(v) {
  if (v === null || v === undefined) return "null";
  return `'${String(v).replace(/'/g, "''")}'`;
}

function sameDestination(a, b) {
  try {
    const x = new URL(a);
    const y = new URL(b);
    const norm = (u) => `${u.protocol}//${u.hostname.replace(/^www\./, "")}${u.pathname.replace(/\/+$/, "")}${u.search}`;
    return norm(x) === norm(y);
  } catch {
    return a === b;
  }
}

/**
 * Proposed actions for the lead (nothing here writes):
 *   - `mark_low`    broken > hideAfterDays and not already low → set
 *                   status_confidence = 'low' (existing column, /admin/funding
 *                   review convention). `--apply` executes exactly these.
 *   - `redirected`  answered OK only after ≥ 1 hop to a different URL →
 *                   propose official_url = final_url (verify by hand: a
 *                   redirect to a home page means the programme page is gone).
 *   - `link_status` only when the column exists (after the proposed migration):
 *                   one row per checked target.
 * Returns `{ mark_low, redirected, link_status, sql }` where `sql` is the
 * statement list a human can paste into psql.
 */
export function buildProposals(state, targets, { now = new Date(), hideAfterDays = HIDE_AFTER_DAYS, hasLinkStatus = false } = {}) {
  const meta = new Map(targets.map((t) => [`${t.kind}:${t.id}`, t]));
  const mark_low = [];
  const redirected = [];
  const link_status = [];
  for (const [key, row] of Object.entries(state)) {
    const t = meta.get(key);
    if (!t) continue;
    const days = brokenDays(row, now);
    if (row.verdict === "broken" && days >= hideAfterDays && t.status_confidence !== "low") {
      mark_low.push({ table: t.table, id: t.id, url: row.url, status: row.status, error: row.error, broken_since: row.first_failed_at, days });
    }
    if (row.verdict === "ok" && (row.hops ?? 0) >= 1 && row.final_url && !sameDestination(row.url, row.final_url)) {
      redirected.push({ table: t.table, id: t.id, url: row.url, final_url: row.final_url, hops: row.hops });
    }
    if (hasLinkStatus) {
      link_status.push({ table: t.table, id: t.id, link_status: row.verdict, link_broken_since: row.verdict === "ok" ? null : row.first_failed_at ?? null });
    }
  }
  const sql = [];
  for (const m of mark_low) {
    sql.push(`update public.${m.table} set status_confidence = 'low', updated_at = now() where id = ${sqlLiteral(m.id)} and status_confidence <> 'low'; -- ${m.days} d broken (${m.error ?? m.status}) ${m.url}`);
  }
  for (const r of redirected) {
    sql.push(`-- verify by hand, then: update public.${r.table} set official_url = ${sqlLiteral(r.final_url)}, updated_at = now() where id = ${sqlLiteral(r.id)} and official_url = ${sqlLiteral(r.url)}; -- ${r.hops} hop(s)`);
  }
  const nowIso = now.toISOString();
  for (const l of link_status) {
    sql.push(`update public.${l.table} set link_status = ${sqlLiteral(l.link_status)}, link_checked_at = ${sqlLiteral(nowIso)}, link_broken_since = ${sqlLiteral(l.link_broken_since)} where id = ${sqlLiteral(l.id)};`);
  }
  return { mark_low, redirected, link_status, sql };
}

/** One summary object for the report + stdout. */
export function summarizeHealth(state, proposals, { ts, source, hasLinkStatus, hideAfterDays = HIDE_AFTER_DAYS, now = new Date() }) {
  const rows = Object.values(state);
  const count = (v) => rows.filter((r) => r.verdict === v).length;
  const broken = rows
    .filter((r) => r.verdict === "broken")
    .map((r) => ({ kind: r.kind, id: r.id, url: r.url, status: r.status, error: r.error, first_failed_at: r.first_failed_at, days: brokenDays(r, now) }))
    .sort((a, b) => b.days - a.days || a.id.localeCompare(b.id));
  return {
    ts,
    source,
    checked: rows.length,
    ok: count("ok"),
    broken: count("broken"),
    unverifiable: count("unverifiable"),
    broken_over_threshold: broken.filter((b) => b.days >= hideAfterDays).length,
    hide_after_days: hideAfterDays,
    schema_has_link_status: hasLinkStatus,
    broken_rows: broken,
    unverifiable_rows: rows.filter((r) => r.verdict === "unverifiable").map((r) => ({ kind: r.kind, id: r.id, url: r.url, status: r.status, error: r.error })),
    proposals: { mark_low: proposals.mark_low, redirected: proposals.redirected, link_status_rows: proposals.link_status.length },
    proposed_sql: proposals.sql,
  };
}

/** Human summary. */
export function formatHealth(s) {
  const lines = [
    `[funding-link-health] ${s.ts} (${s.source}): ${s.checked} official_url · ${s.ok} ok · ${s.broken} broken · ${s.unverifiable} unverifiable · ${s.broken_over_threshold} broken ≥ ${s.hide_after_days} d`,
  ];
  for (const b of s.broken_rows.slice(0, 40)) lines.push(`  ✗ ${b.kind.padEnd(7)} ${b.id.padEnd(44)} ${String(b.error ?? b.status).padEnd(18)} ${b.days} d  ${b.url}`);
  for (const r of s.proposals.redirected.slice(0, 20)) lines.push(`  ↪ ${r.table}.${r.id}: ${r.url} → ${r.final_url} (${r.hops} hop)`);
  if (!s.schema_has_link_status) lines.push("  ℹ no link_status column — proposed migration: supabase/pending-authority/0475_funding_link_status.sql (not applied)");
  if (s.proposed_sql.length) lines.push(`  proposed SQL: ${s.proposed_sql.length} statement(s) in the report (proposed_sql)`);
  return lines.join("\n");
}
