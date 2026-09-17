// "What we read" — the input echo for the first analysis (S32-B).
//
// Founder report 2026-09-15: the /analyze result did not show what BlockID
// had actually taken from the input, so a founder could not tell whether a
// low score meant "your startup is weak" or "you did not tell us". This
// builder turns an IntakeResult into a table of parsed facts — company,
// one-liner, sector, stage, team, traction, ask, URLs, slide titles, key
// claims — each with its SOURCE ("from slide 3", "from your text",
// "from https://…") and an explicit "not provided" row where nothing was
// found, so the founder sees exactly what to add.
//
// Pure and client-safe: no `server-only`, no I/O, no Next. The result page,
// the saved view and the PDF all render the same object, and the job runner
// hands the same rows to the agents as their grounding — an agent can only
// cite what is on this table.

import type { IntakeResult, IntakeStructured } from "@/lib/intake/analyze-input";
import type { SVIExtractedSignals } from "@/lib/svi-analysis";
import { LEGACY_SVI_STAGE_LABELS, SECTOR_LABELS } from "@/lib/svi-analysis";
import { extractProjectName } from "@/lib/project-name-extractor";
import { formatFigureAud, parseFinancialFigures, type RevenueFigure } from "@/lib/intake/financial-figures";

export type EchoRowKey =
  | "company"
  | "one_liner"
  | "sector"
  | "stage"
  | "team"
  | "founder"
  | "traction"
  | "revenue"
  | "ask"
  | "cap"
  | "urls";

export interface EchoRow {
  key: EchoRowKey;
  label: string;
  /** null = not provided. */
  value: string | null;
  /** Where it came from, or null when not provided. */
  source: string | null;
  /** What to add when the value is missing. */
  hint: string;
}

export interface EchoClaim {
  text: string;
  source: string;
}

export interface EchoSlide {
  n: number;
  title: string;
}

export interface InputEcho {
  /** Best-known company name; "Your startup" when none was found. */
  company: string;
  companyKnown: boolean;
  inputKind: string;
  rows: EchoRow[];
  provided: number;
  total: number;
  claims: EchoClaim[];
  slideTitles: EchoSlide[];
  urls: string[];
  /** Characters BlockID read, and whether the stored copy was cut. */
  chars: number;
  truncated: boolean;
  warnings: string[];
}

/** The loose shape the builder accepts — a live IntakeResult or a stored one. */
export interface EchoInput {
  inputKind?: string | null;
  rawText?: string | null;
  structured?: IntakeStructured | null;
  signals?: Partial<SVIExtractedSignals> | null;
  context?: { stage?: number } | null;
  warnings?: string[] | null;
}

export interface EchoMeta {
  url?: string | null;
  filename?: string | null;
  chars?: number | null;
  truncated?: boolean | null;
}

const MAX_CLAIMS = 8;
const MAX_SLIDES = 20;
const MAX_URLS = 6;
const MAX_VALUE_CHARS = 220;

const ROW_LABELS: Record<EchoRowKey, { label: string; hint: string }> = {
  company: { label: "Company", hint: "Add the company or product name." },
  one_liner: { label: "One-liner", hint: "One sentence: who it is for and what it does." },
  sector: { label: "Sector", hint: "Name the industry so the benchmarks match." },
  stage: { label: "Stage", hint: "Say whether you have a prototype, users or revenue." },
  team: { label: "Team", hint: "Founders, their backgrounds, and how many people work on it." },
  founder: { label: "Founder profile", hint: "Fill the Execution tab of your founder profile (exits, prior raises, roles, full-time %, GitHub) — it drives the Founder & Team score instead of keyword matching." },
  traction: { label: "Traction", hint: "Users, customers, pilots, waitlist — with numbers." },
  revenue: { label: "Revenue", hint: "MRR / ARR, or 'A$X over the last N months', or 'pre-revenue' — a figure changes the valuation method." },
  ask: { label: "The ask", hint: "How much you are raising and what it funds." },
  cap: { label: "Stated cap / pre-money", hint: "The SAFE cap or pre-money you are raising at, if you have one — we cross-check it against the indicative range." },
  urls: { label: "Links", hint: "Website, product, repo or deck links." },
};

const FOUNDER_ROW_LABEL: Record<string, string> = {
  exits: "exits",
  raises: "prior raises",
  years_in_domain: "years in domain",
  roles: "roles",
  full_time: "full-time",
  worked_together: "worked together",
  github: "GitHub",
};

function clip(text: string, max = MAX_VALUE_CHARS): string {
  const v = text.replace(/\s+/g, " ").trim();
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

function firstLine(slide: string): string {
  return slide.split(/\n/).map((l) => l.trim()).find((l) => l.length > 0) ?? "";
}

/** Split text into sentences generously; abbreviations are not worth the risk here. */
function sentences(text: string): string[] {
  // Lines first (a slide is lines, not prose), then sentence boundaries.
  return text
    .split(/\n+/)
    .flatMap((line) =>
      line.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/),
    )
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);
}

/**
 * Where did this snippet come from? Slides win over pages over "your text",
 * because a slide number is the most actionable citation a founder can get.
 */
export function locateSource(
  snippet: string,
  structured: IntakeStructured | null | undefined,
  fallback = "from your text",
): string {
  const needle = snippet.replace(/\s+/g, " ").trim().toLowerCase().slice(0, 60);
  if (!needle) return fallback;
  const slides = structured?.slides ?? [];
  for (let i = 0; i < slides.length; i++) {
    if (slides[i].replace(/\s+/g, " ").toLowerCase().includes(needle)) {
      return `from slide ${i + 1}`;
    }
  }
  const pages = structured?.pages ?? [];
  for (const page of pages) {
    if (page.text.replace(/\s+/g, " ").toLowerCase().includes(needle)) {
      return `from ${page.url}`;
    }
  }
  return fallback;
}

const URL_RE = /\bhttps?:\/\/[^\s<>"')\]]+|\bwww\.[a-z0-9-]+(?:\.[a-z0-9-]+)+[^\s<>"')\]]*/gi;

export function extractUrls(text: string, extra?: string | null): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string) => {
    const cleaned = raw.replace(/[.,;:]+$/, "");
    const key = cleaned.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      out.push(cleaned);
    }
  };
  if (extra && extra.trim()) push(extra.trim());
  for (const m of text.match(URL_RE) ?? []) push(m);
  return out.slice(0, MAX_URLS);
}

const MONEY = String.raw`(?:A?\$|AUD\s?)\s?\d[\d,]*(?:\.\d+)?\s?(?:k|m|b|bn|million|thousand|billion)?`;
const MONEY_RE = new RegExp(MONEY, "i");

const REVENUE_RE = new RegExp(
  String.raw`(?:(?:mrr|arr|revenue|turnover|sales)\b[^.\n]{0,40}?(${MONEY}))|(?:(${MONEY})[^.\n]{0,25}?\b(?:mrr|arr|(?:in|of)\s+revenue|per\s+month|a\s+month|/mo|monthly))`,
  "i",
);
const PRE_REVENUE_RE = /\bpre-?revenue\b|\bno revenue\b|\bnot (?:yet )?(?:generating|making) (?:any )?revenue\b/i;

const TRACTION_RE =
  /\b(\d[\d,]*(?:\.\d+)?\s?(?:k|m)?\+?)\s+(?:paying\s+|paid\s+|active\s+|monthly\s+|registered\s+|beta\s+|pilot\s+)?(customers?|users?|subscribers?|sign-?ups?|downloads?|clients?|schools?|clinics?|merchants?|members?|businesses|companies|waitlist(?:ed)?|installs?|pilots?|letters? of intent|lois?)\b/i;

const ASK_RE = new RegExp(
  String.raw`\b(?:raising|raise|seeking|looking for|the ask|we ask|ask(?:ing)?\s+for|round of|pre-?seed of|seed of)\b[^.\n]{0,40}?(${MONEY})`,
  "i",
);

const TEAM_SIZE_RE = /\b(?:team of|a team of)\s+(\d{1,4})\b|\b(\d{1,4})\s+(?:people|employees|staff|engineers|fte)\b/i;
const FOUNDERS_RE = /\b(\d|two|three|four|five)\s+(?:co-?)?founders\b|\bco-?founders?\b|\bsolo founder\b|\bsole founder\b/i;

function findWithSource(
  re: RegExp,
  text: string,
  structured: IntakeStructured | null | undefined,
): { value: string; source: string } | null {
  const m = text.match(re);
  if (!m) return null;
  // Show the sentence around the match, not the bare token, so the founder
  // recognises their own words.
  const idx = m.index ?? 0;
  const start = Math.max(0, text.lastIndexOf("\n", idx), text.lastIndexOf(". ", idx) + 1);
  const endCandidates = [text.indexOf("\n", idx), text.indexOf(". ", idx)].filter((e) => e >= 0);
  const end = endCandidates.length ? Math.min(...endCandidates) + 1 : Math.min(text.length, idx + 160);
  const sentence = text.slice(start, end).trim() || m[0];
  return { value: clip(sentence, 180), source: locateSource(m[0], structured) };
}

/** A regex that finds the parser's exact quote in the text (whitespace-tolerant). */
function quoteRe(quote: string): RegExp {
  const escaped = quote
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\s+/g, "\\s+");
  return new RegExp(escaped, "i");
}

/** "read as MRR A$6,000 (ARR A$72,000 annualised)" — the founder-facing reading. */
function readAs(r: RevenueFigure): string {
  const mrr = formatFigureAud(r.mrrAud);
  const arr = formatFigureAud(r.arrAud);
  if (r.kind === "mrr") return `MRR ${mrr} (ARR ${arr})`;
  if (r.kind === "arr") return `ARR ${arr} (MRR ${mrr})`;
  if (r.kind === "period") return `MRR ${mrr} over ${r.periodMonths ?? 12} months (ARR ${arr} annualised)`;
  return `ARR ${arr}, period not stated (treated as the last 12 months)`;
}

function stageLabelFor(stage: number | undefined | null): string | null {
  if (typeof stage !== "number" || !Number.isFinite(stage)) return null;
  const i = Math.max(0, Math.min(LEGACY_SVI_STAGE_LABELS.length - 1, Math.round(stage)));
  return LEGACY_SVI_STAGE_LABELS[i] ?? null;
}

function experienceLabel(exp: SVIExtractedSignals["founderExperience"] | undefined): string | null {
  switch (exp) {
    case "serial":
      return "serial founder";
    case "experienced":
      return "experienced founder";
    case "first-time":
      return "first-time founder";
    default:
      return null;
  }
}

/**
 * Build the echo. Never throws: any parse hiccup degrades to a "not provided"
 * row rather than costing the founder the page.
 */
export function buildInputEcho(intake: EchoInput, meta: EchoMeta = {}): InputEcho {
  const rawText = typeof intake.rawText === "string" ? intake.rawText : "";
  const structured = intake.structured ?? null;
  const signals = intake.signals ?? {};
  const warnings = Array.isArray(intake.warnings) ? intake.warnings.filter((w) => typeof w === "string") : [];
  const slides = structured?.slides ?? [];
  const pages = structured?.pages ?? [];
  const inputKind = intake.inputKind ?? "idea_text";

  // ── Company ────────────────────────────────────────────────────────────
  let company: string | null = null;
  let companySource: string | null = null;
  try {
    const scrapedTitle = inputKind === "website" ? rawText.split(/\n\n/)[0]?.trim() : undefined;
    const name = extractProjectName({
      rawText,
      fileName: meta.filename ?? undefined,
      url: meta.url ?? undefined,
      scraped: scrapedTitle ? { title: scrapedTitle } : undefined,
    });
    if (name && name.source !== "fallback" && name.name.trim()) {
      company = name.name.trim();
      companySource =
        name.source === "scraped-title" || name.source === "scraped-og"
          ? "from the page title"
          : name.source === "url-hostname"
            ? "from the URL"
            : name.source === "filename"
              ? "from the file name"
              : slides.length > 0
                ? locateSource(company, structured, "from slide 1")
                : "from your text";
    }
  } catch {
    company = null;
  }

  // ── One-liner ──────────────────────────────────────────────────────────
  let oneLiner: { value: string; source: string } | null = null;
  if (inputKind === "website") {
    const parts = rawText.split(/\n\n/).map((p) => p.trim()).filter(Boolean);
    const desc = parts[1] && parts[1].length >= 20 ? parts[1] : parts[0];
    if (desc) oneLiner = { value: clip(desc, 200), source: pages[0]?.url ? `from ${pages[0].url}` : "from the page" };
  } else if (slides.length > 0) {
    const lines = slides[0].split(/\n/).map((l) => l.trim()).filter(Boolean);
    const candidate = lines.find((l, i) => i > 0 && l.length >= 20) ?? lines[0];
    if (candidate) oneLiner = { value: clip(candidate, 200), source: "from slide 1" };
  } else {
    const first = sentences(rawText)[0];
    if (first) oneLiner = { value: clip(first, 200), source: "from your text" };
  }

  // ── Sector / stage ─────────────────────────────────────────────────────
  const sector = signals.sector ? (SECTOR_LABELS[signals.sector] ?? signals.sector) : null;
  const stage = stageLabelFor(intake.context?.stage);

  // ── Team ───────────────────────────────────────────────────────────────
  let team: { value: string; source: string } | null = null;
  {
    const teamText = structured?.deckSections?.team?.[0] ?? null;
    const sizeHit = findWithSource(TEAM_SIZE_RE, rawText, structured);
    const foundersHit = findWithSource(FOUNDERS_RE, rawText, structured);
    const bits: string[] = [];
    if (sizeHit) bits.push(sizeHit.value);
    else if (foundersHit) bits.push(foundersHit.value);
    else if (teamText) bits.push(clip(teamText, 180));
    const exp = experienceLabel(signals.founderExperience);
    const tags: string[] = [];
    if (signals.hasCoFounder) tags.push("co-founder team");
    if (exp && exp !== "first-time founder") tags.push(exp);
    if (signals.founderSectorFit) tags.push("domain fit");
    if (signals.hasAdvisors) tags.push("advisors");
    if (bits.length > 0 || tags.length > 0) {
      const value = [bits[0], tags.length ? `(${tags.join(", ")})` : ""].filter(Boolean).join(" ");
      team = {
        value: clip(value, 220),
        source: sizeHit?.source ?? foundersHit?.source ?? (teamText ? locateSource(teamText, structured) : "detected from your text"),
      };
    }
  }

  // ── Founder execution profile (G14-S37) ────────────────────────────────
  // The structured founder profile, when the analysis was scored with one:
  // the rubric score + the rows that earned points, so the founder sees the
  // profile was read (and that a self-reported score is capped).
  let founder: { value: string; source: string } | null = null;
  {
    const fe = signals.founderExecution;
    if (fe && typeof fe === "object" && Number.isFinite(fe.score)) {
      const parts = (fe.breakdown ?? []).filter((b) => b.points > 0).map((b) => `${FOUNDER_ROW_LABEL[b.key] ?? b.key}: ${b.evidence}`);
      const capNote = fe.capped ? " (self-reported, capped at 70)" : "";
      const value = `Execution ${Math.round(fe.score)}/100${capNote}${parts.length ? ` — ${parts.join("; ")}` : " — no structured fields yet"}`;
      founder = { value: clip(value, 220), source: "from your founder profile" };
    }
  }

  // ── Traction / revenue / ask / cap ─────────────────────────────────────
  // The shared intake parser reads the figures (EN + VI, periods, pilots,
  // SAFE caps); the older sentence regexes stay as the fallback for a
  // revenue or ask mention that carries no parseable figure.
  const figures = parseFinancialFigures(rawText);
  let traction = findWithSource(TRACTION_RE, rawText, structured);
  if (!traction && figures.pilots) {
    traction = findWithSource(quoteRe(figures.pilots.quote), rawText, structured);
  }
  let revenue: { value: string; source: string } | null = null;
  if (figures.revenue) {
    const quoteHit = findWithSource(quoteRe(figures.revenue.quote), rawText, structured);
    revenue = {
      value: clip(`${quoteHit?.value ?? figures.revenue.quote} → read as ${readAs(figures.revenue)}`, 220),
      source: quoteHit?.source ?? locateSource(figures.revenue.quote, structured),
    };
  } else if (figures.pilots) {
    const quoteHit = findWithSource(quoteRe(figures.pilots.quote), rawText, structured);
    revenue = {
      value: clip(`${quoteHit?.value ?? figures.pilots.quote} → paid pilots count as traction, not recurring revenue`, 220),
      source: quoteHit?.source ?? locateSource(figures.pilots.quote, structured),
    };
  } else {
    revenue = findWithSource(REVENUE_RE, rawText, structured);
  }
  if (!revenue) {
    const pre = findWithSource(PRE_REVENUE_RE, rawText, structured);
    if (pre) revenue = { value: "Pre-revenue (stated)", source: pre.source };
    else if (signals.hasRevenue) revenue = { value: "Revenue mentioned, no figure given", source: "detected from your text" };
  }

  // ── Ask ────────────────────────────────────────────────────────────────
  let ask: { value: string; source: string } | null = null;
  if (figures.ask) {
    const quoteHit = findWithSource(quoteRe(figures.ask.quote), rawText, structured);
    ask = {
      value: clip(`${quoteHit?.value ?? figures.ask.quote} → ${formatFigureAud(figures.ask.amountAud)}`, 220),
      source: quoteHit?.source ?? locateSource(figures.ask.quote, structured),
    };
  } else {
    ask = findWithSource(ASK_RE, rawText, structured);
  }
  if (!ask && structured?.deckSections?.ask?.[0]) {
    const askSlide = structured.deckSections.ask[0];
    const money = askSlide.match(MONEY_RE);
    if (money) ask = { value: clip(askSlide, 180), source: locateSource(askSlide, structured) };
  }

  // ── Stated cap / pre-money ─────────────────────────────────────────────
  let cap: { value: string; source: string } | null = null;
  if (figures.cap) {
    const quoteHit = findWithSource(quoteRe(figures.cap.quote), rawText, structured);
    const kind =
      figures.cap.kind === "pre_money"
        ? "pre-money"
        : figures.cap.kind === "post_money"
          ? "post-money"
          : figures.cap.kind === "valuation"
            ? "valuation"
            : "cap";
    cap = {
      value: clip(`${quoteHit?.value ?? figures.cap.quote} → ${kind} ${formatFigureAud(figures.cap.amountAud)}`, 220),
      source: quoteHit?.source ?? locateSource(figures.cap.quote, structured),
    };
  }

  // ── URLs ───────────────────────────────────────────────────────────────
  const urls = extractUrls(rawText, meta.url);

  // ── Slide titles ───────────────────────────────────────────────────────
  const slideTitles: EchoSlide[] = slides
    .slice(0, MAX_SLIDES)
    .map((slide, i) => ({ n: i + 1, title: clip(firstLine(slide), 80) }))
    .filter((s) => s.title.length > 0);

  // ── Key claims: sentences carrying a number or a percentage ───────────
  const claims: EchoClaim[] = [];
  const seen = new Set<string>();
  for (const s of sentences(rawText)) {
    if (claims.length >= MAX_CLAIMS) break;
    if (!/\d/.test(s)) continue;
    if (/^https?:\/\//i.test(s)) continue;
    const key = s.toLowerCase().slice(0, 80);
    if (seen.has(key)) continue;
    seen.add(key);
    claims.push({ text: clip(s, 200), source: locateSource(s, structured) });
  }

  const rows: EchoRow[] = [
    row("company", company, companySource),
    row("one_liner", oneLiner?.value ?? null, oneLiner?.source ?? null),
    row("sector", sector, sector ? "detected from your text" : null),
    row("stage", stage, stage ? "detected from the evidence" : null),
    row("team", team?.value ?? null, team?.source ?? null),
    row("founder", founder?.value ?? null, founder?.source ?? null),
    row("traction", traction?.value ?? null, traction?.source ?? null),
    row("revenue", revenue?.value ?? null, revenue?.source ?? null),
    row("ask", ask?.value ?? null, ask?.source ?? null),
    row("cap", cap?.value ?? null, cap?.source ?? null),
    row("urls", urls.length ? urls.join("  ·  ") : null, urls.length ? "from your input" : null),
  ];

  const provided = rows.filter((r) => r.value !== null).length;
  return {
    company: company ?? "Your startup",
    companyKnown: company !== null,
    inputKind,
    rows,
    provided,
    total: rows.length,
    claims,
    slideTitles,
    urls,
    chars: typeof meta.chars === "number" ? meta.chars : rawText.length,
    truncated: Boolean(meta.truncated),
    warnings,
  };
}

function row(key: EchoRowKey, value: string | null, source: string | null): EchoRow {
  return {
    key,
    label: ROW_LABELS[key].label,
    value: value && value.trim() ? value : null,
    source: value && value.trim() ? source : null,
    hint: ROW_LABELS[key].hint,
  };
}

/** Plain-text rendering of the echo — what the agents are handed as ground truth. */
export function echoToPromptBlock(echo: InputEcho): string {
  const lines: string[] = [`Company: ${echo.companyKnown ? echo.company : "not provided"}`];
  for (const r of echo.rows) {
    if (r.key === "company") continue;
    lines.push(`${r.label}: ${r.value ?? "not provided"}${r.source ? ` (${r.source})` : ""}`);
  }
  if (echo.slideTitles.length) {
    lines.push(`Deck slides: ${echo.slideTitles.map((s) => `${s.n}. ${s.title}`).join(" | ")}`);
  }
  if (echo.claims.length) {
    lines.push("Claims with numbers:");
    for (const c of echo.claims) lines.push(`- ${c.text} (${c.source})`);
  }
  return lines.join("\n");
}

/** Convenience for callers holding a full IntakeResult. */
export function echoFromIntake(intake: IntakeResult, meta: EchoMeta = {}): InputEcho {
  return buildInputEcho(intake, meta);
}
