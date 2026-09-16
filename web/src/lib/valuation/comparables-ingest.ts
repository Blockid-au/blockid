// AU comparables ingest (G13-W5-R5 / S-R5, spec §C.7 "ingest weekly from
// allow-listed public sources … admin review page").
//
// Allow-listed public sources only — nothing outside INGEST_SOURCES is ever
// fetched (the host check refuses everything else, before the SSRF guard in
// fetch-source even runs):
//
//   startup-daily        Startup Daily "Funding" RSS feed — one item per
//                        announced raise ("Evatto bags $1.02m …").
//   cut-through-venture  Cut Through Venture insights index → the newest
//                        `ctv-<mon>-<yy>` monthly deal roundups (HTML).
//   asx                  ASX "today's announcements" page — placements /
//                        capital raisings of listed comps (HTML).
//
// Extraction is regex only (no LLM — cost guardrail: the weekly cron spends
// nothing): company name from the "<Name> raises / bags / secures $Xm"
// sentence, amount + currency, stage word, sector keywords (the same
// mapping the static table uses), date from the item. Every candidate lands
// as `status='pending'` — a report never cites a row an admin has not
// flipped to `verified` on /admin/comparables.
//
// Dedupe: (name_key, round_date) — the same generated key the table's
// unique index uses (lower, trimmed, whitespace-collapsed name) — within the
// batch and against the rows already stored (any status: a rejected row
// stays rejected, the ingest never resurrects it).
//
// Dry run by default: `runComparablesIngest({ write: false })` fetches +
// extracts + dedupes and reports what it would insert. The cron route and
// the CLI (`scripts/comparables/ingest-public-roundups.mjs --write`) pass
// `write: true`.

import type { AUStage } from "@/lib/data/au-comparables";
import { fetchText, htmlToText, parseRssItems, type FetchTextResult, type RssItem } from "@/lib/funding/fetch-source";
import { COMPARABLES_TABLE } from "./comparables-repo";

export type IngestSourceId = "startup-daily" | "cut-through-venture" | "asx";

export interface IngestSource {
  id: IngestSourceId;
  label: string;
  /** Entry URL — always on an allow-listed host. */
  url: string;
  kind: "rss" | "html-index" | "html";
  /** Listed-company placements are growth-stage by construction. */
  defaultStage?: AUStage;
}

export const INGEST_SOURCES: readonly IngestSource[] = [
  { id: "startup-daily", label: "Startup Daily — Funding", url: "https://www.startupdaily.net/topic/funding/feed/", kind: "rss" },
  { id: "cut-through-venture", label: "Cut Through Venture — monthly deal roundup", url: "https://www.cutthrough.com/insights", kind: "html-index" },
  { id: "asx", label: "ASX announcements — placements / capital raisings", url: "https://www.asx.com.au/asx/v2/statistics/todayAnns.do", kind: "html", defaultStage: "growth" },
];

/** Hosts the ingest may fetch from. Anything else is refused before fetching. */
export const ALLOWED_HOSTS: readonly string[] = ["www.startupdaily.net", "startupdaily.net", "www.cutthrough.com", "cutthrough.com", "www.asx.com.au", "asx.com.au"];

export function hostAllowed(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.includes(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

/** Same normalisation as the table's generated `name_key` column. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

export function dedupeKey(name: string, roundDate: string): string {
  return `${nameKey(name)}|${roundDate}`;
}

export interface ComparableCandidate {
  name: string;
  sector: string;
  stage: AUStage;
  /** ISO date (YYYY-MM-DD). */
  round_date: string;
  round_label: string | null;
  amount_aud: number | null;
  /** The currency the amount was stated in; USD amounts are converted at USD_AUD and flagged in `note`. */
  currency: "AUD" | "USD" | "NZD" | null;
  source_name: IngestSourceId;
  source_url: string;
  source_date: string;
  source_excerpt: string;
  /** 0–1 heuristic — name + amount found = 0.6, + stage = 0.8, + sector keyword = 0.9. */
  confidence: number;
  note: string | null;
}

/** Indicative conversion for USD-denominated headlines; the admin verifies before approval. */
export const USD_AUD = 1.5;
export const NZD_AUD = 0.92;

const AMOUNT_RE = /(?:(A\$|AU\$|AUD\s?\$?|US\$|USD\s?\$?|NZ\$|NZD\s?\$?|\$))\s?(\d{1,4}(?:[.,]\d{1,3})?)\s?(bn|billion|b|m|million|mn|k|thousand)\b/i;
const STAGE_RE = /\b(pre-?seed|seed|angel|series\s?([a-d])|bridge|growth|placement|entitlement offer|capital raising|ipo)\b/i;
const VERB_RE = /\b(raises|raised|has raised|bags|pockets|secures|secured|lands|closes|closed|banks|scores|nabs|collects|snags|picks up|chows down on|gets|receives|attracts|announces|completes|locks in|wins|tops up with)\b/i;
const NOISE_WORD_RE = /^(startmate|blackbird|airtree|folklore|nsw|vic|qld|wa|sa|australian|aussie|sydney|melbourne|brisbane|perth|adelaide|kiwi|nz|ai|fintech|healthtech|proptech|edtech|climate|deeptech|agtech|agritech|saas|b2b|health|medical|legal|hr|payments|crypto|robotics|bookings|marketplace|doctors)$/i;
const GENERIC_NAME_RE = /\b(startup|start-up|scaleup|scale-up|platform|company|business|firm|founder|founders|alumni|government|fund|investors?|round|report|survey)\b/i;
const NAME_MAX = 60;

function toNumber(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

/** Money mention → AUD. Null when nothing parses. */
export function parseAmount(text: string): { amountAud: number; currency: "AUD" | "USD" | "NZD"; raw: string } | null {
  const m = text.match(AMOUNT_RE);
  if (!m) return null;
  const sym = m[1].toUpperCase().replace(/\s/g, "");
  const n = toNumber(m[2]);
  if (!Number.isFinite(n) || n <= 0) return null;
  const unit = m[3].toLowerCase();
  const mult = unit.startsWith("b") ? 1e9 : unit.startsWith("m") ? 1e6 : 1e3;
  const currency: "AUD" | "USD" | "NZD" = sym.startsWith("US") ? "USD" : sym.startsWith("NZ") ? "NZD" : "AUD";
  const fx = currency === "USD" ? USD_AUD : currency === "NZD" ? NZD_AUD : 1;
  return { amountAud: Math.round(n * mult * fx), currency, raw: m[0].trim() };
}

/** Stage word → AUStage (+ the label as written). Null when no stage word is present. */
export function parseStage(text: string): { stage: AUStage; label: string } | null {
  const m = text.match(STAGE_RE);
  if (!m) return null;
  const w = m[1].toLowerCase().replace(/\s+/g, " ");
  const label = m[0].replace(/\s+/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  if (w.startsWith("pre")) return { stage: "pre-seed", label: "Pre-seed" };
  if (w === "seed" || w === "angel") return { stage: "seed", label: label === "Angel" ? "Angel" : "Seed" };
  if (w.startsWith("series")) {
    const letter = (m[2] ?? "a").toLowerCase();
    const stage: AUStage = letter === "a" ? "series-a" : letter === "b" ? "series-b" : "series-c";
    return { stage, label: `Series ${letter.toUpperCase()}` };
  }
  if (w === "bridge") return { stage: "seed", label: "Bridge" };
  if (w === "growth") return { stage: "growth", label: "Growth" };
  // placement / entitlement offer / capital raising / ipo → listed = growth
  return { stage: "growth", label };
}

/**
 * "<Name> raises $Xm …" → "Name". The words before the raise verb are
 * reduced to their trailing run of capitalised tokens — "Melbourne climate
 * software startup Greener has raised" → "Greener", "Bookings marketplace
 * First Table has raised" → "First Table" — so sector / city descriptors
 * never become names. Null when the sentence has no raise verb or the run
 * is empty / generic ("Kiwi discount restaurant bookings platform").
 */
export function parseName(sentence: string): string | null {
  const m = sentence.match(VERB_RE);
  if (!m || m.index === undefined) return null;
  const before = sentence.slice(0, m.index).replace(/^[^A-Za-z0-9]+/, "").replace(/[,:;–—-]+\s*$/, "").trim();
  if (!before) return null;
  const words = before.split(/\s+/);
  const run: string[] = [];
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const w = words[i];
    if (/^[A-Z0-9]/.test(w) || (run.length && /^(of|and|&|the|de|du)$/i.test(w))) run.unshift(w);
    else break;
  }
  while (run.length && /^(of|and|&|the|de|du)$/i.test(run[0])) run.shift();
  while (run.length && /-(backed|led|founded|based)$/i.test(run[0])) run.shift();
  // The descriptor vocabulary, when it survives as a capitalised sentence start ("Fintech Constantinople", "Startmate alumni …").
  while (run.length > 1 && (NOISE_WORD_RE.test(run[0]) || GENERIC_NAME_RE.test(run[0]))) run.shift();
  const name = run.join(" ").trim();
  if (!name || name.length > NAME_MAX || run.length > 6) return null;
  if (run.every((w) => GENERIC_NAME_RE.test(w) || NOISE_WORD_RE.test(w))) return null;
  // A lone shouted word ("CAPITAL raised …") is a section heading, not a company.
  if (run.length === 1 && name.length >= 5 && name === name.toUpperCase()) return null;
  return name;
}

/** Sector label for a headline from the keyword map the static table uses; "Unclassified" when nothing matches. */
export function guessSector(text: string): string {
  const t = text.toLowerCase();
  const probes: Array<[RegExp, string]> = [
    [/fintech|payment|lending|bank|insur|wealth|crypto|bnpl/, "FinTech"],
    [/health|medic|clinic|patient|pharma|biotech|dental|vet\b|canine/, "HealthTech"],
    [/proptech|property|real estate|housing|rental/, "PropTech"],
    [/agtech|agri|farm|crop|livestock|food/, "AgriTech"],
    [/edtech|educat|learning|school|student|tutor/, "EdTech"],
    [/marketplace|booking|e-?commerce|retail|shop/, "MarketPlace"],
    [/deep ?tech|defence|defense|quantum|space|robot|semiconductor|drone/, "DeepTech"],
    [/climate|clean ?tech|energy|solar|battery|carbon|grid/, "CleanTech"],
    [/saas|software|platform|\bai\b|automation|analytics|cloud|app\b/, "SaaS"],
  ];
  for (const [re, label] of probes) if (re.test(t)) return label;
  return "Unclassified";
}

export function isoDateFrom(raw: string | null | undefined, fallback: Date): string {
  if (raw) {
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    const m = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }
  return fallback.toISOString().slice(0, 10);
}

/** One sentence / headline (+ optional lede) → a candidate, or null when name or amount is missing. */
export function extractCandidate(input: { headline: string; lede?: string; url: string; date: string; source: IngestSource }): ComparableCandidate | null {
  const headline = input.headline.replace(/\s+/g, " ").trim();
  const lede = (input.lede ?? "").replace(/\s+/g, " ").trim();
  if (!headline && !lede) return null;
  // The lede usually names the company first ("Evatto bags $1.02m …"); the headline is the fallback.
  const name = parseName(lede) ?? parseName(headline);
  const amount = parseAmount(lede) ?? parseAmount(headline);
  if (!name || !amount) return null;
  const stage = parseStage(headline) ?? parseStage(lede) ?? (input.source.defaultStage ? { stage: input.source.defaultStage, label: "Listed" } : null);
  const sector = guessSector(`${headline} ${lede}`);
  let confidence = 0.6;
  if (stage) confidence += 0.2;
  if (sector !== "Unclassified") confidence += 0.1;
  const notes: string[] = [];
  if (amount.currency !== "AUD") notes.push(`amount stated in ${amount.currency} (${amount.raw}); converted at ${amount.currency === "USD" ? USD_AUD : NZD_AUD}`);
  if (!stage) notes.push("stage not stated");
  return {
    name,
    sector,
    stage: stage?.stage ?? "seed",
    round_date: isoDateFrom(input.date, new Date()),
    round_label: stage?.label ?? null,
    amount_aud: amount.amountAud,
    currency: amount.currency,
    source_name: input.source.id,
    source_url: input.url,
    source_date: isoDateFrom(input.date, new Date()),
    source_excerpt: (lede || headline).slice(0, 280),
    confidence: Math.round(confidence * 100) / 100,
    note: notes.length ? notes.join("; ") : null,
  };
}

/** Startup Daily RSS → candidates. */
export function extractFromRss(items: RssItem[], source: IngestSource): ComparableCandidate[] {
  const out: ComparableCandidate[] = [];
  for (const it of items) {
    const c = extractCandidate({ headline: it.title, lede: it.description, url: it.link || source.url, date: it.pubDate, source });
    if (c) out.push(c);
  }
  return out;
}

/** Sentence splitter for roundup prose. */
function sentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z])/)
    .map((s) => s.replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 12 && s.length <= 400);
}

/** Roundup / announcements HTML → candidates (one per sentence carrying a raise verb + amount). */
export function extractFromHtml(html: string, pageUrl: string, dateHint: string | null, source: IngestSource): ComparableCandidate[] {
  const text = htmlToText(html);
  const out: ComparableCandidate[] = [];
  const seen = new Set<string>();
  for (const s of sentences(text)) {
    if (!VERB_RE.test(s) || !AMOUNT_RE.test(s)) continue;
    const c = extractCandidate({ headline: s, url: pageUrl, date: dateHint ?? "", source });
    if (!c) continue;
    const k = dedupeKey(c.name, c.round_date);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

/** Newest `ctv-<mon>-<yy>` roundup links on the Cut Through insights index (absolute URLs). */
export function roundupLinks(indexHtml: string, baseUrl: string, limit = 3): string[] {
  const found = new Set<string>();
  const re = /href=["']([^"']*\/insights\/ctv-[a-z]{3}-\d{2}[^"']*)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(indexHtml)) !== null) {
    try {
      found.add(new URL(m[1], baseUrl).toString());
    } catch {
      /* skip */
    }
  }
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const dated = [...found].map((u) => {
    const mm = u.match(/ctv-([a-z]{3})-(\d{2})/i);
    const yy = mm ? 2000 + Number(mm[2]) : 0;
    const mi = mm ? MONTHS.indexOf(mm[1].toLowerCase()) : -1;
    return { u, sort: yy * 100 + (mi < 0 ? 0 : mi + 1), date: mm && mi >= 0 ? `${yy}-${String(mi + 1).padStart(2, "0")}-01` : null };
  });
  return dated
    .filter((d) => hostAllowed(d.u))
    .sort((a, b) => b.sort - a.sort)
    .slice(0, limit)
    .map((d) => d.u);
}

export function roundupDate(url: string): string | null {
  const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  const mm = url.match(/ctv-([a-z]{3})-(\d{2})/i);
  if (!mm) return null;
  const mi = MONTHS.indexOf(mm[1].toLowerCase());
  if (mi < 0) return null;
  return `${2000 + Number(mm[2])}-${String(mi + 1).padStart(2, "0")}-01`;
}

/** Batch + stored-row dedupe on (name_key, round_date). */
export function dedupeCandidates(candidates: ComparableCandidate[], existingKeys: Iterable<string>): { fresh: ComparableCandidate[]; duplicates: number } {
  const seen = new Set<string>(existingKeys);
  const fresh: ComparableCandidate[] = [];
  let duplicates = 0;
  for (const c of candidates) {
    const k = dedupeKey(c.name, c.round_date);
    if (seen.has(k)) {
      duplicates += 1;
      continue;
    }
    seen.add(k);
    fresh.push(c);
  }
  return { fresh, duplicates };
}

// ─── Runner ──────────────────────────────────────────────────────────────────

export interface IngestDb {
  from(table: string): {
    select(cols: string): { gte(col: string, v: string): { limit(n: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }> } };
    upsert(rows: Record<string, unknown>[], opts: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: { message: string } | null }>;
  };
}

export interface IngestSourceResult {
  id: IngestSourceId;
  status: "ok" | "fetch_failed" | "refused" | "skipped";
  pages: number;
  candidates: number;
  error?: string;
}

export interface IngestSummary {
  ok: boolean;
  dryRun: boolean;
  ranAt: string;
  sources: IngestSourceResult[];
  candidates: number;
  duplicates: number;
  inserted: number;
  /** The rows that were (or would be) inserted. */
  rows: ComparableCandidate[];
  error?: string;
}

export interface IngestDeps {
  fetch?: (url: string) => Promise<FetchTextResult>;
  db?: IngestDb | null;
  now?: () => Date;
  /** Restrict to these source ids (default: all). */
  only?: IngestSourceId[];
  /** Overall wall-clock budget for the fetch phase (default 90 s; cron-runner cuts at 120 s). */
  deadlineMs?: number;
  /** Cap on rows inserted per run (cost guardrail: the review queue stays reviewable). */
  maxInsert?: number;
  /** Roundup pages to follow on the Cut Through index. */
  roundupPages?: number;
}

const DEFAULT_MAX_INSERT = 50;
const LOOKBACK_DAYS = 400;

async function existingKeys(db: IngestDb, since: string): Promise<Set<string>> {
  const { data, error } = await db.from(COMPARABLES_TABLE).select("name_key, round_date").gte("round_date", since).limit(5000);
  if (error) throw new Error(`existing rows: ${error.message}`);
  const keys = new Set<string>();
  for (const r of (data ?? []) as Array<{ name_key?: string; round_date?: string }>) {
    if (r.name_key && r.round_date) keys.add(`${r.name_key}|${r.round_date}`);
  }
  return keys;
}

export function candidateToRow(c: ComparableCandidate): Record<string, unknown> {
  return {
    name: c.name,
    sector: c.sector,
    stage: c.stage,
    round_date: c.round_date,
    round_label: c.round_label,
    amount_aud: c.amount_aud,
    source_name: c.source_name,
    source_url: c.source_url,
    source_date: c.source_date,
    source_excerpt: c.source_excerpt,
    note: c.note ? `${c.note}; confidence ${c.confidence}` : `confidence ${c.confidence}`,
    status: "pending",
  };
}

/**
 * Fetch every allow-listed source, extract, dedupe and (with `write`) insert
 * the fresh rows as `pending`. Never throws on a per-source failure — the
 * summary carries each source's status; `ok:false` only when the DB step
 * fails.
 */
export async function runComparablesIngest(opts: { write: boolean }, deps: IngestDeps = {}): Promise<IngestSummary> {
  const now = deps.now ?? (() => new Date());
  // One retry and a shared deadline: 3 sources × 15 s × 3 attempts was ≈225 s,
  // past the 120 s cron budget (`maxDuration` is ignored under standalone).
  const startedAt = Date.now();
  const deadlineMs = deps.deadlineMs ?? 90_000;
  const doFetch = deps.fetch ?? ((url: string) => fetchText(url, { timeoutMs: Math.max(3_000, Math.min(15_000, deadlineMs - (Date.now() - startedAt))), retries: 1 }));
  const dryRun = !opts.write;
  const summary: IngestSummary = { ok: true, dryRun, ranAt: now().toISOString(), sources: [], candidates: 0, duplicates: 0, inserted: 0, rows: [] };
  const all: ComparableCandidate[] = [];

  const fetchAllowed = async (url: string): Promise<FetchTextResult | null> => {
    if (!hostAllowed(url)) return null;
    const res = await doFetch(url);
    // The allow-list applies to where the body actually came from too: a
    // redirect off an allowed host must not be parsed (W5 review).
    if (res?.finalUrl && !hostAllowed(res.finalUrl)) return { ...res, ok: false, text: "", error: `redirected off the allow-list: ${res.finalUrl}` };
    return res;
  };

  for (const source of INGEST_SOURCES) {
    if (deps.only && !deps.only.includes(source.id)) {
      summary.sources.push({ id: source.id, status: "skipped", pages: 0, candidates: 0 });
      continue;
    }
    if (Date.now() - startedAt > deadlineMs) {
      summary.sources.push({ id: source.id, status: "skipped", pages: 0, candidates: 0, error: "deadline" });
      continue;
    }
    const out: IngestSourceResult = { id: source.id, status: "ok", pages: 0, candidates: 0 };
    try {
      const entry = await fetchAllowed(source.url);
      if (!entry) {
        out.status = "refused";
        out.error = "host not allow-listed";
      } else if (!entry.ok) {
        out.status = "fetch_failed";
        out.error = entry.error ?? `http ${entry.status}`;
      } else {
        out.pages = 1;
        let found: ComparableCandidate[] = [];
        if (source.kind === "rss") {
          found = extractFromRss(parseRssItems(entry.text), source);
        } else if (source.kind === "html-index") {
          const links = roundupLinks(entry.text, entry.finalUrl ?? source.url, deps.roundupPages ?? 2);
          for (const link of links) {
            const page = await fetchAllowed(link);
            if (!page?.ok) continue;
            out.pages += 1;
            found.push(...extractFromHtml(page.text, link, roundupDate(link), source));
          }
        } else {
          found = extractFromHtml(entry.text, entry.finalUrl ?? source.url, null, source);
        }
        out.candidates = found.length;
        all.push(...found);
      }
    } catch (err) {
      out.status = "fetch_failed";
      out.error = err instanceof Error ? err.message : String(err);
    }
    summary.sources.push(out);
  }

  summary.candidates = all.length;
  const since = new Date(now().getTime() - LOOKBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  let stored = new Set<string>();
  try {
    if (deps.db) stored = await existingKeys(deps.db, since);
  } catch (err) {
    summary.ok = false;
    summary.error = err instanceof Error ? err.message : String(err);
    return summary;
  }
  const { fresh, duplicates } = dedupeCandidates(all, stored);
  summary.duplicates = duplicates;
  const capped = fresh.slice(0, deps.maxInsert ?? DEFAULT_MAX_INSERT);
  summary.rows = capped;

  if (dryRun) return summary;
  if (!deps.db) {
    summary.ok = false;
    summary.error = "db_unavailable";
    return summary;
  }
  if (!capped.length) return summary;
  const { error } = await deps.db.from(COMPARABLES_TABLE).upsert(capped.map(candidateToRow), { onConflict: "name_key,round_date", ignoreDuplicates: true });
  if (error) {
    summary.ok = false;
    summary.error = error.message;
    return summary;
  }
  summary.inserted = capped.length;
  return summary;
}
