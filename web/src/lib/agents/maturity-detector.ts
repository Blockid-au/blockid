// Maturity / scale detector for SVI input.
//
// Why: when the founder pastes a URL like "stripe.com" or "atlassian.com" the
// SVI engine should NOT pretend it's a pre-seed startup. Until we have a
// connector that fetches actual financial data, we infer maturity from the
// scraped content (page title, description, body text, scripts/tech stack).
//
// Output is a maturity level + confidence + concrete evidence so the
// valuation engine can:
//   - widen the valuation band when the company is clearly post-Series-B
//   - downgrade confidence to "low" since URL scraping alone can't price a
//     unicorn
//   - flag the result so the dashboard shows "Established company detected —
//     valuation directional only"
//
// Deterministic, fast, no external API calls.

export type MaturityLevel = "idea" | "early" | "growth" | "scale" | "established";

export interface MaturitySignal {
  level: MaturityLevel;
  confidence: "low" | "medium" | "high";
  isEstablished: boolean;       // shortcut for "scale" or "established"
  evidence: string[];           // 1-5 reasons surfaced to the user
  inferredFoundingYear?: number;
  inferredEmployeeCount?: number;
  publicTickerHints?: string[]; // detected ticker symbols (STR, ATLN, etc.)
  unicornHints?: string[];      // mentions of $1B+ valuation, IPO, billions
}

// ─── Patterns ────────────────────────────────────────────────────────────────

// Year detection — copyright + founding-year hints
const YEAR_RE = /\b(?:©|copyright)\s*(?:19|20)(\d{2})\b/i;
const FOUNDED_RE = /\b(?:founded|established|since|est\.?)\s+(?:in\s+)?(?:19|20)(\d{2})\b/i;

// Employee count signals
const EMPLOYEE_PATTERNS: Array<{ re: RegExp; min: number }> = [
  { re: /\b(\d{1,3}(?:,\d{3})*\+?)\s*(?:employees|staff|team\s+members)\b/i, min: 0 },
  { re: /\b(?:over|more than|in excess of)\s+([\d,]+)\s*(?:employees|staff|team)\b/i, min: 0 },
];

// Stage 5+ signals
const SCALE_KEYWORDS = [
  "ipo", "publicly traded", "publicly-listed", "asx:", "nasdaq:", "nyse:",
  "annual report", "shareholders", "earnings per share", "10-k", "10-q",
  "fortune 500", "fortune 100", "global headquarters",
];

const ESTABLISHED_KEYWORDS = [
  "trusted by millions", "trusted by thousands of businesses",
  "world's leading", "global leader", "industry leader",
  "billion dollars", "billions in transactions", "unicorn",
  "series c", "series d", "series e", "series f",
  "decacorn", "$1 billion", "$10 billion", "$100 billion",
];

// Funding-stage signals
const FUNDED_KEYWORDS: Record<MaturityLevel, RegExp[]> = {
  idea: [],
  early: [/\b(beta|coming soon|early access|waitlist|launching soon|alpha\s+version)\b/i],
  growth: [/\bseries\s*[ab]\b/i, /\b(raised|closed)\s+\$\d+\s*(?:m|million)\b/i],
  scale: [/\bseries\s*[cdef]\b/i, /\bvaluation\s+(?:of\s+)?\$\d+\s*(?:m|million|b|billion)\b/i],
  established: [/\b(ipo|publicly\s+traded|stock\s+exchange|asx|nasdaq|nyse)\b/i, /\bfortune\s+(?:500|100|1000)\b/i],
};

// Well-known sites — quick allow-list (avoids overfitting on regex)
const WELLKNOWN_ESTABLISHED = [
  "stripe.com", "google.com", "amazon.com", "microsoft.com", "apple.com",
  "meta.com", "facebook.com", "linkedin.com", "atlassian.com", "salesforce.com",
  "shopify.com", "twilio.com", "uber.com", "airbnb.com", "netflix.com",
  "spotify.com", "slack.com", "zoom.us", "dropbox.com", "github.com",
  "canva.com", "afterpay.com", "xero.com", "wisetech.com", "block.xyz",
  "cba.com.au", "anz.com.au", "westpac.com.au", "telstra.com.au",
];

// ─── Extractors ──────────────────────────────────────────────────────────────

function extractYearFromText(text: string): number | undefined {
  const founded = text.match(FOUNDED_RE);
  if (founded) {
    const year = parseInt(`20${founded[1]}`.length === 4 ? `20${founded[1]}` : `19${founded[1]}`);
    if (year >= 1900 && year <= new Date().getFullYear()) return year;
  }
  const copyright = text.match(YEAR_RE);
  if (copyright) {
    const yy = parseInt(copyright[1]);
    return yy >= 50 ? 1900 + yy : 2000 + yy;
  }
  return undefined;
}

function extractEmployeeCount(text: string): number | undefined {
  for (const pat of EMPLOYEE_PATTERNS) {
    const m = text.match(pat.re);
    if (m) {
      const n = parseInt(m[1].replace(/,/g, ""));
      if (!isNaN(n) && n > 0) return n;
    }
  }
  return undefined;
}

function detectPublicTickers(text: string): string[] {
  const tickers: Set<string> = new Set();
  const tickerRe = /\b(ASX|NASDAQ|NYSE|TSE|LSE):\s*([A-Z]{1,5})\b/g;
  let match: RegExpExecArray | null;
  while ((match = tickerRe.exec(text)) != null) {
    tickers.add(`${match[1]}:${match[2]}`);
  }
  return Array.from(tickers).slice(0, 4);
}

function detectUnicornHints(text: string): string[] {
  const hints: string[] = [];
  if (/\$(\d{1,3})\s*billion/i.test(text)) {
    const m = text.match(/\$(\d{1,3})\s*billion/i);
    if (m) hints.push(`$${m[1]}B mention`);
  }
  if (/unicorn/i.test(text)) hints.push("'unicorn' label");
  if (/decacorn/i.test(text)) hints.push("'decacorn' label");
  if (/\bvaluation of \$(\d+(?:\.\d+)?)\s*(?:b|billion)/i.test(text)) hints.push("billion-dollar valuation");
  if (/\bipo\b/i.test(text)) hints.push("IPO mention");
  return hints.slice(0, 3);
}

function isWellKnownDomain(url: string | undefined): string | null {
  if (!url) return null;
  const lower = url.toLowerCase();
  for (const host of WELLKNOWN_ESTABLISHED) {
    if (lower.includes(host)) return host;
  }
  return null;
}

// ─── Main detector ───────────────────────────────────────────────────────────

export interface MaturityInput {
  url?: string;
  scrapedTitle?: string;
  scrapedDescription?: string;
  scrapedText?: string;
  rawText: string;
}

export function detectMaturity(input: MaturityInput): MaturitySignal {
  const evidence: string[] = [];
  const corpus = [input.rawText, input.scrapedTitle, input.scrapedDescription, input.scrapedText]
    .filter(Boolean)
    .join(" ");

  // 1. Well-known domain shortcut
  const wellKnown = isWellKnownDomain(input.url ?? (corpus.match(/https?:\/\/\S+/)?.[0]));
  if (wellKnown) {
    evidence.push(`Domain ${wellKnown} is a well-known established company`);
    return {
      level: "established",
      confidence: "high",
      isEstablished: true,
      evidence,
      publicTickerHints: detectPublicTickers(corpus),
      unicornHints: detectUnicornHints(corpus),
    };
  }

  // 2. Public ticker symbols
  const tickers = detectPublicTickers(corpus);
  if (tickers.length > 0) {
    evidence.push(`Public ticker(s) detected: ${tickers.join(", ")}`);
  }

  // 3. Unicorn / IPO signals
  const unicornHints = detectUnicornHints(corpus);
  if (unicornHints.length > 0) {
    evidence.push(`Scale signals: ${unicornHints.join(", ")}`);
  }

  // 4. Founding year
  const foundingYear = extractYearFromText(corpus);
  const companyAge = foundingYear ? new Date().getFullYear() - foundingYear : undefined;
  if (foundingYear && companyAge != null) {
    evidence.push(`Founded ${foundingYear} (${companyAge} years old)`);
  }

  // 5. Employee count
  const employeeCount = extractEmployeeCount(corpus);
  if (employeeCount != null) {
    evidence.push(`Employee count signal: ${employeeCount.toLocaleString()}+`);
  }

  // 6. Keyword scan
  const lower = corpus.toLowerCase();
  let scaleHits = 0;
  for (const kw of SCALE_KEYWORDS) if (lower.includes(kw)) scaleHits++;
  let establishedHits = 0;
  for (const kw of ESTABLISHED_KEYWORDS) if (lower.includes(kw)) establishedHits++;

  // ── Decision tree ────────────────────────────────────────────────────────
  let level: MaturityLevel = "early";
  let confidence: MaturitySignal["confidence"] = "medium";

  if (tickers.length > 0 || establishedHits >= 2 || (foundingYear && companyAge && companyAge >= 20)) {
    level = "established";
    confidence = "high";
    evidence.unshift("Multiple established-company markers detected");
  } else if (
    scaleHits >= 1 ||
    establishedHits >= 1 ||
    unicornHints.length >= 2 ||
    (employeeCount && employeeCount >= 500) ||
    (companyAge && companyAge >= 10)
  ) {
    level = "scale";
    confidence = scaleHits + establishedHits >= 2 ? "high" : "medium";
    evidence.unshift("Late-stage / scale-up signals present");
  } else if (
    FUNDED_KEYWORDS.growth.some((re) => re.test(lower)) ||
    (employeeCount && employeeCount >= 50) ||
    (companyAge && companyAge >= 5)
  ) {
    level = "growth";
    confidence = "medium";
    evidence.unshift("Growth-stage funding/scale signals detected");
  } else if (
    FUNDED_KEYWORDS.early.some((re) => re.test(lower)) ||
    /\b(waitlist|beta|coming soon|early access)\b/i.test(lower)
  ) {
    level = "early";
    confidence = "medium";
    evidence.unshift("Pre-launch / early-access signals");
  } else if (/\b(idea|concept|prototype|just\s+started)\b/i.test(lower) || input.rawText.length < 200) {
    level = "idea";
    confidence = "low";
    evidence.unshift("Idea-stage signals (or very short input)");
  } else {
    // Default
    evidence.unshift("Default: early-stage signals — no scale markers detected");
  }

  return {
    level,
    confidence,
    isEstablished: level === "established" || level === "scale",
    evidence: evidence.slice(0, 5),
    inferredFoundingYear: foundingYear,
    inferredEmployeeCount: employeeCount,
    publicTickerHints: tickers.length > 0 ? tickers : undefined,
    unicornHints: unicornHints.length > 0 ? unicornHints : undefined,
  };
}

// ─── Valuation calibration helpers ───────────────────────────────────────────

/**
 * Returns a recommended valuation override band when the maturity signal
 * is established/scale, so the deep-valuation engine can warn the user
 * that pricing this company from scraping alone is unreliable.
 */
export function maturityValuationGuard(signal: MaturitySignal): {
  override: boolean;
  reason?: string;
  confidenceOverride?: "low";
} {
  if (signal.level === "established") {
    return {
      override: true,
      reason: "Established company detected — the SVI engine prices early-stage startups from scraping. For accurate pricing of a public/well-known company, connect Stripe/Xero/Crunchbase data.",
      confidenceOverride: "low",
    };
  }
  if (signal.level === "scale") {
    return {
      override: true,
      reason: "Late-stage scale-up signals — valuation is directional. Connect financial data sources for accurate pricing.",
      confidenceOverride: "low",
    };
  }
  return { override: false };
}
