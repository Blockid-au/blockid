// SEO builders for the funding surfaces (S8-A audit, 2026-09-11).
//
// One primary AU keyword per page type, one title template per page type,
// and a description composer that always lands in the 140–160 window — so
// the 53 grant + 199 program detail pages get unique, keyword-bearing
// `<title>`s (name + state / city) instead of "name — A$ range · BlockID.au",
// and never a description shorter than the row's one-line `summary`.
//
// Pure (no I/O) — colocated tests in seo.test.ts run every builder over the
// real seed files and assert length + uniqueness across all 255 pages.

import type { AuGrantRow, AuProgramRow, AuState, Capital, FundingStatus } from "./seed-map";
import { AU_STATES, CAPITAL_SATELLITES } from "./seed-map";
import {
  capitalDisplayName,
  capitalSlug,
  formatAudCompact,
  formatAudRange,
  formatLooseDate,
  levelLabel,
  programTypeLabel,
  stateLabel,
  type GrantFilters,
} from "./directory";
import { fitDescription, fitTitle, fitTitleKeepTail, SITE_URL, TITLE_MAX } from "@/lib/seo/page-meta";

// ─── Keyword map (one primary keyword per page type) ─────────────────────────

export const FUNDING_KEYWORDS = {
  landing: "startup funding australia",
  grants: "startup grants australia",
  grantsState: (state: string) => `${stateSeoName(state)} startup grants`,
  grant: "startup grant",
  rdti: "r&d tax incentive startup",
  esic: "esic",
  programs: "startup accelerators australia",
  capital: (capital: Capital) => `accelerator programs ${capital === "Remote" ? "online australia" : capital.toLowerCase()}`,
  capitalIncubator: (capital: Capital) => `startup incubator ${capital === "Remote" ? "online" : capital.toLowerCase()}`,
  program: (capital: Capital) => `accelerator ${capital === "Remote" ? "online" : capital.toLowerCase()}`,
  demo: "startup funding report sample",
} as const;

// ─── Names ───────────────────────────────────────────────────────────────────

/** How each state reads in a title: full name where it is short, code where the full name is not. */
const STATE_SEO_NAMES: Readonly<Record<string, string>> = {
  national: "Federal",
  NSW: "NSW",
  VIC: "Victoria",
  QLD: "Queensland",
  WA: "WA",
  SA: "South Australia",
  TAS: "Tasmania",
  ACT: "ACT",
  NT: "NT",
};

export function stateSeoName(state: string): string {
  return STATE_SEO_NAMES[state] ?? stateLabel(state);
}

/** "grant" / "tax incentive" / "startup loan" — the noun a searcher types for this funding type. */
const FUNDING_TYPE_NOUNS: Readonly<Record<string, string>> = {
  grant: "startup grant",
  matched_grant: "matched grant",
  voucher: "startup voucher",
  rebate: "rebate",
  tax_offset_refundable: "tax incentive",
  tax_offset_nonrefundable: "tax incentive",
  tax_deduction: "tax deduction",
  loan_concessional: "startup loan",
  loan_unsecured: "startup loan",
  equity: "co-investment",
  co_investment: "co-investment",
  accelerator: "accelerator",
  competition_showcase: "startup competition",
  advisory_service: "advisory service",
  wage_subsidy: "wage subsidy",
  procurement_access: "procurement program",
};

export function fundingTypeNoun(t: string): string {
  return FUNDING_TYPE_NOUNS[t] ?? "startup grant";
}

/** "accelerator program" / "startup incubator" — the searcher's noun for a program type. */
const PROGRAM_TYPE_NOUNS: Readonly<Record<string, string>> = {
  accelerator: "accelerator program",
  pre_accelerator: "pre-accelerator",
  incubator: "startup incubator",
  university: "university program",
  competition: "startup competition",
  community: "founder community",
  corporate: "corporate program",
  angel_group: "angel investor group",
  event: "startup event",
  government: "government program",
  vc: "venture capital fund",
  rd_advance_loan: "R&D advance loan",
  advisory: "advisory service",
};

export function programTypeNoun(t: string): string {
  return PROGRAM_TYPE_NOUNS[t] ?? programTypeLabel(t).toLowerCase();
}

function statusSentence(status: FundingStatus, closes: string | null | undefined): string {
  switch (status) {
    case "open":
      return closes ? `Open now, closes ${formatLooseDate(closes)}` : "Open now";
    case "upcoming":
      return "Next round upcoming";
    case "paused":
      return "Currently paused";
    case "closed":
      return "Closed";
  }
}

// ─── Grants ──────────────────────────────────────────────────────────────────

const STATE_PAREN = /\s*\((?:NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\)\s*$/;
const ACRONYM_HEAD = /^(.*?\([A-Z&]{2,8}\))\s+\S.*$/;

/**
 * Shorten a row name for a title budget without an ellipsis where a rule
 * can do it losslessly: drop a trailing "(QLD)" that the tail restates,
 * "Research and Development" → "R&D", " and " → " & ", keep the head up to
 * an acronym ("Early Stage Innovation Company (ESIC)"), then drop a trailing
 * parenthetical. Only when all of that still overflows does the caller
 * truncate at a word boundary.
 */
export function compactName(name: string, budget: number): string {
  let n = name.replace(/\s+/g, " ").trim();
  if (n.length <= budget) return n;
  n = n.replace(STATE_PAREN, "");
  if (n.length <= budget) return n;
  n = n.replace(/Research and Development/gi, "R&D").replace(/ and /g, " & ");
  if (n.length <= budget) return n;
  const acronym = ACRONYM_HEAD.exec(n);
  if (acronym && acronym[1].length <= budget) return acronym[1];
  const noParen = n.replace(/\s*\([^)]*\)\s*$/, "");
  if (noParen.length >= 12 && noParen.length <= budget) return noParen;
  return n;
}

/**
 * First `${compactName}${tail}` that fits 60 characters, most descriptive
 * tail first; when none fits, the last tail with the name truncated.
 */
function cascade(rawName: string, tails: readonly string[]): string {
  for (const tail of tails) {
    const n = compactName(rawName, TITLE_MAX - tail.length);
    if (n.length + tail.length <= TITLE_MAX) return `${n}${tail}`;
  }
  const last = tails[tails.length - 1];
  return fitTitleKeepTail(compactName(rawName, TITLE_MAX - last.length), last);
}

/**
 * `${name} — ${state} ${noun}`, falling back to `${name} — ${state}` when the
 * full name would not fit, and only then truncating the name. Unique per
 * row (names are unique in the seed; the state tail keeps them apart).
 */
export function grantTitle(g: Pick<AuGrantRow, "name" | "state" | "funding_type">): string {
  const scope = g.state === "national" ? "Australia" : stateSeoName(g.state);
  return cascade(g.name, [` — ${scope} ${fundingTypeNoun(g.funding_type)}`, ` — ${scope}`]);
}

export function grantDescription(
  g: Pick<
    AuGrantRow,
    "name" | "state" | "funding_type" | "provider" | "level" | "amount_min_aud" | "amount_max_aud" | "amount_note" | "status" | "closes_at" | "summary"
  >,
): string {
  const who = g.state === "national" ? "Australian startups" : `${stateSeoName(g.state)} startups`;
  const range = formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note);
  const amount = /^(up to|from|A\$)/.test(range) ? `Funding: ${range}` : range;
  return fitDescription([
    `${g.name}: ${fundingTypeNoun(g.funding_type)} from ${g.provider ?? levelLabel(g.level)} for ${who}`,
    amount,
    statusSentence(g.status, g.closes_at),
    g.summary,
    "Eligibility gates, evidence needed, how to apply and the official link",
  ]);
}

export function grantPath(id: string): string {
  return `/funding/grants/${encodeURIComponent(id)}`;
}

/** `/funding/grants?state=NSW` — the state-scoped view that self-canonicalises (S8-A). */
export function grantsStatePath(state: string): string {
  return `/funding/grants?state=${encodeURIComponent(state)}`;
}

/**
 * `?state=NSW` on its own is a real landing page for "<state> startup
 * grants" — it self-canonicalises, gets its own title / H1 / description and
 * sits in the sitemap. Any other filter combination (type, stage, status, or
 * a state combined with those) is a view of the base page and canonicalises
 * back to /funding/grants so the index never fills with chip permutations.
 */
export function stateOnlyFilter(f: GrantFilters): AuState | null {
  if (!f.state || f.type || f.stage || f.status) return null;
  return (AU_STATES as readonly string[]).includes(f.state) ? (f.state as AuState) : null;
}

export const GRANTS_TITLE = fitTitle("Australian startup grants, open right now");
export const GRANTS_DESCRIPTION = fitDescription([
  "Every Australian government grant, voucher, tax offset and startup loan in one free list — federal, state and council",
  "Official links, A$ ranges, closing dates and stage tags",
  "Filter by state, funding type and stage",
]);

/** Title / H1 / description for the state-only filter of /funding/grants. */
export function grantsStateSeo(state: AuState): { title: string; h1: string; description: string } {
  const name = stateSeoName(state);
  if (state === "national") {
    return {
      title: fitTitle("Federal startup grants, open Australia-wide"),
      h1: "Federal startup grants, open Australia-wide",
      description: fitDescription([
        "Every federal grant, tax offset, voucher and startup loan an Australian startup can apply for from any state — one free list",
        "Official links, A$ ranges, closing dates and stage tags",
        "The analysis of your own eligibility is A$3",
      ]),
    };
  }
  const full = stateLabel(state);
  return {
    title: fitTitle(`${name} startup grants open right now`),
    h1: `${name} startup grants, open right now`,
    description: fitDescription([
      `Every ${full} startup grant, voucher and loan, plus the federal schemes ${name} companies can apply for — one free list`,
      "Official links, A$ ranges, closing dates and stage tags",
      "The eligibility analysis for your startup is A$3",
    ]),
  };
}

// ─── Programs ────────────────────────────────────────────────────────────────

export function programPath(capital: Capital, id: string): string {
  return `/funding/programs/${capitalSlug(capital)}/${encodeURIComponent(id)}`;
}

export function capitalPath(capital: Capital): string {
  return `/funding/programs/${capitalSlug(capital)}`;
}

/**
 * `${name} — ${noun} in ${city}, ${STATE}` → `${name} — ${city}, ${STATE}` →
 * name truncated; Remote rows read `— online ${noun}` → `— online`. A row with
 * `state = national` but a physical city shows the city alone.
 */
export function programTitle(p: Pick<AuProgramRow, "name" | "program_type" | "city" | "capital" | "state">): string {
  const noun = programTypeNoun(p.program_type);
  const tails =
    p.capital === "Remote"
      ? [` — online ${noun}`, " — online, Australia-wide", " — online"]
      : (() => {
          const where = p.state === "national" ? p.city : `${p.city}, ${p.state}`;
          return [` — ${noun} in ${where}`, ` — ${where}`];
        })();
  return cascade(p.name, tails);
}

export function programDescription(
  p: Pick<
    AuProgramRow,
    | "name"
    | "program_type"
    | "operator"
    | "city"
    | "capital"
    | "state"
    | "funding_aud"
    | "equity_pct"
    | "length_weeks"
    | "status"
    | "applications_close"
    | "summary"
  >,
): string {
  const where = p.capital === "Remote" ? "online for startups anywhere in Australia" : `in ${p.city}, ${stateLabel(p.state)}`;
  const terms: string[] = [];
  if (typeof p.funding_aud === "number" && p.funding_aud > 0) terms.push(`up to ${formatAudCompact(p.funding_aud)}`);
  if (p.equity_pct) terms.push(`${p.equity_pct} equity`);
  if (typeof p.length_weeks === "number" && p.length_weeks > 0) terms.push(`${p.length_weeks} weeks`);
  return fitDescription([
    `${p.name}: ${programTypeNoun(p.program_type)} run by ${p.operator ?? "its operator"} ${where}`,
    terms.length ? `Terms: ${terms.join(", ")}` : null,
    statusSentence(p.status, p.applications_close),
    p.summary,
    "Benefits, who can apply, intake dates and the official application link",
  ]);
}

export const PROGRAMS_TITLE = fitTitle("Startup accelerators & incubators in Australia");
export const PROGRAMS_DESCRIPTION = fitDescription([
  "Free directory of Australian accelerators, incubators, pre-accelerators, university programs and angel groups in every capital and online",
  "Intake dates, funding, equity terms and official links",
]);

/** "Gold Coast, Sunshine Coast and Regional Queensland" (empty string when a capital has no satellites). */
export function satelliteList(capital: Capital): string {
  const list = CAPITAL_SATELLITES[capital] ?? [];
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

/** Title / H1 / description / coverage sentence for /funding/programs/[capital]. */
export function capitalSeo(capital: Capital): { title: string; h1: string; description: string; coverage: string | null } {
  if (capital === "Remote") {
    return {
      title: fitTitle("Online startup accelerators across Australia"),
      h1: "Online startup accelerators and programs, Australia-wide",
      description: fitDescription([
        "Free directory of remote, online and national accelerators, incubators and founder programs open to startups anywhere in Australia",
        "Twelve-month intake calendar and official application links",
      ]),
      coverage: null,
    };
  }
  const sats = satelliteList(capital);
  const stateName = stateLabel(stateForCapital(capital));
  const coverage = sats
    ? `${capital} listings also cover ${sats}, so the whole ${stateName} startup ecosystem — every accelerator, incubator and founder program — is on this one page.`
    : null;
  return {
    title: fitTitle(`Startup accelerators & incubators in ${capital}`),
    h1: `Startup accelerators and incubators in ${capital}`,
    description: fitDescription([
      `Accelerators, incubators, pre-accelerators, university programs and angel groups in ${capital}${sats ? `, ${sats}` : ""}`,
      "Free directory with a twelve-month intake calendar",
      "Funding and equity terms, official application links",
      "Open first, then upcoming",
    ]),
    coverage,
  };
}

const CAPITAL_TO_STATE: Readonly<Record<Capital, AuState>> = {
  Sydney: "NSW",
  Melbourne: "VIC",
  Brisbane: "QLD",
  Perth: "WA",
  Adelaide: "SA",
  Canberra: "ACT",
  Hobart: "TAS",
  Darwin: "NT",
  Remote: "national",
};

export function stateForCapital(capital: Capital): AuState {
  return CAPITAL_TO_STATE[capital];
}

// ─── Landing + demo ──────────────────────────────────────────────────────────

export const LANDING_TITLE = fitTitle("Find startup funding in Australia in 60 seconds");
export const LANDING_DESCRIPTION = fitDescription([
  "Every open Australian startup grant and every accelerator, incubator and founder program in the eight capitals — free to browse, with official links",
  "Three questions match you; the ranked report with a 12-month plan is A$3",
]);

export const DEMO_TITLE_CORE = fitTitle("Sample startup funding report — what A$3 buys");
export const DEMO_DESCRIPTION_TEXT = fitDescription([
  "A full sample Money Finder report: ranked grants with eligibility checklists and A$ estimates, matched accelerators, and a 12-month plan for an NSW agtech startup at MVP",
  "Build yours from three answers for A$3",
]);

/** Absolute URL helper shared by the JSON-LD builders. */
export function absoluteUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

/** Breadcrumb trails (root → current) for every funding page type. */
export const FUNDING_CRUMBS = {
  landing: [
    { name: "Home", href: "/" },
    { name: "Funding", href: "/funding" },
  ],
  grants: [
    { name: "Home", href: "/" },
    { name: "Funding", href: "/funding" },
    { name: "Grants", href: "/funding/grants" },
  ],
  grant: (g: Pick<AuGrantRow, "id" | "name">) => [
    { name: "Home", href: "/" },
    { name: "Funding", href: "/funding" },
    { name: "Grants", href: "/funding/grants" },
    { name: g.name, href: grantPath(g.id) },
  ],
  programs: [
    { name: "Home", href: "/" },
    { name: "Funding", href: "/funding" },
    { name: "Programs", href: "/funding/programs" },
  ],
  capital: (capital: Capital) => [
    { name: "Home", href: "/" },
    { name: "Funding", href: "/funding" },
    { name: "Programs", href: "/funding/programs" },
    { name: capitalDisplayName(capital), href: capitalPath(capital) },
  ],
  program: (p: Pick<AuProgramRow, "id" | "name" | "capital">) => [
    { name: "Home", href: "/" },
    { name: "Funding", href: "/funding" },
    { name: "Programs", href: "/funding/programs" },
    { name: capitalDisplayName(p.capital), href: capitalPath(p.capital) },
    { name: p.name, href: programPath(p.capital, p.id) },
  ],
  demo: [
    { name: "Home", href: "/" },
    { name: "Funding", href: "/funding" },
    { name: "Sample report", href: "/funding/report/demo" },
  ],
} as const;

// ─── Insight callouts (directory ↔ insights internal links) ─────────────────

export interface InsightCallout {
  slug: string;
  label: string;
}

/** Guides the grants pages link to (slugs live in content/insights/manifest.json; pinned in seo.test.ts). */
export const GRANT_GUIDES: readonly InsightCallout[] = [
  { slug: "government-grants-startups-australia-2026", label: "Guide: government grants for Australian startups" },
  { slug: "r-and-d-tax-incentive-startups-australia", label: "Guide: the R&D Tax Incentive for startups" },
  { slug: "esic-and-rnd-tax-incentive-guide-2026", label: "Guide: ESIC and the R&D Tax Incentive together" },
];

/** Guides the programs pages link to. */
export const PROGRAM_GUIDES: readonly InsightCallout[] = [
  { slug: "australian-startup-accelerators-2026", label: "Guide: Australian startup accelerators" },
  { slug: "non-dilutive-funding-strategies-australia", label: "Guide: non-dilutive funding in Australia" },
];

/** Pick the guides most relevant to a grant (R&D / ESIC rows get their own guide first). */
export function guidesForGrant(g: Pick<AuGrantRow, "id" | "funding_type">): readonly InsightCallout[] {
  if (g.id === "esic") return [GRANT_GUIDES[2], GRANT_GUIDES[0], GRANT_GUIDES[1]];
  if (g.id === "rdti" || g.funding_type.startsWith("tax_offset")) return [GRANT_GUIDES[1], GRANT_GUIDES[2], GRANT_GUIDES[0]];
  return GRANT_GUIDES;
}
