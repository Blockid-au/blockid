#!/usr/bin/env node
/**
 * S23-A — re-seal OAuth connector tokens at rest.
 *
 * Walks every table/column that stores a connector token and re-encrypts,
 * under the CURRENT OAUTH_TOKEN_ENCRYPTION_KEY, each payload that is
 *   * `obf:<base64>`   — the keyless-dev wrapper (plaintext-equivalent), or
 *   * raw plaintext    — the pre-0087 `oauth_connections` table wrote tokens
 *                        verbatim (github ×3 / linkedin ×1 live today), or
 *   * `gcm:` sealed with OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS (key rotation).
 * A `gcm:` payload that already opens with the current key is left alone, so
 * the script is idempotent: a second run reports 0 resealed. A `gcm:`
 * payload no configured key opens is reported (`unreadable`) and skipped —
 * that founder must reconnect; the script never nulls a token.
 *
 * Covered (single source: TOKEN_COLUMNS below — keep in sync with
 * src/lib/security/oauth-token-health.ts):
 *   oauth_connections_v2.access_token_encrypted / refresh_token_encrypted
 *       — lib/oauth-connectors.ts vault (github / stripe / ga4 via
 *         /api/integrations/*)
 *   oauth_connections.access_token / refresh_token
 *       — legacy table written by /api/oauth/{github,linkedin,stripe,xero,ga4}
 *         /callback, read by /api/cron/linkedin-post
 * Not covered on purpose: webhook_endpoints.secret_enc (WEBHOOK_SECRET_KEY,
 * S20-B — recreate the endpoint) and every `*_token` column that is a
 * random capability/share token, not a third-party credential.
 *
 * Usage (from web/, service role — reads web/.env like the other seeds):
 *   node scripts/reseal-oauth-tokens.mjs            # dry-run (default): counts only
 *   node scripts/reseal-oauth-tokens.mjs --write    # re-seal + UPDATE each row
 *   node scripts/reseal-oauth-tokens.mjs --json     # machine-readable summary
 *
 * Never prints token bytes — only row ids, providers, forms and counts.
 * The crypto here mirrors src/lib/oauth-token-seal.ts byte-for-byte and the
 * colocated test (reseal-oauth-tokens.test.mjs) cross-checks the two.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GCM_PREFIX = "gcm:";
export const OBF_PREFIX = "obf:";

export const TOKEN_COLUMNS = [
  { table: "oauth_connections_v2", columns: ["access_token_encrypted", "refresh_token_encrypted"], provider: "provider" },
  { table: "oauth_connections", columns: ["access_token", "refresh_token"], provider: "provider" },
];

const PAGE = 200;

// ─── crypto (mirror of src/lib/oauth-token-seal.ts) ─────────────────────────

export function deriveKey(raw) {
  if (!raw) return null;
  if (raw.length === 64 && /^[0-9a-f]+$/i.test(raw)) return Buffer.from(raw, "hex");
  return createHash("sha256").update(raw).digest();
}

export function classifyToken(payload) {
  if (!payload) return "empty";
  if (payload.startsWith(GCM_PREFIX)) return "gcm";
  if (payload.startsWith(OBF_PREFIX)) return "obf";
  return "raw";
}

export function gcmSeal(plain, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${GCM_PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function gcmOpen(payload, key) {
  const [, ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Same contract as `resealToken` in src/lib/oauth-token-seal.ts:
 * { action: skip_empty|unchanged|resealed|unreadable, from, sealed }.
 */
export function resealToken(payload, keys) {
  if (!keys.current) throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY is required");
  const form = classifyToken(payload);
  if (form === "empty") return { action: "skip_empty", from: "empty", sealed: null };
  if (form === "gcm") {
    if (gcmOpen(payload, keys.current) !== null) return { action: "unchanged", from: "gcm_current", sealed: payload };
    const prev = keys.previous ? gcmOpen(payload, keys.previous) : null;
    if (prev === null) return { action: "unreadable", from: "gcm_unknown", sealed: null };
    return { action: "resealed", from: "gcm_previous", sealed: gcmSeal(prev, keys.current) };
  }
  const plain = form === "obf" ? Buffer.from(payload.slice(OBF_PREFIX.length), "base64").toString("utf8") : payload;
  return { action: "resealed", from: form, sealed: gcmSeal(plain, keys.current) };
}

// ─── plan + apply ────────────────────────────────────────────────────────────

function emptyCounts() {
  return { rows: 0, resealed: 0, unchanged: 0, unreadable: 0, from: { obf: 0, raw: 0, gcm_previous: 0 } };
}

function bump(counts, key, result) {
  const c = counts[key] ?? (counts[key] = emptyCounts());
  if (result.action === "resealed") {
    c.resealed++;
    c.from[result.from] = (c.from[result.from] ?? 0) + 1;
  } else if (result.action === "unchanged") c.unchanged++;
  else if (result.action === "unreadable") c.unreadable++;
}

/**
 * Walk one table page by page; for every row compute the patch (only the
 * columns that change). Returns { rows, patches, counts } where counts is
 * keyed "<table>/<provider>" (+ "<table>/*" total). `db` is a supabase-js
 * client (or the in-memory stub from the test).
 */
export async function planTable(db, spec, keys) {
  const cols = ["id", spec.provider, ...spec.columns].join(", ");
  const patches = [];
  const counts = {};
  const total = (counts[`${spec.table}/*`] = emptyCounts());
  let from = 0;
  for (;;) {
    const { data, error } = await db.from(spec.table).select(cols).order("id", { ascending: true }).range(from, from + PAGE - 1);
    if (error) throw new Error(`${spec.table}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) {
      total.rows++;
      const providerKey = `${spec.table}/${row[spec.provider] ?? "?"}`;
      (counts[providerKey] ?? (counts[providerKey] = emptyCounts())).rows++;
      const patch = {};
      for (const col of spec.columns) {
        const r = resealToken(row[col], keys);
        if (r.action === "skip_empty") continue;
        bump(counts, providerKey, r);
        bump(counts, `${spec.table}/*`, r);
        if (r.action === "resealed") patch[col] = r.sealed;
      }
      if (Object.keys(patch).length > 0) patches.push({ table: spec.table, id: row.id, provider: row[spec.provider] ?? "?", patch });
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { patches, counts };
}

export async function applyPatches(db, patches) {
  let written = 0;
  for (const p of patches) {
    const { error } = await db.from(p.table).update(p.patch).eq("id", p.id);
    if (error) throw new Error(`${p.table} ${p.id}: ${error.message}`);
    written++;
  }
  return written;
}

/**
 * Full run. `opts.write` false = dry-run. Returns the summary (never token
 * bytes). Throws when no current key is configured.
 */
export async function run(db, keys, opts = {}) {
  if (!keys.current) throw new Error("OAUTH_TOKEN_ENCRYPTION_KEY is required (nothing to seal with)");
  const summary = { mode: opts.write ? "write" : "dry-run", tables: {}, patches: 0, written: 0, unreadable: 0 };
  for (const spec of TOKEN_COLUMNS) {
    let planned;
    try {
      planned = await planTable(db, spec, keys);
    } catch (err) {
      // A missing legacy table (fresh install) is not a failure of the run.
      summary.tables[spec.table] = { error: err instanceof Error ? err.message : String(err) };
      continue;
    }
    summary.tables[spec.table] = { counts: planned.counts, patches: planned.patches.length };
    summary.patches += planned.patches.length;
    summary.unreadable += planned.counts[`${spec.table}/*`].unreadable;
    if (opts.write) summary.written += await applyPatches(db, planned.patches);
  }
  return summary;
}

export function formatSummary(summary) {
  const lines = [`reseal-oauth-tokens — ${summary.mode}`];
  for (const [table, t] of Object.entries(summary.tables)) {
    if (t.error) {
      lines.push(`  ${table}: ERROR ${t.error}`);
      continue;
    }
    for (const [key, c] of Object.entries(t.counts)) {
      const provider = key.split("/")[1];
      const fromBits = Object.entries(c.from).filter(([, n]) => n > 0).map(([k, n]) => `${k}=${n}`).join(", ");
      lines.push(`  ${table} [${provider}] rows=${c.rows} resealed=${c.resealed}${fromBits ? ` (${fromBits})` : ""} unchanged=${c.unchanged} unreadable=${c.unreadable}`);
    }
  }
  lines.push(`  patches=${summary.patches} written=${summary.written}${summary.mode === "dry-run" ? " (dry-run — pass --write to apply)" : ""}`);
  return lines.join("\n");
}

// ─── CLI ────────────────────────────────────────────────────────────────────

function loadEnv() {
  const here = dirname(fileURLToPath(import.meta.url));
  const envPath = resolve(here, "..", ".env");
  const fileEnv = existsSync(envPath)
    ? Object.fromEntries(
        readFileSync(envPath, "utf8")
          .split("\n")
          .map((l) => l.match(/^([A-Z_0-9]+)=(.*)/))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
      )
    : {};
  return { ...fileEnv, ...process.env }; // shell env wins (lets ops override the key for a rotation)
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const write = args.has("--write");
  const json = args.has("--json");
  const env = loadEnv();
  const keys = { current: deriveKey(env.OAUTH_TOKEN_ENCRYPTION_KEY), previous: deriveKey(env.OAUTH_TOKEN_ENCRYPTION_KEY_PREVIOUS) };
  if (!keys.current) {
    console.error("OAUTH_TOKEN_ENCRYPTION_KEY is not set — mint one first (docs/ops/oauth-token-sealing.md)");
    process.exit(2);
  }
  const url = (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || "").replace("supabase-kong", "localhost");
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are required");
    process.exit(2);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const summary = await run(db, keys, { write });
  if (json) console.log(JSON.stringify(summary, null, 2));
  else console.log(formatSummary(summary));
  if (summary.unreadable > 0) console.error(`${summary.unreadable} token(s) could not be opened with any configured key — those founders must reconnect.`);
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
