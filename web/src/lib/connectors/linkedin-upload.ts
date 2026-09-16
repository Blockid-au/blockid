// LinkedIn upload / URL connector (G13-W5-R5 / S-R5, spec §C.7 row 1).
//
// Three input modes, one output — `FounderSignals`, persisted to
// `founder_signals` (migration 0402) and read by the FTV chapter:
//
//   pdf   the founder's own LinkedIn "Save to PDF" export (Profile → More →
//         Save to PDF). Text via lib/pdf/extract-text, then the same parser
//         as text mode. No raw text is stored — parsed fields only.
//   text  the profile pasted as plain text (same layout: name, headline,
//         Experience / Education sections).
//   url   a linkedin.com/in/<slug> URL — validated, stored and displayed.
//         Never fetched: LinkedIn forbids scraping; the URL is a pointer the
//         evaluator can open, nothing more.
//
// Signals: years of experience (merged role intervals), years in the
// startup's domain (roles whose company / title / description match the
// sector keywords; total when no sector is known), prior companies, exits
// (roles that mention an acquisition / IPO / sale), team size on the page
// ("team of 14"), current role + headline, education. Pure regex — no LLM.

import { extractPdfTextFromBuffer } from "@/lib/pdf/extract-text";

export type FounderSignalSource = "linkedin_pdf" | "linkedin_text" | "linkedin_url" | "manual";

export interface FounderRole {
  company: string;
  title: string | null;
  /** YYYY-MM when parsed. */
  start: string | null;
  end: string | null;
  current: boolean;
  months: number | null;
  /** True when the entry mentions an acquisition / IPO / sale. */
  exit: boolean;
}

export interface FounderSignals {
  source: FounderSignalSource;
  profileUrl: string | null;
  founderName: string | null;
  headline: string | null;
  currentRole: string | null;
  yearsExperience: number | null;
  yearsInDomain: number | null;
  priorCompanies: string[];
  exits: number;
  teamSizeOnPage: number | null;
  roles: FounderRole[];
  education: string[];
  /** 0–1 heuristic. */
  confidence: number;
  parsedAt: string;
}

const NBSP_RE = new RegExp(String.fromCharCode(160), "g");
const LINKEDIN_URL_RE = /^(?:https?:\/\/)?(?:[a-z]{2,3}\.)?linkedin\.com\/in\/([A-Za-z0-9\-_%.]{3,100})\/?(?:[?#].*)?$/i;
const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const SECTION_RE = /^(contact|top skills|languages|certifications|honors-awards|honours-awards|publications|patents|summary|experience|education|skills|volunteer experience|projects|courses|interests)\s*$/i;
const DATE_RANGE_RE = /^(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?(\d{4})\s*[-–—]\s*(present|current|now|(?:(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+)?(\d{4}))(?:\s*[(·].*)?$/i;
const DURATION_ONLY_RE = /^\(?\s*(\d+)\s*(?:years?|yrs?)(?:\s*(\d+)\s*(?:months?|mos?))?\s*\)?$/i;
const EXIT_RE = /\b(acquired|acquisition|exit(?:ed)?|ipo|sold to|merged with|bought by|trade sale|listed on)\b/i;
const TEAM_RE = /\b(?:team of|grew (?:the )?team to|built a team of|led a team of|managed a team of)\s+(\d{1,4})\b|\b(\d{1,4})[- ](?:person|people|strong) team\b|\b(\d{1,4})\s+(?:employees|staff|fte)\b/gi;

/** Validate + normalise a LinkedIn profile URL. Null when it is not a linkedin.com/in/ link. */
export function normaliseLinkedInUrl(raw: string): string | null {
  const s = (raw ?? "").trim();
  const m = s.match(LINKEDIN_URL_RE);
  if (!m) return null;
  return `https://www.linkedin.com/in/${m[1].replace(/\/+$/, "")}`;
}

function ym(monthWord: string | undefined, year: string): string {
  const mm = monthWord ? MONTHS[monthWord.slice(0, 3).toLowerCase()] ?? 1 : 1;
  return `${year}-${String(mm).padStart(2, "0")}`;
}

function monthsBetween(start: string, end: string): number {
  const [sy, sm] = start.split("-").map(Number);
  const [ey, em] = end.split("-").map(Number);
  return Math.max(0, (ey - sy) * 12 + (em - sm));
}

function nowYm(now: Date): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Parse "Jan 2021 - Present (5 years 9 months)" / "2013 - 2016". */
export function parseDateRange(line: string, now: Date = new Date()): { start: string; end: string; current: boolean; months: number } | null {
  const m = line.trim().match(DATE_RANGE_RE);
  if (!m) return null;
  const start = ym(m[1], m[2]);
  const current = /^(present|current|now)$/i.test(m[3]);
  const end = current ? nowYm(now) : ym(m[4], m[5]);
  return { start, end, current, months: monthsBetween(start, end) };
}

/** Sum of merged [start, end] intervals in years (1 dp). */
export function mergedYears(intervals: Array<{ start: string; end: string }>): number {
  const sorted = intervals
    .map((i) => ({ s: Number(i.start.slice(0, 4)) * 12 + Number(i.start.slice(5, 7)), e: Number(i.end.slice(0, 4)) * 12 + Number(i.end.slice(5, 7)) }))
    .filter((i) => Number.isFinite(i.s) && Number.isFinite(i.e) && i.e >= i.s)
    .sort((a, b) => a.s - b.s);
  let total = 0;
  let cur: { s: number; e: number } | null = null;
  for (const i of sorted) {
    // Adjacent months ("Dec 2020" → "Jan 2021") are one continuous run.
    if (!cur || i.s > cur.e + 1) {
      if (cur) total += cur.e - cur.s;
      cur = { ...i };
    } else if (i.e > cur.e) cur.e = i.e;
  }
  if (cur) total += cur.e - cur.s;
  return Math.round((total / 12) * 10) / 10;
}

/** Largest "team of N" style mention on the page. */
export function teamSizeFromText(text: string): number | null {
  let best: number | null = null;
  for (const m of text.matchAll(TEAM_RE)) {
    const n = Number(m[1] ?? m[2] ?? m[3]);
    if (Number.isFinite(n) && n > 0 && n < 10_000 && (best === null || n > best)) best = n;
  }
  return best;
}

interface Section {
  name: string;
  lines: string[];
}

/** Split the export text into its LinkedIn sections (the preamble before the first header is "preamble"). */
export function splitSections(text: string): Section[] {
  const out: Section[] = [{ name: "preamble", lines: [] }];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(NBSP_RE, " ").replace(/[ \t]+$/g, "").replace(/^\s*Page \d+ of \d+\s*$/i, "");
    const h = line.trim().match(SECTION_RE);
    if (h) {
      out.push({ name: h[1].toLowerCase(), lines: [] });
      continue;
    }
    out[out.length - 1].lines.push(line.trimEnd());
  }
  return out;
}

const LOCATION_RE = /\b(australia|new zealand|united states|united kingdom|singapore|vietnam|viet nam|india|canada|germany|france|area|region|metropolitan)\b/i;

/**
 * Experience section → roles. LinkedIn prints, per role: company, title,
 * date range, location, description. PDF text extraction drops the blank
 * lines between roles, so the parser anchors on the date-range lines: the
 * two non-empty lines above a date line are company + title (one line =
 * another title under the previous company), everything between that date
 * line and the next role's header is the description.
 */
export function parseExperience(lines: string[], now: Date = new Date()): FounderRole[] {
  const ls = lines.map((l) => l.trim());
  const dateIdxs = ls.map((l, i) => (DATE_RANGE_RE.test(l) ? i : -1)).filter((i) => i >= 0);
  const roles: FounderRole[] = [];
  let lastCompany: string | null = null;
  const headerStarts: number[] = [];
  for (const d of dateIdxs) {
    const header: number[] = [];
    for (let i = d - 1; i >= 0 && header.length < 2; i -= 1) {
      if (!ls[i]) continue;
      if (DURATION_ONLY_RE.test(ls[i])) continue;
      if (DATE_RANGE_RE.test(ls[i])) break;
      header.unshift(i);
    }
    headerStarts.push(header[0] ?? d);
    let company: string | null;
    let title: string | null;
    if (header.length === 2) {
      company = ls[header[0]].replace(/\s*\(.*\)\s*$/, "").trim();
      title = ls[header[1]];
    } else if (header.length === 1) {
      // A lone line above the dates is a further title under the same company (multi-role block).
      company = lastCompany ?? ls[header[0]];
      title = lastCompany ? ls[header[0]] : null;
    } else {
      company = lastCompany ?? "Unknown";
      title = null;
    }
    lastCompany = company;
    roles.push({ company, title, start: null, end: null, current: false, months: null, exit: false });
  }
  // Second pass: dates + descriptions now that every header start is known.
  dateIdxs.forEach((d, k) => {
    const range = parseDateRange(ls[d], now);
    const stop = k + 1 < dateIdxs.length ? headerStarts[k + 1] : ls.length;
    const rest = ls
      .slice(d + 1, stop)
      .filter((l) => l && !(LOCATION_RE.test(l) && l.length <= 60))
      .join(" ");
    const r = roles[k];
    r.start = range?.start ?? null;
    r.end = range?.end ?? null;
    r.current = range?.current ?? false;
    r.months = range?.months ?? null;
    r.exit = EXIT_RE.test(rest) || EXIT_RE.test(r.title ?? "");
  });
  return roles;
}

const DEGREE_LINE_RE = /·\s*\(?\d{4}|\(\d{4}\s*[-–]\s*\d{4}\)|\b(bachelor|master|mba|phd|diploma|certificate|associate)\b/i;

/** Education section → "Institution — Degree" (anchored on the degree line; institution is the line above). */
export function parseEducation(lines: string[]): string[] {
  const ls = lines.map((l) => l.trim()).filter(Boolean);
  const out: string[] = [];
  for (let i = 0; i < ls.length; i += 1) {
    if (!DEGREE_LINE_RE.test(ls[i])) continue;
    const inst = i > 0 && !DEGREE_LINE_RE.test(ls[i - 1]) ? ls[i - 1] : null;
    const degree = ls[i].replace(/\s*·.*$/, "").replace(/\s*\(\d{4}\s*[-–]\s*\d{4}\)\s*$/, "").trim();
    out.push(inst ? `${inst} — ${degree}` : degree);
  }
  if (!out.length && ls.length) out.push(ls[0]);
  return out.slice(0, 6);
}

const NAME_RE = /^[A-Z][\p{L}'’.-]+(?: [A-Z][\p{L}'’.-]+){1,3}$/u;
const PROFILE_LOCATION_RE = /^[\p{L}' .-]+,\s*[\p{L}' .-]+(?:,\s*[\p{L}' .-]+)?$/u;

/**
 * Name + headline. The export prints, in this order, "Firstname Lastname" /
 * headline / "City, State, Country" right before Summary — so the location
 * line is the anchor: name = two lines above it, headline = one above.
 * Fallback (no location line): the LAST name-shaped line before the first
 * Summary / Experience header (skills and languages come earlier).
 */
export function parseNameAndHeadline(sections: Section[]): { name: string | null; headline: string | null } {
  const pre = sections.filter((s) => s.name === "preamble" || s.name === "contact" || s.name === "top skills" || s.name === "languages" || s.name === "certifications" || s.name === "honors-awards" || s.name === "honours-awards" || s.name === "publications" || s.name === "patents");
  const lines = pre.flatMap((s) => s.lines).map((l) => l.trim()).filter((l) => l.length > 0);
  const isName = (l: string) => NAME_RE.test(l) && !/linkedin|www\.|@|\+\d/.test(l);
  for (let i = 2; i < lines.length; i += 1) {
    if (PROFILE_LOCATION_RE.test(lines[i]) && LOCATION_RE.test(lines[i]) && isName(lines[i - 2]) && !isName(lines[i - 1])) {
      return { name: lines[i - 2], headline: lines[i - 1] };
    }
  }
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (!isName(lines[i])) continue;
    const next = lines[i + 1] ?? null;
    if (next && (next.length > 160 || isName(next))) continue;
    return { name: lines[i], headline: next };
  }
  return { name: null, headline: null };
}

export interface ParseOptions {
  /** Sector keywords for "years in domain" (e.g. ["health", "clinic", "medical"]). */
  domainKeywords?: string[];
  now?: Date;
  profileUrl?: string | null;
}

/** Plain-text LinkedIn export → FounderSignals. */
export function parseLinkedInText(text: string, opts: ParseOptions = {}, source: FounderSignalSource = "linkedin_text"): FounderSignals {
  const now = opts.now ?? new Date();
  const sections = splitSections(text ?? "");
  const { name, headline } = parseNameAndHeadline(sections);
  const exp = sections.find((s) => s.name === "experience");
  const edu = sections.find((s) => s.name === "education");
  const roles = exp ? parseExperience(exp.lines, now) : [];
  const education = edu ? parseEducation(edu.lines) : [];
  const dated = roles.filter((r) => r.start && r.end) as Array<FounderRole & { start: string; end: string }>;
  const yearsExperience = dated.length ? mergedYears(dated) : null;
  const kws = (opts.domainKeywords ?? []).map((k) => k.toLowerCase()).filter(Boolean);
  // The current venture is in the domain by definition; earlier roles count when company / title carry a sector keyword.
  const inDomain = kws.length ? dated.filter((r) => r.current || kws.some((k) => `${r.company} ${r.title ?? ""}`.toLowerCase().includes(k))) : dated;
  const yearsInDomain = inDomain.length ? mergedYears(inDomain) : kws.length ? 0 : yearsExperience;
  const current = roles.find((r) => r.current) ?? roles[0] ?? null;
  const priorCompanies = Array.from(new Set(roles.filter((r) => r !== current).map((r) => r.company))).slice(0, 12);
  const exits = roles.filter((r) => r.exit).length;
  const teamSizeOnPage = teamSizeFromText(text ?? "");
  let confidence = 0.2;
  if (name) confidence += 0.15;
  if (headline) confidence += 0.1;
  if (roles.length) confidence += 0.25;
  if (dated.length) confidence += 0.2;
  if (education.length) confidence += 0.1;
  return {
    source,
    profileUrl: opts.profileUrl ?? null,
    founderName: name,
    headline,
    currentRole: current ? `${current.title ?? "Founder"} at ${current.company}` : null,
    yearsExperience,
    yearsInDomain,
    priorCompanies,
    exits,
    teamSizeOnPage,
    roles,
    education,
    confidence: Math.round(Math.min(1, confidence) * 100) / 100,
    parsedAt: now.toISOString(),
  };
}

/** LinkedIn "Save to PDF" export → FounderSignals (text through the shared pdf extractor). */
export async function parseLinkedInPdf(buffer: Buffer, opts: ParseOptions = {}): Promise<FounderSignals & { extractedChars: number; engine: string }> {
  const r = await extractPdfTextFromBuffer(buffer, { byteScanFallback: false });
  const signals = parseLinkedInText(r.text, opts, "linkedin_pdf");
  return { ...signals, extractedChars: r.text.length, engine: r.engine };
}

/** URL only: validated pointer, nothing fetched. */
export function parseLinkedInUrl(raw: string, opts: ParseOptions = {}): FounderSignals | null {
  const url = normaliseLinkedInUrl(raw);
  if (!url) return null;
  const now = opts.now ?? new Date();
  return {
    source: "linkedin_url",
    profileUrl: url,
    founderName: null,
    headline: null,
    currentRole: null,
    yearsExperience: null,
    yearsInDomain: null,
    priorCompanies: [],
    exits: 0,
    teamSizeOnPage: null,
    roles: [],
    education: [],
    confidence: 0.2,
    parsedAt: now.toISOString(),
  };
}

// ─── Persistence (injected client; shape mirrors founder_signals) ─────────────

export interface FounderSignalsRow {
  id?: string;
  project_id: string;
  source: FounderSignalSource;
  profile_url: string | null;
  founder_name: string | null;
  headline: string | null;
  current_title: string | null;
  years_experience: number | null;
  years_in_domain: number | null;
  prior_companies: string[];
  exits: number;
  team_size_on_page: number | null;
  roles: FounderRole[];
  education: string[];
  confidence: number;
  parsed_at: string;
}

export function toFounderSignalsRow(projectId: string, s: FounderSignals): FounderSignalsRow {
  return {
    project_id: projectId,
    source: s.source,
    profile_url: s.profileUrl,
    founder_name: s.founderName,
    headline: s.headline,
    current_title: s.currentRole,
    years_experience: s.yearsExperience,
    years_in_domain: s.yearsInDomain,
    prior_companies: s.priorCompanies,
    exits: s.exits,
    team_size_on_page: s.teamSizeOnPage,
    roles: s.roles,
    education: s.education,
    confidence: s.confidence,
    parsed_at: s.parsedAt,
  };
}

export function fromFounderSignalsRow(r: FounderSignalsRow): FounderSignals {
  return {
    source: r.source,
    profileUrl: r.profile_url,
    founderName: r.founder_name,
    headline: r.headline,
    currentRole: r.current_title,
    yearsExperience: r.years_experience == null ? null : Number(r.years_experience),
    yearsInDomain: r.years_in_domain == null ? null : Number(r.years_in_domain),
    priorCompanies: Array.isArray(r.prior_companies) ? r.prior_companies : [],
    exits: Number(r.exits ?? 0),
    teamSizeOnPage: r.team_size_on_page == null ? null : Number(r.team_size_on_page),
    roles: Array.isArray(r.roles) ? r.roles : [],
    education: Array.isArray(r.education) ? r.education : [],
    confidence: Number(r.confidence ?? 0),
    parsedAt: r.parsed_at,
  };
}

export interface FounderSignalsDb {
  from(table: string): {
    insert(row: Record<string, unknown>): { select(cols: string): { maybeSingle(): PromiseLike<{ data: unknown | null; error: { message: string } | null }> } };
    select(cols: string): { eq(col: string, v: string): { order(col: string, o: { ascending: boolean }): { limit(n: number): { maybeSingle(): PromiseLike<{ data: unknown | null; error: { message: string } | null }> } } } };
  };
}

export const FOUNDER_SIGNALS_TABLE = "founder_signals";

export async function saveFounderSignals(db: FounderSignalsDb, projectId: string, signals: FounderSignals): Promise<{ ok: true; id: string | null } | { ok: false; error: string }> {
  const { data, error } = await db.from(FOUNDER_SIGNALS_TABLE).insert(toFounderSignalsRow(projectId, signals) as unknown as Record<string, unknown>).select("id").maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, id: (data as { id?: string } | null)?.id ?? null };
}

/** Latest parsed signals for a project, or null (also null when 0402 is not applied). */
export async function loadLatestFounderSignals(db: FounderSignalsDb, projectId: string): Promise<FounderSignals | null> {
  try {
    const { data, error } = await db.from(FOUNDER_SIGNALS_TABLE).select("*").eq("project_id", projectId).order("parsed_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !data) return null;
    return fromFounderSignalsRow(data as FounderSignalsRow);
  } catch {
    return null;
  }
}
