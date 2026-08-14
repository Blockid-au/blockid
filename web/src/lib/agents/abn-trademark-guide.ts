/**
 * src/lib/agents/abn-trademark-guide.ts
 *
 * Generates the "ABN + trademark guide" deliverable for the Startup Package
 * (Phase 3.1). Combines:
 *   - Deterministic ABR + IP-Australia walk-through content (numbered steps
 *     with deep links to abr.gov.au, asic.gov.au business-names, and
 *     search.ipaustralia.gov.au).
 *   - Optional live ABR lookup (via `lookupAbnLive`) when a candidate ABN is
 *     provided in the input — the guide surfaces the entity name / status.
 *   - LLM-authored `strategicRecommendations` and sector-specific
 *     `commonPitfalls` via `callAI()`; falls back to a deterministic template
 *     on parse/LLM failure so the PDF always renders.
 *
 * The IP-Australia public search endpoint is not a documented API — the guide
 * therefore always instructs the founder to run the search manually and
 * surfaces the direct search URL + Nice class recommendations for SaaS.
 *
 * Roadmap: Phase 3.1 — "ABN + trademark guide report (PDF generator +
 * IP Australia / ABR affiliate links; 1 credit/report)".
 */

import { callAI } from "@/lib/ai-client";
import {
  lookupAbnLive,
  normalizeAbn,
  validateAbnChecksum,
  type AbnLiveDetails,
} from "@/lib/compliance/abn";

// ── Types ────────────────────────────────────────────────────────────────

export interface AbnTrademarkGuideInput {
  /** Registered / trading startup name — used on the cover + search prompts. */
  startupName: string;
  /** Proposed trading name to test for availability (may equal startupName). */
  proposedTradingName?: string;
  /** Sector / industry — drives the class-recommendation + pitfalls prompts. */
  sector?: string;
  /** One-paragraph startup description — extra context for the LLM. */
  description?: string;
  /**
   * Optional 11-digit ABN candidate. If supplied AND checksum-valid, the
   * agent will call `lookupAbnLive` and surface entity name/status in the
   * guide's ABN section.
   */
  abnCandidate?: string;
}

export interface NiceClassRecommendation {
  /** Nice class number (e.g. 9, 35, 41, 42). */
  classNumber: number;
  /** Short human title. */
  title: string;
  /** Why this class matters for the founder's sector. */
  rationale: string;
  /** Priority marker rendered as a badge. */
  priority: "recommended" | "consider" | "optional";
}

export interface AbnStep {
  title: string;
  detail: string;
  /** Deep link (may be empty when the step is entirely offline). */
  url?: string;
}

export interface FilingTimelineRow {
  path: "headstart" | "standard";
  label: string;
  costPerClassAud: number;
  timeframeWeeks: string;
  note: string;
}

export interface AbnTrademarkGuideOutput {
  startupName: string;
  proposedTradingName: string;
  sector: string;
  reportDateIso: string;
  /** Live ABR lookup result, if the caller provided a valid-checksum ABN. */
  abnLookup: {
    checked: boolean;
    valid_checksum: boolean;
    live: AbnLiveDetails | null;
    live_error: string | null;
  } | null;
  /** IP Australia public search prefill URL (never a live API result). */
  trademarkSearchUrl: string;
  abnSteps: AbnStep[];
  businessNameSteps: AbnStep[];
  niceClasses: NiceClassRecommendation[];
  timeline: FilingTimelineRow[];
  strategicRecommendations: string[];
  commonPitfalls: string[];
  nextActions: string[];
  /** Canonical source links that appear in the PDF footer / sources page. */
  sources: string[];
}

// ── Deterministic content ────────────────────────────────────────────────

const ABN_STEPS: AbnStep[] = [
  {
    title: "Confirm you are entitled to an ABN",
    detail:
      "You must be carrying on an enterprise in Australia. Sole traders, partnerships, companies and trusts all qualify; a hobby project does not.",
    url: "https://abr.gov.au/For-Business,-Super-funds---Charities/Applying-for-an-ABN/ABN-entitlement/",
  },
  {
    title: "Register (or confirm) your ACN if incorporating",
    detail:
      "If you are trading through a Pty Ltd company, register the company with ASIC first — the resulting ACN is required on the ABN application.",
    url: "https://asic.gov.au/for-business/registering-a-company/",
  },
  {
    title: "Apply for the ABN via the Australian Business Register",
    detail:
      "Complete the ABR online application (approx. 20 minutes). Have your TFN, ACN, and business activity description ready.",
    url: "https://abr.gov.au/",
  },
  {
    title: "Record the ABN + issue-date in your data room",
    detail:
      "Upload the ABN confirmation letter to your BlockID.au data room under Legal & Compliance so investors can verify status in one click.",
  },
  {
    title: "Register for GST if you expect > A$75k turnover",
    detail:
      "GST registration is mandatory once your projected annual turnover exceeds A$75,000. Register through the ABR portal at the same time as your ABN if you already know you'll cross the threshold.",
    url: "https://www.ato.gov.au/business/gst/registering-for-gst/",
  },
];

const BUSINESS_NAME_STEPS: AbnStep[] = [
  {
    title: "Search the ASIC Business Names Register",
    detail:
      "Confirm your proposed trading name is available and not identical or near-identical to an existing registered name.",
    url: "https://connectonline.asic.gov.au/RegistrySearch/faces/landing/SearchRegisters.jspx",
  },
  {
    title: "Register the business name via ASIC Connect",
    detail:
      "1-year (A$44) or 3-year (A$102) options. 3-year is cheaper per year and reduces renewal risk — recommended for pre-trademark founders.",
    url: "https://asic.gov.au/for-business/registering-a-business-name/",
  },
  {
    title: "Link the business name to your ABN",
    detail:
      "Registration will not complete without a valid ABN. Keep the ASIC confirmation email alongside the ABN letter in your data room.",
  },
];

/** Nice classes most commonly relevant to Australian SaaS + tech founders. */
const NICE_CLASS_LIBRARY: NiceClassRecommendation[] = [
  {
    classNumber: 9,
    title: "Downloadable software & SaaS platforms",
    rationale:
      "Covers your app, downloadable mobile/desktop clients, and computer programs distributed via any channel. Required for anything shipping a compiled artefact.",
    priority: "recommended",
  },
  {
    classNumber: 42,
    title: "SaaS, hosting, and software design services",
    rationale:
      "Covers 'software as a service (SaaS)', platform-as-a-service, and technical consulting. This is the primary class for a subscription web product.",
    priority: "recommended",
  },
  {
    classNumber: 35,
    title: "Business, advertising & marketplace services",
    rationale:
      "Needed if you facilitate transactions between third parties, run advertising, or provide business-intelligence dashboards. Common for two-sided platforms.",
    priority: "consider",
  },
  {
    classNumber: 41,
    title: "Education & training services",
    rationale:
      "Add if you plan to publish courses, run webinars, host a certification program, or ship a paid community/education product.",
    priority: "optional",
  },
];

const TIMELINE_ROWS: FilingTimelineRow[] = [
  {
    path: "headstart",
    label: "TM Headstart (pre-application assessment)",
    costPerClassAud: 80,
    timeframeWeeks: "5 business days for the initial report",
    note: "Cheapest way to sanity-check availability before committing to the full filing fee. Non-refundable but converts to a filing with credit applied.",
  },
  {
    path: "standard",
    label: "Standard trade mark application (per class)",
    costPerClassAud: 400,
    timeframeWeeks: "7–8 months to registration if unopposed",
    note: "IP Australia headline fee is A$250 per class when filed via 'Pick List'; A$400 per class when filed with a custom specification. Add A$250/class on filing if opposition is lodged.",
  },
];

const DEFAULT_PITFALLS: string[] = [
  "Choosing a generic or descriptive mark (e.g. 'Cloud Analytics') that IP Australia will refuse under Section 41.",
  "Registering only in Class 9 (software) and missing Class 42 (SaaS services) — most modern platforms need both.",
  "Ignoring prior art in the phonetic space — 'Klue' vs 'Clue' will almost certainly draw opposition.",
  "Failing to secure the .com.au domain and matching social handles before publicising the mark.",
  "Assuming an ASIC business-name registration confers trade-mark rights — it does not.",
];

const DEFAULT_STRATEGIC_RECS: string[] = [
  "File a TM Headstart request first so you get a professional class + registrability opinion for A$80/class before committing.",
  "Bundle Class 9 + Class 42 in the same application — most examiners accept them together at the reduced Pick List rate.",
  "Register the .com.au domain the same day you file so squatters can't front-run a public announcement.",
  "Add a diary reminder for the 10-year renewal (and the 7-year 'use it or lose it' non-use vulnerability window).",
];

const DEFAULT_NEXT_ACTIONS: string[] = [
  "Run the free IP Australia trade-mark search for your proposed name.",
  "File a TM Headstart request in Classes 9 + 42 (A$160 total).",
  "Register the matching .com.au domain and secure social handles.",
  "Upload the ABN confirmation + ASIC business-name receipt to your BlockID.au data room.",
  "Add a 90-day check-in to review the Headstart report and decide on full filing.",
];

const SOURCES: string[] = [
  "Australian Business Register — https://abr.gov.au/",
  "ASIC Business Names — https://asic.gov.au/for-business/registering-a-business-name/",
  "IP Australia trade mark search — https://search.ipaustralia.gov.au/trademarks/search/quick",
  "IP Australia fee schedule — https://www.ipaustralia.gov.au/trade-marks/how-much-does-it-cost",
  "ATO GST registration — https://www.ato.gov.au/business/gst/registering-for-gst/",
];

// ── Helpers ──────────────────────────────────────────────────────────────

const SYSTEM_PROMPT =
  "You are an Australian intellectual-property analyst helping a founder file an ABN and trade mark. Respond with valid JSON only, no markdown code fences.";

function tryParseJSON<T>(raw: string): T | null {
  if (!raw) return null;
  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {
    const m = stripped.match(/[\[{][\s\S]*[\]}]/);
    if (!m) return null;
    try {
      return JSON.parse(m[0]) as T;
    } catch {
      return null;
    }
  }
}

function buildTrademarkSearchUrl(name: string): string {
  // IP Australia's public quick-search accepts a `s=` param; we prefix
  // https:// and let the URL API normalise the query string.
  const base = "https://search.ipaustralia.gov.au/trademarks/search/quick";
  const q = new URLSearchParams({ s: name.trim() });
  return `${base}?${q.toString()}`;
}

function niceClassesForSector(sector: string): NiceClassRecommendation[] {
  const s = sector.toLowerCase();
  const rows = NICE_CLASS_LIBRARY.map((r) => ({ ...r }));
  // Bump education-adjacent sectors' Class 41 to 'recommended'.
  if (s.includes("edtech") || s.includes("education") || s.includes("training")) {
    for (const r of rows) if (r.classNumber === 41) r.priority = "recommended";
  }
  // Marketplace / two-sided → Class 35 becomes 'recommended'.
  if (s.includes("marketplace") || s.includes("platform") || s.includes("two-sided")) {
    for (const r of rows) if (r.classNumber === 35) r.priority = "recommended";
  }
  return rows;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Generate the ABN + trademark guide payload for the Startup Package
 * deliverable. Never throws — always returns a renderable structure so the
 * PDF pipeline can proceed even if the LLM providers are cold.
 */
export async function generateAbnTrademarkGuide(
  input: AbnTrademarkGuideInput,
): Promise<AbnTrademarkGuideOutput> {
  const startupName = input.startupName?.trim() || "Your Startup";
  const proposedTradingName =
    (input.proposedTradingName ?? "").trim() || startupName;
  const sector = (input.sector ?? "SaaS").trim() || "SaaS";
  const reportDateIso = new Date().toISOString().slice(0, 10);

  // ── ABR lookup (optional) ───────────────────────────────────────────
  let abnLookup: AbnTrademarkGuideOutput["abnLookup"] = null;
  const abn = normalizeAbn(input.abnCandidate);
  if (abn) {
    const validChecksum = validateAbnChecksum(abn);
    if (!validChecksum) {
      abnLookup = {
        checked: true,
        valid_checksum: false,
        live: null,
        live_error: "checksum failed — ABR call skipped",
      };
    } else {
      try {
        const { live, live_error } = await lookupAbnLive(abn);
        abnLookup = {
          checked: true,
          valid_checksum: true,
          live,
          live_error,
        };
      } catch (err) {
        abnLookup = {
          checked: true,
          valid_checksum: true,
          live: null,
          live_error: err instanceof Error ? err.message : "abr_lookup_failed",
        };
      }
    }
  }

  // ── LLM sections ────────────────────────────────────────────────────
  let strategicRecommendations = DEFAULT_STRATEGIC_RECS;
  let commonPitfalls = DEFAULT_PITFALLS;

  const user =
    `Startup: ${startupName}\n` +
    `Proposed trading name: ${proposedTradingName}\n` +
    `Sector: ${sector}\n` +
    (input.description ? `Description: ${input.description}\n` : "") +
    `\nReturn a JSON object with keys:\n` +
    `- strategicRecommendations (array of 4-6 short strings; concrete IP filing recommendations tailored to the sector)\n` +
    `- commonPitfalls (array of 4-6 short strings; sector-specific trademark filing pitfalls — generic descriptors, prior art, phonetic conflicts, Nice class mismatches).\n` +
    `Ground everything in Australian trade-mark practice (IP Australia). JSON only.`;

  try {
    const result = await callAI({
      system: SYSTEM_PROMPT,
      user,
      maxTokens: 1200,
      temperature: 0.4,
    });
    const parsed = tryParseJSON<{
      strategicRecommendations?: unknown;
      commonPitfalls?: unknown;
    }>(result.text);
    if (parsed) {
      if (Array.isArray(parsed.strategicRecommendations)) {
        const recs = parsed.strategicRecommendations.filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        );
        if (recs.length > 0) strategicRecommendations = recs;
      }
      if (Array.isArray(parsed.commonPitfalls)) {
        const pit = parsed.commonPitfalls.filter(
          (s): s is string => typeof s === "string" && s.trim().length > 0,
        );
        if (pit.length > 0) commonPitfalls = pit;
      }
    }
  } catch {
    // Silent fallback — defaults already applied.
  }

  return {
    startupName,
    proposedTradingName,
    sector,
    reportDateIso,
    abnLookup,
    trademarkSearchUrl: buildTrademarkSearchUrl(proposedTradingName),
    abnSteps: ABN_STEPS,
    businessNameSteps: BUSINESS_NAME_STEPS,
    niceClasses: niceClassesForSector(sector),
    timeline: TIMELINE_ROWS,
    strategicRecommendations,
    commonPitfalls,
    nextActions: DEFAULT_NEXT_ACTIONS,
    sources: SOURCES,
  };
}
