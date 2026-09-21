// scripts/external-signals/lib.mjs — pure helpers shared by the ingest CLI
// and the three adapters (G14-S40). No I/O here except the tiny env reader;
// everything is unit-tested in ingest.test.mjs without a network or a DB.

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Readable } from "node:stream";

export const EXIT_OK = 0;
export const EXIT_ERROR = 1;
export const EXIT_USAGE = 2;
/** Licence gate refused (unknown / cite_only / disabled source). */
export const EXIT_REFUSED = 3;

export const SIGNAL_TYPES = ["abr_entity", "grant_award", "rdti_registration", "funding_round"];

// ── ABN ─────────────────────────────────────────────────────────────────────

const ABN_WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

/** 11 digits or null (same rule as src/lib/compliance/abn.ts normalizeAbn). */
export function normalizeAbn(input) {
  if (input == null) return null;
  const digits = String(input).replace(/\D+/g, "");
  return digits.length === 11 ? digits : null;
}

/** Modulus-89 checksum (src/lib/compliance/abn.ts validateAbnChecksum). */
export function validateAbnChecksum(input) {
  const abn = normalizeAbn(input);
  if (!abn) return false;
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const d = Number(abn[i]);
    sum += i === 0 ? (d - 1) * ABN_WEIGHTS[i] : d * ABN_WEIGHTS[i];
  }
  return sum > 0 && sum % 89 === 0;
}

/** 9 digits or null. */
export function normalizeAcn(input) {
  if (input == null) return null;
  const digits = String(input).replace(/\D+/g, "");
  return digits.length === 9 ? digits : null;
}

// ── Licence gate (mirrors src/lib/signals/external-sources.ts licenceGate) ──

export function licenceGate(row) {
  if (!row) return { ok: false, reason: "unknown source (no external_sources row)" };
  const licence = String(row.licence ?? "").trim();
  if (!licence) return { ok: false, reason: `source ${row.id} has no licence recorded` };
  if (row.status === "cite_only" || /cite[ -]only/i.test(licence)) return { ok: false, reason: `source ${row.id} is cite_only — bulk ingest refused` };
  if (row.status !== "active") return { ok: false, reason: `source ${row.id} is ${row.status}` };
  return { ok: true };
}

// ── Dedupe hash ─────────────────────────────────────────────────────────────

/** Stable JSON: keys sorted, undefined dropped — so equal values hash equal. */
export function canonicalJson(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const keys = Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(",")}}`;
}

/** sha256(source_id|abn|signal_type|as_of|canonical value) — the external_signals.content_hash unique key. */
export function contentHash(row) {
  const h = createHash("sha256");
  h.update([row.source_id, row.entity_abn ?? row.entity_acn ?? "", row.signal_type, row.as_of, canonicalJson(row.value)].join("|"));
  return h.digest("hex");
}

/** Attach content_hash + defaults; throws on a malformed row (never stored). */
export function finaliseRow(row) {
  if (!row.source_id || !row.signal_type || !row.as_of || row.value == null) throw new Error(`malformed signal row: ${JSON.stringify(row).slice(0, 200)}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.as_of)) throw new Error(`as_of must be YYYY-MM-DD, got ${row.as_of}`);
  if (!SIGNAL_TYPES.includes(row.signal_type)) throw new Error(`unknown signal_type ${row.signal_type}`);
  return {
    source_id: row.source_id,
    entity_abn: row.entity_abn ?? null,
    entity_acn: row.entity_acn ?? null,
    entity_name: row.entity_name ?? null,
    signal_type: row.signal_type,
    value: row.value,
    as_of: row.as_of,
    source_url: row.source_url ?? null,
    match_confidence: row.match_confidence === "low" ? "low" : "high",
    content_hash: contentHash(row),
  };
}

/** In-memory dedupe on content_hash (the DB unique index is the second line). */
export function dedupeRows(rows, knownHashes = new Set()) {
  const seen = new Set(knownHashes);
  const fresh = [];
  let duplicates = 0;
  for (const r of rows) {
    if (seen.has(r.content_hash)) {
      duplicates += 1;
      continue;
    }
    seen.add(r.content_hash);
    fresh.push(r);
  }
  return { fresh, duplicates };
}

// ── Dates ───────────────────────────────────────────────────────────────────

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const pad = (n) => String(n).padStart(2, "0");

/**
 * Register dates → YYYY-MM-DD. Accepts 20240131 (ABR), 2024-01-31, 31/01/2024,
 * 31-Jan-2024, 31 Jan 2024, Jan 31 2024. Returns null when unparseable.
 */
export function toIsoDate(input) {
  if (input == null) return null;
  const s = String(input).trim();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
  if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/))) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
  if ((m = s.match(/^(\d{1,2})[ -]([A-Za-z]{3})[A-Za-z]*[ ,-]+(\d{4})/))) {
    const mo = MONTHS[m[2].toLowerCase()];
    return mo ? `${m[3]}-${pad(mo)}-${pad(m[1])}` : null;
  }
  if ((m = s.match(/^([A-Za-z]{3})[A-Za-z]*\s+(\d{1,2}),?\s+(\d{4})/))) {
    const mo = MONTHS[m[1].toLowerCase()];
    return mo ? `${m[3]}-${pad(mo)}-${pad(m[2])}` : null;
  }
  return null;
}

/** "2022-23" / "2022–23" / "2022/23" → the income-year end date 2023-06-30. */
export function incomeYearEnd(input) {
  const m = String(input ?? "").match(/(\d{4})\s*[-–/]\s*(\d{2,4})/);
  if (!m) return null;
  const end = m[2].length === 2 ? Number(m[1].slice(0, 2) + m[2]) : Number(m[2]);
  return Number.isFinite(end) ? `${end}-06-30` : null;
}

export function toNumber(input) {
  if (input == null) return null;
  if (typeof input === "number") return Number.isFinite(input) ? input : null;
  const s = String(input).replace(/[$,\s]/g, "");
  if (!s || s === "-") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ── CSV ─────────────────────────────────────────────────────────────────────

const BOM = String.fromCharCode(0xfeff);
const DQ = String.fromCharCode(34);

/** RFC 4180 parser (quotes, embedded commas / newlines, CRLF, BOM). Returns [{header: value}]. */
export function parseCsv(text) {
  const src = String(text).startsWith(BOM) ? String(text).slice(1) : String(text);
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === DQ) {
        if (src[i + 1] === DQ) {
          field += DQ;
          i++;
        } else quoted = false;
      } else field += c;
      continue;
    }
    if (c === DQ) quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) {
    row.push(field);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map((h) => h.trim());
  return nonEmpty.slice(1).map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? "").trim()])));
}

const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Pick the first header whose normalised form matches one of the aliases
 * (exact) — so "Recipient ABN" / "ABN" / "abn/acn" all resolve without a
 * hard-coded export layout.
 */
export function pickColumn(row, aliases) {
  const keys = Object.keys(row);
  const normalised = new Map(keys.map((k) => [norm(k), k]));
  for (const a of aliases) {
    const hit = normalised.get(norm(a));
    if (hit !== undefined) return hit;
  }
  return null;
}

export function pickValue(row, aliases) {
  const k = pickColumn(row, aliases);
  return k === null ? null : row[k] === "" ? null : row[k];
}

// ── Allow-set ───────────────────────────────────────────────────────────────

/** Keep rows whose ABN is in the allow set (the ABR bulk rule). Rows without an ABN are dropped. */
export function filterByAllowSet(rows, allow) {
  const kept = [];
  let dropped = 0;
  for (const r of rows) {
    if (r.entity_abn && allow.has(r.entity_abn)) kept.push(r);
    else dropped += 1;
  }
  return { kept, dropped };
}

/** One ABN per line (comments with #, blanks ignored, invalid checksums reported). */
export function parseAbnFile(text) {
  const abns = new Set();
  const invalid = [];
  for (const line of String(text).split(/\r?\n/)) {
    const t = line.replace(/#.*$/, "").trim();
    if (!t) continue;
    const abn = normalizeAbn(t);
    if (abn && validateAbnChecksum(abn)) abns.add(abn);
    else invalid.push(t);
  }
  return { abns, invalid };
}

// ── Streams ─────────────────────────────────────────────────────────────────

/** string | Buffer | Readable → async iterable of utf8 strings. */
export function toChunks(input) {
  if (typeof input === "string") return Readable.from([input]);
  if (Buffer.isBuffer(input)) return Readable.from([input.toString("utf8")]);
  if (input && typeof input[Symbol.asyncIterator] === "function") {
    return (async function* () {
      for await (const c of input) yield Buffer.isBuffer(c) ? c.toString("utf8") : String(c);
    })();
  }
  throw new Error("unsupported input (expected string, Buffer or Readable)");
}

export async function readAll(input) {
  let out = "";
  for await (const c of toChunks(input)) out += c;
  return out;
}

// ── CLI args / env ──────────────────────────────────────────────────────────

export const SOURCE_IDS = ["abr-bulk", "business-gov-grants", "rdti-transparency", "funding-announcements"];

export const USAGE = [
  "usage: node scripts/external-signals/ingest.mjs [--source <id>]... [--file <path>] [--abn-file <path>] [--limit N] [--dry] [--fetch] [--json] [--data-dir <dir>] [--dotenv <path>]",
  "  --source <id>     one of abr-bulk | business-gov-grants | rdti-transparency | funding-announcements (repeatable; default: all)",
  "  --file <path>     input file for the (single) --source; default: newest file under <data-dir>/<source>/",
  "  --abn-file <path> extra ABNs (one per line) added to the ABR allow-set",
  "  --limit N         stop after N parsed rows per source (smoke runs)",
  "  --dry             parse + licence gate + dedupe; write nothing (forced when no DB keys)",
  "  --fetch           download the source first (abr-bulk: ~2 GB zips; rdti: 0.7 MB xlsx). Never implied.",
  "  --json            machine-readable summary on stdout",
  "  --data-dir <dir>  where downloads live (default $EXTERNAL_SIGNALS_DATA_DIR or ~/blockid-data/external-signals)",
  "  licence gate: a source whose external_sources row is missing, cite_only or disabled is refused (exit 3).",
].join("\n");

export function parseArgs(argv) {
  const out = { sources: [], files: [], abnFile: null, limit: null, dry: false, fetch: false, json: false, help: false, dataDir: null, envFile: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const eq = a.indexOf("=");
    const key = eq > 0 ? a.slice(0, eq) : a;
    const val = () => {
      if (eq > 0) return a.slice(eq + 1);
      const v = argv[++i];
      if (v === undefined || v.startsWith("--")) throw new Error(`${key} needs a value`);
      return v;
    };
    switch (key) {
      case "--source": {
        const v = val();
        if (!SOURCE_IDS.includes(v)) throw new Error(`--source must be one of ${SOURCE_IDS.join(", ")}`);
        if (!out.sources.includes(v)) out.sources.push(v);
        break;
      }
      case "--file":
        out.files.push(val());
        break;
      case "--abn-file":
        out.abnFile = val();
        break;
      case "--limit": {
        const n = Number(val());
        if (!Number.isInteger(n) || n < 1) throw new Error("--limit must be a positive integer");
        out.limit = n;
        break;
      }
      case "--dry":
      case "--dry-run":
        out.dry = true;
        break;
      case "--fetch":
        out.fetch = true;
        break;
      case "--json":
        out.json = true;
        break;
      case "--data-dir":
        out.dataDir = val();
        break;
      case "--dotenv":
        out.envFile = val();
        break;
      case "--help":
      case "-h":
        out.help = true;
        break;
      default:
        throw new Error(`unknown flag ${a}`);
    }
  }
  if (out.files.length && out.sources.length !== 1) throw new Error("--file needs exactly one --source");
  return out;
}

/** Minimal .env reader (no dotenv dependency); exported process env wins. */
export function loadEnv(envPath, processEnv = process.env) {
  const fileEnv = existsSync(envPath)
    ? Object.fromEntries(
        readFileSync(envPath, "utf8")
          .split("\n")
          .map((l) => l.match(/^([A-Z0-9_]+)=(.*)$/))
          .filter(Boolean)
          .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")]),
      )
    : {};
  return { ...fileEnv, ...processEnv };
}

export function resolveDataDir(explicit, env = process.env) {
  return resolve(explicit ?? env.EXTERNAL_SIGNALS_DATA_DIR ?? resolve(env.HOME ?? "/tmp", "blockid-data", "external-signals"));
}

// ── Summary ─────────────────────────────────────────────────────────────────

export function formatSummary(summary) {
  const lines = [];
  lines.push(`external-signals ingest — ${summary.dry ? "DRY RUN" : "WRITE"} @ ${summary.ran_at} (allow-set ${summary.allow_set_size} ABNs${summary.db ? "" : ", no db"})`);
  for (const s of summary.sources) {
    const bits = [`parsed=${s.parsed}`, `kept=${s.kept}`, `filtered=${s.filtered_out}`, `dupes=${s.duplicates}`, `${summary.dry ? "would_insert" : "inserted"}=${s.inserted}`];
    lines.push(`  ${s.id.padEnd(22)} ${s.status.padEnd(9)} ${bits.join(" ")}${s.file ? `  file=${s.file}` : ""}${s.error ? `  (${s.error})` : ""}`);
    for (const r of s.sample ?? []) lines.push(`    ${r.as_of}  ${r.signal_type.padEnd(18)} ${r.entity_abn ?? r.entity_acn ?? "-"}  ${String(r.entity_name ?? "").slice(0, 48)}`);
  }
  lines.push(`  total ${summary.dry ? "would insert" : "inserted"}=${summary.totals.inserted} duplicates=${summary.totals.duplicates} refused=${summary.totals.refused}`);
  if (!summary.ok) lines.push(`  ERROR ${summary.error ?? "see sources"}`);
  return lines.join("\n");
}
