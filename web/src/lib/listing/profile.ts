// Listing profile facts (S29-A) — the founder-ticked inputs behind the
// listing readiness checker that no stored record can supply: audited
// financial years, board composition, committee dates, market makers,
// balance-sheet figures and the AUD→USD rate used for the Nasdaq rows.
//
// Stored as one jsonb `facts` column on `listing_profiles` (migration
// 0379, 1:1 with projects). Every key is optional; `parseListingFactsPatch`
// accepts a partial object, validates each supplied key and lets a key be
// cleared with `null`. Unknown keys are rejected so a typo never sits in
// the row unnoticed.
//
// Pure — no I/O — so the route, the page and the readiness builder share
// one definition of "what the founder can tell us".

export const LISTING_DATE_KEYS = [
  /** Date the founder confirmed the audited accounts listed in `audited_accounts_fys`. */
  "audited_accounts_confirmed_at",
  /** Date the constitution was reviewed against ASX LR 15.11 (or amended). */
  "constitution_reviewed_at",
  /** Date the corporate governance statement (LR 1.1 condition 13) was prepared. */
  "governance_statement_at",
  /** Date the founder acknowledged the escrow (restricted securities) expectations for an assets-test entity. */
  "escrow_acknowledged_at",
  /** Date the audit committee was established. */
  "audit_committee_at",
  /** Date the code of conduct was adopted. */
  "code_of_conduct_at",
  /** Date director good-fame-and-character checks were completed. */
  "director_checks_at",
  /** Date the founder confirmed the balance-sheet figures below. */
  "balance_sheet_confirmed_at",
] as const;

export const LISTING_INT_KEYS = [
  /** Directors on the board. */
  "directors_total",
  /** Independent directors on the board. */
  "independent_directors",
  /** Independent members of the audit committee. */
  "audit_committee_independent_members",
  /** Registered market makers committed to quote the security (Nasdaq). */
  "market_makers",
] as const;

export const LISTING_MONEY_KEYS = [
  /** Net tangible assets after deducting the costs of the raise, A$. */
  "nta_after_raise_aud",
  /** Working capital at admission, A$. */
  "working_capital_aud",
  /** Stockholders' equity, A$ (Nasdaq standards). */
  "stockholders_equity_aud",
  /** Expected market capitalisation at listing, A$ (overrides price × shares when set). */
  "expected_market_cap_aud",
  /** Proposed issue / listing price per share, A$. */
  "proposed_issue_price_aud",
  /** AUD → USD rate used for the Nasdaq rows (1 AUD = x USD). */
  "aud_usd_rate",
] as const;

export type ListingDateKey = (typeof LISTING_DATE_KEYS)[number];
export type ListingIntKey = (typeof LISTING_INT_KEYS)[number];
export type ListingMoneyKey = (typeof LISTING_MONEY_KEYS)[number];

export interface ListingFyProfit {
  /** "FY2026" style label. */
  fy: string;
  /** Profit from continuing operations for that financial year, A$ (may be negative). */
  profit_aud: number;
}

export type ListingProfileFacts = Partial<Record<ListingDateKey, string>> &
  Partial<Record<ListingIntKey, number>> &
  Partial<Record<ListingMoneyKey, number>> & {
    /** Financial years with audited accounts on file, e.g. ["FY2024", "FY2025", "FY2026"]. */
    audited_accounts_fys?: string[];
    /** Profit from continuing operations per financial year (profit test inputs). */
    profit_by_fy?: ListingFyProfit[];
    /** Cap-table shareholder ids treated as affiliated / restricted beyond the role rule (directors, related parties, escrowed). */
    restricted_holder_ids?: string[];
    /** Which ASX admission test the founder is targeting; absent = assess both. */
    asx_test?: "profit" | "assets";
  };

export const LISTING_FACT_KEYS: readonly string[] = [
  ...LISTING_DATE_KEYS,
  ...LISTING_INT_KEYS,
  ...LISTING_MONEY_KEYS,
  "audited_accounts_fys",
  "profit_by_fy",
  "restricted_holder_ids",
  "asx_test",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FY_RE = /^FY\d{4}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

export type FactsPatchResult =
  | { ok: true; patch: Record<string, unknown>; cleared: string[] }
  | { ok: false; error: string };

/**
 * Validate a partial facts object. Returns the keys to merge (`patch`) and
 * the keys to remove (`cleared`, sent as `null`). Rejects unknown keys and
 * any value of the wrong shape with a field-level message.
 */
export function parseListingFactsPatch(body: unknown): FactsPatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, error: "facts must be an object" };
  const patch: Record<string, unknown> = {};
  const cleared: string[] = [];
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (!LISTING_FACT_KEYS.includes(key)) return { ok: false, error: `unknown fact: ${key}` };
    if (value === null) {
      cleared.push(key);
      continue;
    }
    if ((LISTING_DATE_KEYS as readonly string[]).includes(key)) {
      if (!isIsoDate(value)) return { ok: false, error: `${key} must be a YYYY-MM-DD date` };
      patch[key] = value;
      continue;
    }
    if ((LISTING_INT_KEYS as readonly string[]).includes(key)) {
      if (!isFiniteNumber(value) || !Number.isInteger(value) || value < 0 || value > 10_000) return { ok: false, error: `${key} must be a whole number between 0 and 10,000` };
      patch[key] = value;
      continue;
    }
    if ((LISTING_MONEY_KEYS as readonly string[]).includes(key)) {
      if (!isFiniteNumber(value) || value < 0 || value > 1e13) return { ok: false, error: `${key} must be a non-negative number` };
      if (key === "aud_usd_rate" && (value <= 0 || value > 10)) return { ok: false, error: "aud_usd_rate must be between 0 and 10" };
      patch[key] = value;
      continue;
    }
    if (key === "audited_accounts_fys") {
      if (!Array.isArray(value) || value.length > 10 || !value.every((fy) => typeof fy === "string" && FY_RE.test(fy))) {
        return { ok: false, error: "audited_accounts_fys must be a list of FYyyyy labels (max 10)" };
      }
      patch[key] = Array.from(new Set(value as string[])).sort();
      continue;
    }
    if (key === "profit_by_fy") {
      if (!Array.isArray(value) || value.length > 10) return { ok: false, error: "profit_by_fy must be a list (max 10)" };
      const rows: ListingFyProfit[] = [];
      const seen = new Set<string>();
      for (const row of value as unknown[]) {
        const r = row as { fy?: unknown; profit_aud?: unknown } | null;
        if (!r || typeof r !== "object" || typeof r.fy !== "string" || !FY_RE.test(r.fy) || !isFiniteNumber(r.profit_aud) || Math.abs(r.profit_aud) > 1e13) {
          return { ok: false, error: "profit_by_fy rows need { fy: 'FYyyyy', profit_aud: number }" };
        }
        if (seen.has(r.fy)) return { ok: false, error: `profit_by_fy lists ${r.fy} twice` };
        seen.add(r.fy);
        rows.push({ fy: r.fy, profit_aud: r.profit_aud });
      }
      patch[key] = rows.sort((a, b) => a.fy.localeCompare(b.fy));
      continue;
    }
    if (key === "restricted_holder_ids") {
      if (!Array.isArray(value) || value.length > 500 || !value.every((id) => typeof id === "string" && UUID_RE.test(id))) {
        return { ok: false, error: "restricted_holder_ids must be a list of shareholder ids" };
      }
      patch[key] = Array.from(new Set(value as string[]));
      continue;
    }
    if (key === "asx_test") {
      if (value !== "profit" && value !== "assets") return { ok: false, error: "asx_test must be 'profit' or 'assets'" };
      patch[key] = value;
      continue;
    }
  }
  return { ok: true, patch, cleared };
}

/** Coerce a stored jsonb blob into typed facts — anything malformed is dropped, never thrown. */
export function normaliseListingFacts(raw: unknown): ListingProfileFacts {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!LISTING_FACT_KEYS.includes(k) || v === null) continue;
    const one = parseListingFactsPatch({ [k]: v });
    if (one.ok && k in one.patch) out[k] = one.patch[k];
  }
  return out as ListingProfileFacts;
}

/** Merge a validated patch into stored facts (cleared keys removed). */
export function applyListingFactsPatch(current: ListingProfileFacts, patch: Record<string, unknown>, cleared: string[]): ListingProfileFacts {
  const next: Record<string, unknown> = { ...current, ...patch };
  for (const k of cleared) delete next[k];
  return next as ListingProfileFacts;
}
