// cohort-import — pure CSV parser + validator for the BlockID Cohort import
// (G21 P2-A; docs/plans/g21-fi-upgrade-2026-09-20.md § P2-A).
//
// POST /api/evaluations/batch/[id]/import.csv hands the body text here and
// gets back the rows it can create (one evaluator-owned project + evaluation
// + batch item each) and the rows it must report back with a line number
// and a reason. No I/O, no Supabase — the route owns the writes, this module
// owns the rules, so the colocated test pins every rule without a database.
//
// Columns (header row required, case-insensitive, any order; extra columns
// are ignored):
//   company        required — the startup name (≤ 100 chars)
//   url            optional — website; normalised to https://host[/path]
//   contact_email  optional — the founder invited to claim the profile
//   stage          optional — 0..7 or a stage name (STAGE_NAMES: "MVP",
//                  "Early traction", …), case-insensitive
//   sector         optional — free text (≤ 60) → projects.industry through
//                  the taxonomy crosswalk in createEvaluation
//   deck_url       optional — a link to the deck (kept in the evaluator's
//                  private notes on the dossier)
//   abn            optional — 11 digits; used for dedupe only
//
// Dedupe: a row is skipped when its normalised domain, ABN or contact
// e-mail already appeared earlier in the file OR is already held by one of
// the evaluator's evaluations in the cohort (the route passes those keys).

import { BATCH_MAX_ITEMS, STAGE_NAMES } from "./batch-shared";

export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_MAX_ROWS = BATCH_MAX_ITEMS;

export const IMPORT_COLUMNS = ["company", "url", "contact_email", "stage", "sector", "deck_url"] as const;
export const IMPORT_OPTIONAL_COLUMNS = ["abn"] as const;
export type ImportColumn = (typeof IMPORT_COLUMNS)[number] | (typeof IMPORT_OPTIONAL_COLUMNS)[number];

/** The file `/samples/cohort-import.csv` serves (public/samples) — pinned by the test. */
export const SAMPLE_CSV = [
  "company,url,contact_email,stage,sector,deck_url",
  "Acme Robotics,https://acmerobotics.com.au,founder@acmerobotics.com.au,MVP,Robotics,https://acmerobotics.com.au/deck.pdf",
  "Brightleaf Health,brightleaf.health,hello@brightleaf.health,Early traction,Healthtech,",
  "Cobalt Fintech,https://cobalt.finance,,Validation,Fintech,https://drive.google.com/file/d/example/view",
  "",
].join("\r\n");

export type ImportSkipReason =
  | "empty_row"
  | "missing_company"
  | "company_too_long"
  | "invalid_url"
  | "invalid_email"
  | "invalid_deck_url"
  | "invalid_abn"
  | "invalid_stage"
  | "duplicate_in_file"
  | "duplicate_in_cohort"
  | "too_many_rows";

export interface ImportSkip {
  /** 1-based line in the file (the header is line 1). */
  line: number;
  reason: ImportSkipReason;
  message: string;
}

export interface ImportRow {
  line: number;
  company: string;
  url: string | null;
  contactEmail: string | null;
  /** projects.stage (0..7) when the cell parsed, else null. */
  stage: number | null;
  sector: string | null;
  deckUrl: string | null;
  abn: string | null;
  /** Normalised host (no www.) — the primary dedupe key. */
  domain: string | null;
  /** Every dedupe key the row carries: `domain:…`, `abn:…`, `email:…`. */
  keys: string[];
}

export type ParseImportResult =
  | { ok: true; header: string[]; rows: ImportRow[]; skipped: ImportSkip[] }
  | { ok: false; error: "empty" | "too_large" | "missing_header"; message: string };

// ── CSV ──────────────────────────────────────────────────────────────────────

/** RFC 4180-ish: quoted cells, doubled quotes, CR/LF/CRLF, leading BOM. Empty trailing line dropped. */
export function parseCsv(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i += 1) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += c;
    }
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// ── Cell normalisers ─────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normaliseUrl(raw: string | null | undefined): { ok: true; url: string | null; domain: string | null } | { ok: false } {
  const v = (raw ?? "").trim();
  if (!v) return { ok: true, url: null, domain: null };
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    const u = new URL(withScheme);
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes(".")) return { ok: false };
    const domain = u.hostname.toLowerCase().replace(/^www\./, "");
    return { ok: true, url: u.toString().replace(/\/$/, ""), domain };
  } catch {
    return { ok: false };
  }
}

/** Host without `www.` — the dedupe key for a website. */
export function normaliseDomain(raw: string | null | undefined): string | null {
  const r = normaliseUrl(raw);
  return r.ok ? r.domain : null;
}

export function normaliseEmail(raw: string | null | undefined): { ok: true; email: string | null } | { ok: false } {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return { ok: true, email: null };
  if (!EMAIL_RE.test(v) || v.length > 254) return { ok: false };
  return { ok: true, email: v };
}

/** 11 digits with spaces stripped; `ok:false` for anything else non-empty. */
export function normaliseAbn(raw: string | null | undefined): { ok: true; abn: string | null } | { ok: false } {
  const v = (raw ?? "").replace(/\s+/g, "");
  if (!v) return { ok: true, abn: null };
  if (!/^\d{11}$/.test(v)) return { ok: false };
  return { ok: true, abn: v };
}

const STAGE_BY_NAME: ReadonlyMap<string, number> = new Map(Object.entries(STAGE_NAMES).map(([n, label]) => [label.toLowerCase(), Number(n)]));

/** `"3"`, `"MVP"`, `"early traction"` → 3 / 3 / 4; empty → null; unknown → undefined. */
export function parseStage(raw: string | null | undefined): number | null | undefined {
  const v = (raw ?? "").trim().toLowerCase();
  if (!v) return null;
  if (/^\d+$/.test(v)) {
    const n = Number(v);
    return n >= 0 && n <= 7 ? n : undefined;
  }
  const byName = STAGE_BY_NAME.get(v);
  if (byName != null) return byName;
  // "stage 3", "seed"-ish aliases the sample decks use.
  const m = /^stage\s+(\d)$/.exec(v);
  if (m) return parseStage(m[1]);
  const ALIASES: Record<string, number> = { "pre-seed": 3, preseed: 3, seed: 4, "series a": 5, "series-a": 5, idea: 1, prototype: 3, revenue: 4, growth: 5, scale: 6 };
  return ALIASES[v] ?? undefined;
}

/** Dedupe keys the evaluator's existing evaluations contribute (website, founder e-mail, project ABN). */
export function keysForExisting(rows: ReadonlyArray<{ website?: string | null; founderEmail?: string | null; abn?: string | null }>): Set<string> {
  const out = new Set<string>();
  for (const r of rows) {
    const d = normaliseDomain(r.website);
    if (d) out.add(`domain:${d}`);
    const e = normaliseEmail(r.founderEmail);
    if (e.ok && e.email) out.add(`email:${e.email}`);
    const a = normaliseAbn(r.abn);
    if (a.ok && a.abn) out.add(`abn:${a.abn}`);
  }
  return out;
}

// ── Parse + validate ─────────────────────────────────────────────────────────

function headerIndex(header: string[]): Map<string, number> {
  const out = new Map<string, number>();
  header.forEach((h, i) => {
    const key = h.trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (key && !out.has(key)) out.set(key, i);
  });
  // Friendly aliases.
  const alias: Record<string, ImportColumn> = { name: "company", startup: "company", website: "url", email: "contact_email", founder_email: "contact_email", industry: "sector", deck: "deck_url", deck_link: "deck_url" };
  for (const [from, to] of Object.entries(alias)) if (out.has(from) && !out.has(to)) out.set(to, out.get(from)!);
  return out;
}

export interface ParseImportOptions {
  /** Keys already held by the cohort (keysForExisting) — rows matching one are `duplicate_in_cohort`. */
  existingKeys?: Iterable<string>;
  maxRows?: number;
  maxBytes?: number;
}

export function parseCohortImport(text: string, opts: ParseImportOptions = {}): ParseImportResult {
  const maxBytes = opts.maxBytes ?? IMPORT_MAX_BYTES;
  if (Buffer.byteLength(text, "utf8") > maxBytes) {
    return { ok: false, error: "too_large", message: `The file must be under ${Math.round(maxBytes / 1024 / 1024)} MB` };
  }
  const table = parseCsv(text).filter((r) => r.some((c) => c.trim().length > 0) || r.length > 1);
  if (table.length === 0) return { ok: false, error: "empty", message: "The file is empty" };
  const header = table[0]!.map((h) => h.trim());
  const idx = headerIndex(header);
  if (!idx.has("company")) {
    return { ok: false, error: "missing_header", message: `The first row must be a header with at least "company" — expected: ${IMPORT_COLUMNS.join(", ")}` };
  }
  const maxRows = opts.maxRows ?? IMPORT_MAX_ROWS;
  const seen = new Set<string>(opts.existingKeys ?? []);
  const existing = new Set<string>(opts.existingKeys ?? []);
  const rows: ImportRow[] = [];
  const skipped: ImportSkip[] = [];
  const cell = (r: string[], col: string): string | null => {
    const i = idx.get(col);
    return i == null ? null : (r[i] ?? "").trim();
  };

  for (let i = 1; i < table.length; i += 1) {
    const line = i + 1;
    const r = table[i]!;
    if (r.every((c) => c.trim().length === 0)) {
      skipped.push({ line, reason: "empty_row", message: "Empty row" });
      continue;
    }
    if (rows.length >= maxRows) {
      skipped.push({ line, reason: "too_many_rows", message: `A cohort import holds up to ${maxRows} startups` });
      continue;
    }
    const company = (cell(r, "company") ?? "").replace(/\s+/g, " ");
    if (!company) {
      skipped.push({ line, reason: "missing_company", message: "company is required" });
      continue;
    }
    if (company.length > 100) {
      skipped.push({ line, reason: "company_too_long", message: "company must be under 100 characters" });
      continue;
    }
    const url = normaliseUrl(cell(r, "url"));
    if (!url.ok) {
      skipped.push({ line, reason: "invalid_url", message: "url is not a valid website" });
      continue;
    }
    const email = normaliseEmail(cell(r, "contact_email"));
    if (!email.ok) {
      skipped.push({ line, reason: "invalid_email", message: "contact_email is not a valid e-mail address" });
      continue;
    }
    const deck = normaliseUrl(cell(r, "deck_url"));
    if (!deck.ok) {
      skipped.push({ line, reason: "invalid_deck_url", message: "deck_url is not a valid link" });
      continue;
    }
    const abn = normaliseAbn(cell(r, "abn"));
    if (!abn.ok) {
      skipped.push({ line, reason: "invalid_abn", message: "abn must be 11 digits" });
      continue;
    }
    const stage = parseStage(cell(r, "stage"));
    if (stage === undefined) {
      skipped.push({ line, reason: "invalid_stage", message: `stage must be 0–7 or one of ${Object.values(STAGE_NAMES).join(" / ")}` });
      continue;
    }
    const sector = (cell(r, "sector") ?? "").slice(0, 60) || null;

    const keys: string[] = [];
    if (url.domain) keys.push(`domain:${url.domain}`);
    if (abn.abn) keys.push(`abn:${abn.abn}`);
    if (email.email) keys.push(`email:${email.email}`);
    const dupe = keys.find((k) => seen.has(k));
    if (dupe) {
      const inCohort = existing.has(dupe);
      skipped.push({
        line,
        reason: inCohort ? "duplicate_in_cohort" : "duplicate_in_file",
        message: inCohort ? `Already in this cohort (${dupe.replace(":", " ")})` : `Duplicate of an earlier row (${dupe.replace(":", " ")})`,
      });
      continue;
    }
    for (const k of keys) seen.add(k);
    rows.push({ line, company, url: url.url, contactEmail: email.email, stage, sector, deckUrl: deck.url, abn: abn.abn, domain: url.domain, keys });
  }
  return { ok: true, header, rows, skipped };
}

/** `{ used, max, remaining }` for the applicants cap; `max` null = uncapped. */
export function capState(used: number, max: number | null): { used: number; max: number | null; remaining: number | null } {
  return { used, max, remaining: max == null ? null : Math.max(0, max - used) };
}
