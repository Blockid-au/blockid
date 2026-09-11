// Structured enrichment for the program + grant detail pages (S9-B).
//
// The S8-A audit (docs/plans/reviews/seo-audit-2026-09-11.md, "Thin pages")
// found most program pages well under the 300-word floor because the seed
// rows carry a five-word `summary` and a handful of benefits. This module
// turns the *structured* fields every row already has (type, tags, cost /
// equity, intake months, windows, evidence, prompts, amounts) into readable
// sections — At a glance, Who it is for, What you get, How to apply, Timing,
// Related, FAQ — without inventing a single fact:
//
//   * every sentence is either (a) a field value rendered through a fixed
//     vocabulary map, or (b) a clearly generic explainer keyed off the row's
//     `program_type` / `funding_type` ("An accelerator is …");
//   * a section with no data is omitted (`null` / `[]`), never padded;
//   * FAQ questions render only from present fields, and the `FAQPage`
//     JSON-LD is emitted only when at least two Q&As exist.
//
// Pure — no I/O, no `server-only`. "Related" reuses the grant-advisor
// scorer (`matchGrants` / `matchPrograms`) with a neutral profile built from
// the row itself, so the detail pages and the A$3 report rank the same way.
// Colocated tests: enrich.test.ts (runs every builder over the real seeds).

import type { AuGrantRow, AuProgramRow, AuState, Capital, FundingStatus } from "./seed-map";
import {
  capitalDisplayName,
  eligibilityRequirements,
  formatAudCompact,
  formatAudRange,
  formatLooseDate,
  fundingTypeLabel,
  humanize,
  levelLabel,
  monthLong,
  parseLooseDate,
  programTypeLabel,
  stageLabel,
  stateLabel,
  statusRank,
  type EligibilityRequirement,
} from "./directory";
import { daysUntil, deadlineStatus, formatDateAu, timeZoneForState, type DeadlineStatus } from "./deadline-status";
import { capitalPath, grantPath, grantsStatePath, programPath, satelliteList, stateForCapital, type InsightCallout } from "./seo";
import { matchGrants, matchPrograms, programNextWindow, type GrantProfile, type ProfileState } from "@/lib/agents/grant-advisor";
import { FOUNDER_STAGES, isRollingString, type FounderStage } from "@/lib/agents/grant-advisor-rules";

// ─── Public shapes ───────────────────────────────────────────────────────────

export interface Fact {
  label: string;
  value: string;
}

export interface FaqItem {
  question: string;
  answer: string;
}

export interface RelatedLink {
  href: string;
  name: string;
  /** One line under the name: "Accelerator · Sydney · Open" / "up to A$50,000 · NSW". */
  meta: string;
}

export interface TimingSection {
  status: DeadlineStatus;
  /** The ladder label ("Closes in 12 days — 30 Nov 2026"). */
  label: string;
  sentences: string[];
}

export interface HowToApplySection {
  intro: string | null;
  steps: string[];
  evidence: string[];
  /** "You will be asked" — the first three official application prompts. */
  prompts: string[];
  officialUrl: string;
}

export interface RelatedSection {
  programs: RelatedLink[];
  grants: RelatedLink[];
  insight: InsightCallout;
  /** The `/funding` CTA — always present. */
  funding: { href: string; label: string };
}

export interface ProgramEnrichment {
  kind: "program";
  atAGlance: Fact[];
  whoItIsFor: string[];
  whatYouGet: string[];
  howToApply: HowToApplySection;
  timing: TimingSection;
  related: RelatedSection & { capital: { href: string; label: string }; stateGrants: { href: string; label: string } };
  faq: FaqItem[];
  faqJsonLd: Record<string, unknown> | null;
}

export interface GrantEnrichment {
  kind: "grant";
  atAGlance: Fact[];
  whoItIsFor: string[];
  whatYouGet: string[];
  howToApply: HowToApplySection;
  timing: TimingSection;
  related: RelatedSection & { stateGrants: { href: string; label: string } };
  faq: FaqItem[];
  faqJsonLd: Record<string, unknown> | null;
}

export interface EnrichContext {
  programs: ReadonlyArray<AuProgramRow>;
  grants: ReadonlyArray<AuGrantRow>;
  /** Injectable for tests; the pages pass `new Date()` under hourly ISR. */
  today?: Date;
}

export const FUNDING_CTA = { href: "/funding", label: "See which of these you qualify for" } as const;

export const RELATED_LIMIT = 3;
export const PROMPT_LIMIT = 3;
export const FAQ_MAX = 4;
export const FAQ_JSON_LD_MIN = 2;

// ─── Fixed vocabulary (the only source of adjectives on these pages) ────────

/** Stage tag → who that stage is, as a noun phrase. */
export const STAGE_AUDIENCE: Readonly<Record<string, string>> = {
  idea: "founders still at the idea stage",
  pre_revenue_prototype: "pre-revenue teams with a prototype",
  mvp: "startups with an MVP in users' hands",
  early_revenue: "companies earning their first revenue",
  scaling: "businesses that are already scaling",
  export_ready: "export-ready companies",
  mature_sme: "established SMEs",
};

/** Stage tag → what that stage means on BlockID's ladder (generic explainer, keyed off the tag). */
export const STAGE_EXPLAINERS: Readonly<Record<string, string>> = {
  idea: "idea means a problem and a proposed solution, but nothing built yet",
  pre_revenue_prototype: "pre-revenue prototype means something works but nobody pays for it yet",
  mvp: "MVP means a minimum product is live with real users",
  early_revenue: "early revenue means paying customers but not yet repeatable growth",
  scaling: "scaling means repeatable revenue and a team growing around it",
  export_ready: "export-ready means a product already selling that is ready for overseas markets",
};

function stageExplainerSentence(tags: readonly string[]): string | null {
  const parts = tags.map((t) => STAGE_EXPLAINERS[t]).filter((x): x is string => Boolean(x));
  if (parts.length === 0) return null;
  return `On BlockID's stage ladder, ${parts.join("; ")}.`;
}

/** Industry tag → plain sector name. */
export const INDUSTRY_NOUNS: Readonly<Record<string, string>> = {
  ai_ml: "AI and machine learning",
  healthtech_medtech: "healthtech and medtech",
  cleantech_renewables: "cleantech and renewables",
  space: "space technology",
  defence_dualuse: "defence and dual-use technology",
  agtech_food: "agtech and food",
  software_saas: "software and SaaS",
  climate: "climate technology",
  quantum: "quantum technology",
  social_enterprise: "social enterprise",
  fintech: "fintech",
  biotech_pharma: "biotech and pharma",
  advanced_manufacturing: "advanced manufacturing",
  mining_resources_tech: "mining and resources technology",
  professional_services: "professional services",
  creative_media: "creative industries and media",
  tourism_hospitality: "tourism and hospitality",
  transport_logistics: "transport and logistics",
  construction: "construction",
};

/** Demographic tag → the founder group it names. */
export const DEMOGRAPHIC_NOUNS: Readonly<Record<string, string>> = {
  women_led: "women-led teams",
  women_owned_51: "businesses at least 51% women-owned",
  indigenous_owned_50: "businesses at least 50% Aboriginal or Torres Strait Islander-owned",
  indigenous_owned_51_controlled: "businesses at least 51% Indigenous-owned and controlled",
  regional_founder: "founders based outside a capital city",
  young_founder_under_30: "founders under 30",
  migrant_refugee: "founders from migrant or refugee backgrounds",
  disability: "founders with disability",
  jobseeker_recipient: "founders receiving eligible income support",
  veteran: "veterans and their families",
};

/** Generic explainer per program type — what the *format* is, never what this row does. */
export const PROGRAM_TYPE_EXPLAINERS: Readonly<Record<string, string>> = {
  accelerator:
    "An accelerator is a fixed-length, cohort-based program that combines mentoring, workshops and investor access, usually ending in a demo day.",
  pre_accelerator:
    "A pre-accelerator is a short, low-commitment program that helps founders validate an idea and prepare for a full accelerator or first raise.",
  incubator:
    "An incubator gives early teams a base — desks, advisors, community and often prototyping facilities — without a fixed cohort end date.",
  university:
    "A university program is run by, or with, a university and is usually open to its students, staff, researchers or alumni, sometimes to the wider community.",
  competition: "A competition awards a prize, funding or a place in a program to the founders judged best against published criteria.",
  community: "A founder community is a membership or drop-in network: events, peer groups and introductions rather than a formal curriculum.",
  corporate: "A corporate program is run by an established company looking for startups to pilot with, partner with or invest in.",
  angel_group: "An angel group pools individual investors who back early-stage companies, usually after a pitch to the group.",
  event: "An event is a dated gathering — a conference, pitch night or festival — rather than a program you enrol in.",
  government: "A government program is delivered by a federal, state or territory agency and is typically free, with eligibility set by policy.",
  vc: "A venture capital fund invests money for equity; the listing shows the stage and terms the fund publishes.",
  rd_advance_loan: "An R&D advance loan lends against an expected R&D Tax Incentive refund so the cash arrives before the ATO pays it.",
  advisory: "An advisory service gives one-to-one guidance rather than funding — plans, introductions and expert review.",
};

/** Generic explainer per funding type. */
export const FUNDING_TYPE_EXPLAINERS: Readonly<Record<string, string>> = {
  grant: "A grant is money you do not repay and that takes no equity; it is paid against an approved project and its milestones.",
  matched_grant: "A matched grant pays a share of an approved project — you contribute the rest in cash or in kind, and claim against milestones.",
  voucher: "A voucher pays an approved provider for a defined service (advice, testing, research) rather than paying cash to you.",
  rebate: "A rebate refunds part of money you have already spent on an eligible activity.",
  tax_offset_refundable: "A refundable tax offset is claimed in your company tax return and is paid out in cash where it exceeds the tax owed.",
  tax_offset_nonrefundable: "A non-refundable tax offset reduces tax payable; any unused amount is carried forward rather than paid out.",
  tax_deduction: "A tax deduction lowers taxable income; its cash value depends on your tax rate.",
  loan_concessional: "A concessional loan is repaid, but on better terms than a bank would offer — lower interest, longer tenor or a repayment holiday.",
  loan_unsecured: "An unsecured loan is repaid with interest and needs no security over assets.",
  equity: "Equity funding buys shares in your company; the provider becomes a shareholder.",
  co_investment: "Co-investment matches money from a private lead investor on the same or similar terms.",
  accelerator: "An accelerator place bundles a program with, in some cases, funding or investment.",
  competition_showcase: "A competition or showcase awards a prize or exposure to the entrants judged best against published criteria.",
  advisory_service: "An advisory service provides expert guidance, not cash.",
  wage_subsidy: "A wage subsidy offsets part of the cost of employing an eligible person.",
  procurement_access: "Procurement access gives a route to sell to government rather than a payment.",
};

/** Generic "how this kind of program usually selects" hint per program type — no numbers, no claims about this row. */
export const PROGRAM_APPLY_HINTS: Readonly<Record<string, string>> = {
  accelerator: "Accelerators usually shortlist from a written application and then interview the team, so have your deck, traction and cap table ready before the window opens.",
  pre_accelerator: "Pre-accelerators usually ask for a short application about the problem, the team and what you have tested so far — polish is less important than clarity.",
  incubator: "Incubators usually take residents on a rolling basis after a conversation with the team, so reach out through the official site rather than waiting for a round.",
  university: "University programs usually check affiliation first (student, staff, researcher or alumni), so confirm you qualify before you write the application.",
  competition: "Competitions judge against published criteria — read them, answer each one explicitly, and submit before the cut-off.",
  community: "Communities usually take members on a rolling basis — join through the official site and turn up to the events rather than waiting for a round.",
  corporate: "Corporate programs usually want a clear pilot or partnership use case, so lead with the problem you solve for that company.",
  angel_group: "Angel groups usually screen a deck first, then invite selected founders to pitch to members — a warm introduction through a member helps.",
  event: "Events sell tickets or open registration in advance — register through the official site; there is no application to write.",
  government: "Government programs are assessed against published eligibility, so confirm each criterion on the official page before you apply.",
  vc: "Venture funds take introductions and inbound pitches through their own site; a warm introduction from a portfolio founder usually moves faster.",
  rd_advance_loan: "R&D advance loans assess your expected R&D Tax Incentive refund, so have your registered activities and spend to date ready.",
  advisory: "Advisory services usually start with an intake conversation to scope what you need — book it through the official site.",
};

/** Catalogue status → what the word means on this page (generic). */
export const STATUS_EXPLAINERS: Readonly<Record<FundingStatus, string>> = {
  open: "Open means the operator was accepting applications or members when BlockID last checked the listing.",
  upcoming: "Upcoming means a new round has been announced but is not yet open.",
  paused: "Paused means the operator has stopped taking applications without announcing the next round.",
  closed: "Closed means the last recorded round has ended; the listing stays for reference until the next one is announced.",
};

/** `application_window` → one sentence on the rhythm of the scheme. */
export const WINDOW_EXPLAINERS: Readonly<Record<string, string>> = {
  rolling: "Applications are accepted on a rolling basis rather than in fixed rounds.",
  annual_round: "The scheme runs one funding round a year.",
  annual: "The scheme runs one funding round a year.",
  multi_round: "The scheme runs several rounds a year.",
  biennial: "The scheme runs a round every two years.",
  challenge_based: "Rounds open when the agency publishes a challenge to respond to.",
  one_off: "The listing records a one-off round.",
  announced_not_open: "The round has been announced but is not yet open.",
  paused: "New applications are paused.",
  closed_permanently: "The scheme has closed permanently.",
};

/** The nine funding insight articles that carry the "See which of these you qualify for" callout. */
export const FUNDING_INSIGHTS: Readonly<Record<string, InsightCallout>> = {
  grants: { slug: "government-grants-startups-australia-2026", label: "Guide: government grants for Australian startups" },
  rdti: { slug: "r-and-d-tax-incentive-startups-australia", label: "Guide: the R&D Tax Incentive for startups" },
  esic: { slug: "esic-and-rnd-tax-incentive-guide-2026", label: "Guide: ESIC and the R&D Tax Incentive together" },
  esicCompliance: { slug: "esic-compliance-guide-early-stage-startups", label: "Guide: ESIC compliance for early-stage startups" },
  nonDilutive: { slug: "non-dilutive-funding-strategies-australia", label: "Guide: non-dilutive funding in Australia" },
  rounds: { slug: "australian-startup-funding-rounds-2026-guide", label: "Guide: Australian startup funding rounds" },
  bootstrapping: { slug: "bootstrapping-vs-fundraising-australian-founders", label: "Guide: bootstrapping vs fundraising" },
  revenueBased: { slug: "revenue-based-financing-australia", label: "Guide: revenue-based financing in Australia" },
  ventureDebt: { slug: "venture-debt-vs-equity-funding-australia", label: "Guide: venture debt vs equity" },
};

// ─── Small helpers ───────────────────────────────────────────────────────────

const NO_EQUITY = /^(none|n\/a|nil|no equity|not applicable)\b/i;
/** The bare "none" / "n/a" with nothing after it — anything longer ("none (debt)") keeps its qualifier visible. */
const BARE_NO_EQUITY = /^(none|n\/a|nil|no equity|not applicable)$/i;
const UNKNOWN_VALUE = /^(not stated|not published|not listed|n\/a|unknown|tbc|tba)$/i;
const FREE = /^free\b/i;

function stageNouns(tags: readonly string[]): string[] {
  return tags.map((t) => STAGE_AUDIENCE[t] ?? humanize(t).toLowerCase());
}
function industryNouns(tags: readonly string[]): string[] {
  return tags.map((t) => INDUSTRY_NOUNS[t] ?? humanize(t).toLowerCase());
}
function demographicNouns(tags: readonly string[]): string[] {
  return tags.map((t) => DEMOGRAPHIC_NOUNS[t] ?? humanize(t).toLowerCase());
}

/** "a, b and c" — Oxford-free, en-AU. */
export function joinAnd(items: readonly string[]): string {
  const list = items.filter((s) => s && s.trim().length > 0);
  if (list.length === 0) return "";
  if (list.length === 1) return list[0];
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, " ");
  if (!t) return "";
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

/** Equity field in plain words. */
export function equityInWords(equity: string | null | undefined): string | null {
  const v = (equity ?? "").trim();
  if (!v) return null;
  if (BARE_NO_EQUITY.test(v)) return "No equity taken";
  if (NO_EQUITY.test(v)) return `No equity taken — ${v}`;
  if (UNKNOWN_VALUE.test(v)) return "Equity terms not published";
  return `Equity: ${v}`;
}

/** Cost field in plain words. */
export function costInWords(cost: string | null | undefined): string | null {
  const v = (cost ?? "").trim();
  if (!v) return null;
  if (FREE.test(v)) return v.toLowerCase() === "free" ? "Free to founders" : `Free to founders (${v.replace(FREE, "").replace(/^[\s(]+|[\s)]+$/g, "")})`;
  if (UNKNOWN_VALUE.test(v)) return "Cost not published";
  return `Cost to founder: ${v}`;
}

function firstFounderStage(tags: readonly string[]): FounderStage {
  for (const s of FOUNDER_STAGES) if (tags.includes(s)) return s;
  return "mvp";
}

function profileState(state: AuState, capital?: Capital): ProfileState {
  if (state !== "national") return state;
  if (capital && capital !== "Remote") {
    const s = stateForCapital(capital);
    if (s !== "national") return s;
  }
  return "NSW";
}

/**
 * The neutral profile the "Related" lists are scored with: the row's own
 * state, first founder stage and sectors — nothing else, so no financial or
 * demographic gate can fail and the ranking is purely stage + sector + timing.
 */
export function neutralProfile(row: { state: AuState; stage_tags: string[]; industry_tags: string[] }, capital?: Capital): GrantProfile {
  return {
    state: profileState(row.state, capital),
    stage: firstFounderStage(row.stage_tags),
    industry_tags: row.industry_tags.length ? [...row.industry_tags] : null,
  };
}

function statusWord(status: FundingStatus): string {
  return status === "closed" ? "Closed" : status === "paused" ? "Paused" : status === "upcoming" ? "Upcoming" : "Open";
}

function verifiedFact(row: { last_verified_at: string | null; status_confidence: string }): Fact | null {
  if (!row.last_verified_at) return null;
  return { label: "Verified", value: `${formatLooseDate(row.last_verified_at)} · ${row.status_confidence} confidence` };
}

function gateSentence(reqs: EligibilityRequirement[]): string | null {
  if (reqs.length === 0) return null;
  const shown = reqs.slice(0, 4).map((r) => `${r.label.toLowerCase()} (${r.value})`);
  const list = reqs.length > 4 ? `${shown.join(", ")} and ${reqs.length - 4} more` : joinAnd(shown);
  return `The listing records ${reqs.length} eligibility gate${reqs.length === 1 ? "" : "s"}: ${list}.`;
}

// ─── Programs ────────────────────────────────────────────────────────────────

export function programAtAGlance(p: AuProgramRow, today: Date = new Date()): Fact[] {
  const facts: Fact[] = [{ label: "Type", value: programTypeLabel(p.program_type) }];
  if (p.operator) facts.push({ label: "Run by", value: p.operator });
  const sats = satelliteList(p.capital);
  facts.push({
    label: "Where",
    value:
      p.capital === "Remote"
        ? `Online / Australia-wide${p.city && p.city !== "Remote" ? ` (${p.city})` : ""}`
        : `${p.city}${p.state !== "national" ? `, ${stateLabel(p.state)}` : ""}${sats ? ` — listed under ${p.capital} with ${sats}` : ""}`,
  });
  if (p.stage_tags.length) facts.push({ label: "Stage fit", value: p.stage_tags.map(stageLabel).join(", ") });
  if (p.industry_tags.length) facts.push({ label: "Sectors", value: industryNouns(p.industry_tags).join(", ") });
  if (p.demographic_tags.length) facts.push({ label: "Designed for", value: demographicNouns(p.demographic_tags).join(", ") });
  if (typeof p.funding_aud === "number" && p.funding_aud > 0) facts.push({ label: "Funding", value: `Up to ${formatAudCompact(p.funding_aud)}` });
  const equity = equityInWords(p.equity_pct);
  if (equity) facts.push({ label: "Equity", value: equity });
  const cost = costInWords(p.cost_to_founder);
  if (cost) facts.push({ label: "Cost", value: cost });
  if (typeof p.length_weeks === "number" && p.length_weeks > 0) facts.push({ label: "Length", value: `${p.length_weeks} week${p.length_weeks === 1 ? "" : "s"}` });
  if (p.intake_months.length) facts.push({ label: "Usual intake", value: p.intake_months.map(monthLong).join(", ") });
  const next = programNextDate(p, today);
  if (next) facts.push(next);
  facts.push({ label: "Status", value: statusWord(p.status) });
  const verified = verifiedFact(p);
  if (verified) facts.push(verified);
  return facts;
}

/** "Applications close 8 Nov 2026 (AEST)" / "Next cohort starts …" — only from dated fields. */
function programNextDate(p: AuProgramRow, today: Date): Fact | null {
  const closes = parseLooseDate(p.applications_close);
  if (closes) {
    const verdict = deadlineStatus({ closes_at: p.applications_close, opens_at: parseLooseDate(p.applications_open) ? p.applications_open : null, catalogue_status: p.status }, today);
    return { label: verdict.status === "overdue" ? "Last close" : "Applications close", value: formatDateAu(p.applications_close, p.state) };
  }
  if (parseLooseDate(p.next_cohort_start)) return { label: "Next cohort", value: formatDateAu(p.next_cohort_start, p.state) };
  if (parseLooseDate(p.applications_open)) return { label: "Applications open", value: formatDateAu(p.applications_open, p.state) };
  if (isRollingString(p.applications_open) || isRollingString(p.applications_close)) return { label: "Applications", value: "Rolling — apply any time" };
  return null;
}

export function programWhoItIsFor(p: AuProgramRow): string[] {
  const out: string[] = [];
  const stages = stageNouns(p.stage_tags);
  const sectors = industryNouns(p.industry_tags);
  if (stages.length && sectors.length) {
    out.push(`${p.name} is aimed at ${joinAnd(stages)}, working in ${joinAnd(sectors)}.`);
  } else if (stages.length) {
    out.push(`${p.name} is open to most Australian founders at the ${joinAnd(p.stage_tags.map((t) => stageLabel(t).toLowerCase()))} stage${p.stage_tags.length > 1 ? "s" : ""} — ${joinAnd(stages)} — with no sector restriction listed.`);
  } else if (sectors.length) {
    out.push(`${p.name} focuses on ${joinAnd(sectors)} and lists no stage restriction, so founders at any stage in those sectors can look at it.`);
  } else {
    out.push(`${p.name} lists no stage or sector restriction, so it is open to most Australian founders at any stage.`);
  }
  const ladder = stageExplainerSentence(p.stage_tags);
  if (ladder) out.push(ladder);
  if (p.demographic_tags.length) out.push(`It is designed for ${joinAnd(demographicNouns(p.demographic_tags))}.`);
  if (p.capital === "Remote") {
    out.push("Delivery is online or Australia-wide, so where you are based is not a barrier.");
  } else {
    const sats = satelliteList(p.capital);
    out.push(
      `It is based in ${p.city}${p.state !== "national" ? `, ${stateLabel(p.state)}` : ""}${
        sats ? `, and sits on the ${p.capital} page alongside programs in ${sats}` : ""
      }.`,
    );
  }
  const gates = gateSentence(eligibilityRequirements(p.eligibility));
  if (gates) out.push(gates);
  return out;
}

export function programWhatYouGet(p: AuProgramRow): string[] {
  const out: string[] = [];
  const explainer = PROGRAM_TYPE_EXPLAINERS[p.program_type];
  if (explainer) out.push(explainer);
  if (p.summary) out.push(sentence(p.summary));
  if (p.benefits.length) {
    out.push(`The listing records ${p.benefits.length} benefit${p.benefits.length === 1 ? "" : "s"}: ${joinAnd(p.benefits.map((b) => b.replace(/\.$/, "")))}.`);
  }
  const hasFunding = typeof p.funding_aud === "number" && p.funding_aud > 0;
  const equity = (p.equity_pct ?? "").trim();
  if (hasFunding && equity && !NO_EQUITY.test(equity)) {
    out.push(`It lists up to ${formatAudCompact(p.funding_aud as number)} in funding, with equity terms recorded as "${equity}".`);
  } else if (hasFunding) {
    out.push(
      `It lists up to ${formatAudCompact(p.funding_aud as number)} in funding${
        equity ? (BARE_NO_EQUITY.test(equity) ? " and takes no equity" : ` — equity is recorded as "${equity}"`) : ""
      }.`,
    );
  } else if (equity && !NO_EQUITY.test(equity) && !UNKNOWN_VALUE.test(equity)) {
    out.push(`Equity terms are recorded as "${equity}"; no fixed funding amount is listed.`);
  } else if (equity && BARE_NO_EQUITY.test(equity)) {
    out.push("It takes no equity, and no fixed funding amount is listed.");
  } else if (equity && NO_EQUITY.test(equity)) {
    out.push(`Equity is recorded as "${equity}"; no fixed funding amount is listed.`);
  }
  const cost = (p.cost_to_founder ?? "").trim();
  if (cost) {
    if (FREE.test(cost)) out.push(cost.toLowerCase() === "free" ? "It is free for founders." : `Cost to founders is listed as "${cost}".`);
    else if (UNKNOWN_VALUE.test(cost)) out.push("The listing does not publish a cost to founders — confirm it on the official page.");
    else out.push(`Cost to founders is listed as "${cost}".`);
  }
  if (typeof p.length_weeks === "number" && p.length_weeks > 0) out.push(`It runs for ${p.length_weeks} week${p.length_weeks === 1 ? "" : "s"}.`);
  if (p.venue && p.capital !== "Remote") out.push(`Sessions are held at ${p.venue}.`);
  return out;
}

export function programHowToApply(p: AuProgramRow): HowToApplySection {
  const steps: string[] = [];
  if (p.intake_months.length) steps.push(`Cohorts usually start in ${joinAnd(p.intake_months.map(monthLong))} — plan to apply well before the intake month.`);
  const opens = p.applications_open;
  const closes = p.applications_close;
  if (parseLooseDate(opens) && parseLooseDate(closes)) {
    steps.push(`Applications open ${formatDateAu(opens, p.state)} and close ${formatDateAu(closes, p.state)}.`);
  } else if (parseLooseDate(closes)) {
    steps.push(`Applications close ${formatDateAu(closes, p.state)}.`);
  } else if (parseLooseDate(opens)) {
    steps.push(`Applications open ${formatDateAu(opens, p.state)}.`);
  } else if (isRollingString(opens) || isRollingString(closes)) {
    steps.push("Applications are rolling — you can apply at any time.");
  } else if (opens && !parseLooseDate(opens)) {
    steps.push(`Application status recorded as "${opens}".`);
  }
  if (parseLooseDate(p.next_cohort_start)) steps.push(`The next cohort is listed to start ${formatDateAu(p.next_cohort_start, p.state)}.`);
  const reqs = eligibilityRequirements(p.eligibility);
  if (reqs.length) steps.push(`Have evidence ready for the recorded gates: ${joinAnd(reqs.map((r) => r.label.toLowerCase()))}.`);
  const hint = PROGRAM_APPLY_HINTS[p.program_type];
  if (hint) steps.push(hint);
  steps.push(`Apply through the official ${programTypeLabel(p.program_type).toLowerCase()} page — BlockID lists the program but never handles applications.`);
  // S16-A: the first three seeded application questions (0329), like grants.
  const prompts = (p.application_prompts ?? []).slice(0, PROMPT_LIMIT).map((q) => q.question);
  return { intro: null, steps, evidence: [], prompts, officialUrl: p.official_url };
}

export function programTiming(p: AuProgramRow, today: Date = new Date()): TimingSection {
  const opens = parseLooseDate(p.applications_open) ? p.applications_open : null;
  const closes = parseLooseDate(p.applications_close) ? p.applications_close : null;
  const rolling = isRollingString(p.applications_open) || isRollingString(p.applications_close);
  const verdict = deadlineStatus({ opens_at: opens, closes_at: closes, rolling: rolling || undefined, catalogue_status: p.status }, today);
  const sentences: string[] = [];
  const { abbr } = timeZoneForState(p.state);
  if (closes) sentences.push(`Applications close ${formatDateAu(closes, p.state)}; dates are calendar days in ${abbr}.`);
  if (opens && !closes) sentences.push(`Applications open ${formatDateAu(opens, p.state)}.`);
  if (parseLooseDate(p.next_cohort_start)) sentences.push(`The next cohort is listed to start ${formatDateAu(p.next_cohort_start, p.state)}.`);
  const nw = programNextWindow(p, today);
  if (nw.next_window.kind === "estimated") {
    sentences.push(`Based on the usual intake months, the next window is estimated at ${nw.next_window.opens_at ? formatDateAu(nw.next_window.opens_at, p.state, { withZone: false }) : "TBC"} to ${nw.next_window.closes_at ? formatDateAu(nw.next_window.closes_at, p.state, { withZone: false }) : "TBC"} — an estimate, not a published date.`);
  }
  if (rolling && !closes) sentences.push("The program takes applications on a rolling basis.");
  if (p.status === "closed") sentences.push("The listing is marked closed — do not apply until the operator announces the next round.");
  if (p.status === "paused") sentences.push("The listing is marked paused — the next round has not been announced.");
  if (p.status === "upcoming") sentences.push("The listing is marked upcoming — a new round has been announced.");
  if (sentences.length === 0) sentences.push(`${verdict.label}.`);
  sentences.push(STATUS_EXPLAINERS[p.status]);
  if (p.last_verified_at) sentences.push(`Status was last verified on ${formatDateAu(p.last_verified_at, p.state, { withZone: false })}; confirm on the official page before you apply.`);
  return { status: verdict.status, label: verdict.label, sentences };
}

/** Top programs in the same capital by shared stage / industry tags (self excluded), open-first on ties. */
export function relatedPrograms(p: AuProgramRow, programs: ReadonlyArray<AuProgramRow>, limit = RELATED_LIMIT): RelatedLink[] {
  const scored = programs
    .filter((o) => o.id !== p.id && o.capital === p.capital)
    .map((o) => {
      const stage = o.stage_tags.filter((t) => p.stage_tags.includes(t)).length;
      const industry = o.industry_tags.filter((t) => p.industry_tags.includes(t)).length;
      const demo = o.demographic_tags.filter((t) => p.demographic_tags.includes(t)).length;
      const type = o.program_type === p.program_type ? 1 : 0;
      return { row: o, score: stage + 2 * industry + demo + type };
    })
    .sort((a, b) => b.score - a.score || statusRank(a.row.status) - statusRank(b.row.status) || a.row.name.localeCompare(b.row.name));
  return scored.slice(0, limit).map(({ row }) => programLink(row));
}

export function programLink(o: AuProgramRow): RelatedLink {
  return {
    href: programPath(o.capital, o.id),
    name: o.name,
    meta: `${programTypeLabel(o.program_type)} · ${o.capital === "Remote" ? "Online" : o.city} · ${statusWord(o.status)}`,
  };
}

export function grantLink(g: AuGrantRow): RelatedLink {
  return {
    href: grantPath(g.id),
    name: g.name,
    meta: `${formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note)} · ${g.state === "national" ? "Federal" : stateLabel(g.state)} · ${statusWord(g.status)}`,
  };
}

/** Top grants for the program's state + stage via the matcher (closed / paused rows never appear). */
export function relatedGrantsForProgram(p: AuProgramRow, grants: ReadonlyArray<AuGrantRow>, today: Date = new Date(), limit = RELATED_LIMIT): RelatedLink[] {
  const pool = p.state === "national" && p.capital === "Remote" ? grants.filter((g) => g.state === "national") : [...grants];
  const matched = matchGrants(neutralProfile(p, p.capital), pool, today);
  return matched.slice(0, limit).map((m) => grantLink(m.grant));
}

/** The one funding insight that fits a program: equity-taking → rounds; R&D-heavy → RDTI; funded + no equity → non-dilutive; idea-only → bootstrapping; revenue stages → RBF; else the grants guide. */
export function insightForProgram(p: Pick<AuProgramRow, "program_type" | "equity_pct" | "funding_aud" | "stage_tags" | "industry_tags">): InsightCallout {
  const equity = (p.equity_pct ?? "").trim();
  const takesEquity = equity.length > 0 && !NO_EQUITY.test(equity) && !UNKNOWN_VALUE.test(equity);
  if (p.program_type === "vc" || p.program_type === "angel_group" || takesEquity) return FUNDING_INSIGHTS.rounds;
  if (p.program_type === "rd_advance_loan") return FUNDING_INSIGHTS.rdti;
  const rdHeavy = ["quantum", "biotech_pharma", "space", "advanced_manufacturing", "defence_dualuse"];
  if (p.industry_tags.some((t) => rdHeavy.includes(t))) return FUNDING_INSIGHTS.rdti;
  if (typeof p.funding_aud === "number" && p.funding_aud > 0) return FUNDING_INSIGHTS.nonDilutive;
  const stages = p.stage_tags.filter((t) => (FOUNDER_STAGES as readonly string[]).includes(t));
  if (stages.length && stages.every((t) => t === "idea" || t === "pre_revenue_prototype")) return FUNDING_INSIGHTS.bootstrapping;
  if (stages.length && stages.every((t) => t === "early_revenue" || t === "scaling" || t === "export_ready")) return FUNDING_INSIGHTS.revenueBased;
  return FUNDING_INSIGHTS.grants;
}

export function programFaq(p: AuProgramRow, today: Date = new Date()): FaqItem[] {
  const items: FaqItem[] = [];
  const equity = (p.equity_pct ?? "").trim();
  if (equity) {
    items.push({
      question: `Does ${p.name} take equity?`,
      answer: BARE_NO_EQUITY.test(equity)
        ? `No. The listing records no equity taken${typeof p.funding_aud === "number" && p.funding_aud > 0 ? `, with up to ${formatAudCompact(p.funding_aud)} in funding` : ""}.`
        : NO_EQUITY.test(equity)
          ? `Not by default — the listing records equity as "${equity}". Confirm the current terms on the official page.`
          : UNKNOWN_VALUE.test(equity)
          ? "The listing does not publish equity terms — confirm them on the official page before you commit."
          : `Yes, in some form. The listed equity terms are "${equity}". Confirm the current terms on the official page before you sign anything.`,
    });
  }
  const cost = (p.cost_to_founder ?? "").trim();
  if (cost) {
    items.push({
      question: `Does it cost anything to join ${p.name}?`,
      answer: FREE.test(cost)
        ? cost.toLowerCase() === "free"
          ? "No. It is listed as free to founders."
          : `It is listed as "${cost}".`
        : UNKNOWN_VALUE.test(cost)
          ? "The listing does not publish a cost — check the official page."
          : `The listed cost to founders is "${cost}".`,
    });
  }
  if (typeof p.length_weeks === "number" && p.length_weeks > 0) {
    items.push({
      question: `How long does ${p.name} run?`,
      answer: `${p.length_weeks} week${p.length_weeks === 1 ? "" : "s"}${p.intake_months.length ? `, with cohorts usually starting in ${joinAnd(p.intake_months.map(monthLong))}` : ""}.`,
    });
  }
  const next = programNextDate(p, today);
  if (next) {
    items.push({
      question: `When are the next applications for ${p.name}?`,
      answer: `${next.label}: ${next.value}. Status is ${statusWord(p.status).toLowerCase()}${p.last_verified_at ? `, verified ${formatLooseDate(p.last_verified_at)}` : ""}.`,
    });
  } else if (p.intake_months.length) {
    items.push({
      question: `When are the next applications for ${p.name}?`,
      answer: `No dated window is published; cohorts usually start in ${joinAnd(p.intake_months.map(monthLong))}. Status is ${statusWord(p.status).toLowerCase()}.`,
    });
  }
  if (p.venue || p.city) {
    items.push({
      question: `Where is ${p.name} held?`,
      answer:
        p.capital === "Remote"
          ? `Online or Australia-wide${p.venue && p.venue !== p.city ? ` (${p.venue})` : ""}.`
          : `${p.venue && p.venue !== p.city ? `${p.venue}, ` : ""}${p.city}${p.state !== "national" ? `, ${stateLabel(p.state)}` : ""}.`,
    });
  }
  return items.slice(0, FAQ_MAX);
}

export function enrichProgram(p: AuProgramRow, ctx: EnrichContext): ProgramEnrichment {
  const today = ctx.today ?? new Date();
  const faq = programFaq(p, today);
  return {
    kind: "program",
    atAGlance: programAtAGlance(p, today),
    whoItIsFor: programWhoItIsFor(p),
    whatYouGet: programWhatYouGet(p),
    howToApply: programHowToApply(p),
    timing: programTiming(p, today),
    related: {
      programs: relatedPrograms(p, ctx.programs),
      grants: relatedGrantsForProgram(p, ctx.grants, today),
      insight: insightForProgram(p),
      funding: { ...FUNDING_CTA },
      capital: { href: capitalPath(p.capital), label: `All ${capitalDisplayName(p.capital)} programs` },
      stateGrants: { href: grantsStatePath(p.state), label: p.state === "national" ? "Federal startup grants" : `${stateLabel(p.state)} startup grants` },
    },
    faq,
    faqJsonLd: buildFaqJsonLd(faq),
  };
}

// ─── Grants ──────────────────────────────────────────────────────────────────

export function grantAtAGlance(g: AuGrantRow): Fact[] {
  const facts: Fact[] = [{ label: "Type", value: fundingTypeLabel(g.funding_type) }];
  if (g.provider) facts.push({ label: "Provider", value: g.provider });
  facts.push({ label: "Level", value: levelLabel(g.level) });
  facts.push({ label: "Coverage", value: g.state === "national" ? "Australia-wide (federal)" : stateLabel(g.state) });
  facts.push({ label: "Amount", value: formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note) });
  if (g.co_contribution) facts.push({ label: "Co-contribution", value: NO_EQUITY.test(g.co_contribution) ? "None required" : g.co_contribution });
  if (g.stage_tags.length) facts.push({ label: "Stage fit", value: g.stage_tags.map(stageLabel).join(", ") });
  if (g.industry_tags.length) facts.push({ label: "Sectors", value: industryNouns(g.industry_tags).join(", ") });
  if (g.demographic_tags.length) facts.push({ label: "Reserved for", value: demographicNouns(g.demographic_tags).join(", ") });
  if (g.application_window) facts.push({ label: "Window", value: humanize(g.application_window) });
  if (parseLooseDate(g.opens_at)) facts.push({ label: "Opens", value: formatDateAu(g.opens_at, g.state) });
  if (parseLooseDate(g.closes_at)) facts.push({ label: "Closes", value: formatDateAu(g.closes_at, g.state) });
  if (g.lodgement_deadline) facts.push({ label: "Lodgement", value: g.lodgement_deadline });
  facts.push({ label: "Status", value: statusWord(g.status) });
  const verified = verifiedFact(g);
  if (verified) facts.push(verified);
  return facts;
}

export function grantWhoItIsFor(g: AuGrantRow): string[] {
  const out: string[] = [];
  const stages = stageNouns(g.stage_tags);
  const sectors = industryNouns(g.industry_tags);
  const scope = g.state === "national" ? "Australian startups in any state" : `${stateLabel(g.state)} startups`;
  if (stages.length && sectors.length) {
    out.push(`${g.name} is aimed at ${scope} — ${joinAnd(stages)} — working in ${joinAnd(sectors)}.`);
  } else if (stages.length) {
    out.push(`${g.name} is open to most ${scope} at the ${joinAnd(g.stage_tags.map((t) => stageLabel(t).toLowerCase()))} stage${g.stage_tags.length > 1 ? "s" : ""} — ${joinAnd(stages)} — with no sector restriction listed.`);
  } else if (sectors.length) {
    out.push(`${g.name} is for ${scope} working in ${joinAnd(sectors)}; no stage restriction is listed.`);
  } else {
    out.push(`${g.name} lists no stage or sector restriction, so it is open to most ${scope}.`);
  }
  const ladder = stageExplainerSentence(g.stage_tags);
  if (ladder) out.push(ladder);
  if (g.demographic_tags.length) out.push(`It is reserved for ${joinAnd(demographicNouns(g.demographic_tags))}.`);
  const gates = gateSentence(eligibilityRequirements(g.eligibility));
  if (gates) out.push(gates);
  if (g.superseded_by) out.push(`This scheme has been superseded by ${g.superseded_by}; it stays listed for reference.`);
  return out;
}

export function grantWhatYouGet(g: AuGrantRow): string[] {
  const out: string[] = [];
  const explainer = FUNDING_TYPE_EXPLAINERS[g.funding_type];
  if (explainer) out.push(explainer);
  if (g.summary) out.push(sentence(g.summary));
  const hasAmount = (typeof g.amount_min_aud === "number" && g.amount_min_aud > 0) || (typeof g.amount_max_aud === "number" && g.amount_max_aud > 0);
  const range = formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note);
  if (hasAmount) {
    out.push(`${g.name} provides ${range}${g.amount_note ? ` (${g.amount_note})` : ""}.`);
  } else if (g.amount_note) {
    out.push(`The amount is described as: ${g.amount_note}.`);
  }
  if (g.co_contribution) {
    out.push(
      NO_EQUITY.test(g.co_contribution)
        ? "No co-contribution is required."
        : `A co-contribution is required — listed as "${g.co_contribution}" — so budget for your share before you apply.`,
    );
  }
  if (g.evidence_needed.length) {
    out.push(`The money is assessed against evidence of ${joinAnd(g.evidence_needed.map((e) => e.replace(/\.$/, "").toLowerCase()))}, which tells you what it is expected to fund.`);
  }
  return out;
}

export function grantHowToApply(g: AuGrantRow): HowToApplySection {
  const steps: string[] = [];
  if (g.application_window && WINDOW_EXPLAINERS[g.application_window]) steps.push(WINDOW_EXPLAINERS[g.application_window]);
  if (parseLooseDate(g.opens_at) && parseLooseDate(g.closes_at)) {
    steps.push(`The current round opens ${formatDateAu(g.opens_at, g.state)} and closes ${formatDateAu(g.closes_at, g.state)}.`);
  } else if (parseLooseDate(g.closes_at)) {
    steps.push(`The current round closes ${formatDateAu(g.closes_at, g.state)}.`);
  } else if (parseLooseDate(g.opens_at)) {
    steps.push(`The next round opens ${formatDateAu(g.opens_at, g.state)}.`);
  }
  if (g.lodgement_deadline) steps.push(`Lodgement deadline: ${g.lodgement_deadline}.`);
  if (g.next_round_note) steps.push(`Next round: ${sentence(g.next_round_note)}`);
  const reqs = eligibilityRequirements(g.eligibility);
  if (reqs.length) steps.push(`Confirm you pass the recorded gates first: ${joinAnd(reqs.map((r) => r.label.toLowerCase()))}.`);
  steps.push(`Apply on the official ${levelLabel(g.level).toLowerCase()} portal — BlockID lists the ${fundingTypeLabel(g.funding_type).toLowerCase()} but never lodges applications.`);
  const prompts = (g.application_prompts ?? []).slice(0, PROMPT_LIMIT).map((q) => q.question);
  return { intro: g.how_to_apply, steps, evidence: [...g.evidence_needed], prompts, officialUrl: g.official_url };
}

export function grantTiming(g: AuGrantRow, today: Date = new Date()): TimingSection {
  const rolling = g.application_window === "rolling";
  const verdict = deadlineStatus(
    { opens_at: parseLooseDate(g.opens_at) ? g.opens_at : null, closes_at: parseLooseDate(g.closes_at) ? g.closes_at : null, rolling: rolling || undefined, catalogue_status: g.status },
    today,
  );
  const sentences: string[] = [];
  const { abbr } = timeZoneForState(g.state);
  if (parseLooseDate(g.closes_at)) {
    const closesIn = daysUntil(g.closes_at, today, "end");
    sentences.push(
      closesIn !== null && closesIn < 0
        ? `The last recorded round closed ${formatDateAu(g.closes_at, g.state)}.`
        : `Applications close ${formatDateAu(g.closes_at, g.state)}${closesIn !== null ? ` — ${closesIn === 0 ? "today" : `in ${closesIn} day${closesIn === 1 ? "" : "s"}`}` : ""}; deadlines are calendar days in ${abbr}.`,
    );
  }
  if (parseLooseDate(g.opens_at) && !parseLooseDate(g.closes_at)) sentences.push(`Applications open ${formatDateAu(g.opens_at, g.state)}.`);
  if (g.application_window && WINDOW_EXPLAINERS[g.application_window]) sentences.push(WINDOW_EXPLAINERS[g.application_window]);
  if (g.next_round_note) sentences.push(sentence(g.next_round_note));
  if (g.lodgement_deadline) sentences.push(`Lodgement deadline: ${g.lodgement_deadline}.`);
  if (g.status === "closed" && !g.next_round_note) sentences.push("The listing is marked closed — do not apply until the agency announces the next round.");
  if (g.status === "paused" && !g.next_round_note) sentences.push("The listing is marked paused — the next round has not been announced.");
  if (sentences.length === 0) sentences.push(`${verdict.label}.`);
  sentences.push(STATUS_EXPLAINERS[g.status]);
  if (g.last_verified_at) sentences.push(`Status was last verified on ${formatDateAu(g.last_verified_at, g.state, { withZone: false })}; confirm on the official portal before you apply.`);
  return { status: verdict.status, label: verdict.label, sentences };
}

/** Top grants for the same state + stage via the matcher, self excluded. */
export function relatedGrants(g: AuGrantRow, grants: ReadonlyArray<AuGrantRow>, today: Date = new Date(), limit = RELATED_LIMIT): RelatedLink[] {
  const pool = grants.filter((o) => o.id !== g.id && (g.state === "national" ? o.state === "national" : o.state === "national" || o.state === g.state));
  const matched = matchGrants(neutralProfile(g), pool, today);
  return matched.slice(0, limit).map((m) => grantLink(m.grant));
}

/**
 * Top programs for a grant: the state's capital first (Remote for federal
 * rows), scored by the matcher; then any Remote / Australia-wide program the
 * matcher still admits; then, when the capital has too few rows, the best
 * remaining programs by shared stage / sector tags so the list is never short.
 */
export function relatedProgramsForGrant(g: AuGrantRow, programs: ReadonlyArray<AuProgramRow>, today: Date = new Date(), limit = RELATED_LIMIT): RelatedLink[] {
  const capital: Capital = g.state === "national" ? "Remote" : capitalForState(g.state);
  const profile = neutralProfile(g, capital);
  const picked: AuProgramRow[] = [];
  const seen = new Set<string>();
  const take = (rows: Iterable<AuProgramRow>) => {
    for (const row of rows) {
      if (picked.length >= limit) return;
      if (seen.has(row.id)) continue;
      seen.add(row.id);
      picked.push(row);
    }
  };
  take(matchPrograms({ ...profile, city: capital === "Remote" ? null : capital }, programs.filter((p) => p.capital === capital), today).map((m) => m.program));
  if (picked.length < limit) take(matchPrograms(profile, [...programs], today).map((m) => m.program));
  if (picked.length < limit) {
    take(
      [...programs]
        .map((row) => ({
          row,
          score: row.stage_tags.filter((t) => g.stage_tags.includes(t)).length + 2 * row.industry_tags.filter((t) => g.industry_tags.includes(t)).length,
        }))
        .sort((a, b) => b.score - a.score || statusRank(a.row.status) - statusRank(b.row.status) || a.row.name.localeCompare(b.row.name))
        .map((x) => x.row),
    );
  }
  return picked.map(programLink);
}

function capitalForState(state: AuState): Capital {
  const map: Readonly<Record<AuState, Capital>> = {
    NSW: "Sydney",
    VIC: "Melbourne",
    QLD: "Brisbane",
    WA: "Perth",
    SA: "Adelaide",
    ACT: "Canberra",
    TAS: "Hobart",
    NT: "Darwin",
    national: "Remote",
  };
  return map[state];
}

/** The one funding insight that fits a grant: tax offsets → RDTI / ESIC; loans → venture debt; equity → rounds; else the grants guide. */
export function insightForGrant(g: Pick<AuGrantRow, "id" | "funding_type">): InsightCallout {
  if (g.id === "esic") return FUNDING_INSIGHTS.esic;
  if (g.id === "rdti" || g.funding_type.startsWith("tax_")) return FUNDING_INSIGHTS.rdti;
  if (g.funding_type.startsWith("loan_")) return FUNDING_INSIGHTS.ventureDebt;
  if (g.funding_type === "equity" || g.funding_type === "co_investment") return FUNDING_INSIGHTS.rounds;
  return FUNDING_INSIGHTS.grants;
}

export function grantFaq(g: AuGrantRow): FaqItem[] {
  const items: FaqItem[] = [];
  const hasAmount = (typeof g.amount_min_aud === "number" && g.amount_min_aud > 0) || (typeof g.amount_max_aud === "number" && g.amount_max_aud > 0);
  if (hasAmount || g.amount_note) {
    items.push({
      question: `How much does ${g.name} provide?`,
      answer: hasAmount
        ? `${formatAudRange(g.amount_min_aud, g.amount_max_aud, g.amount_note)}${g.amount_note ? ` — ${g.amount_note}` : ""}.`
        : `${g.amount_note}.`,
    });
  }
  if (g.co_contribution) {
    items.push({
      question: `Do I need to co-contribute to ${g.name}?`,
      answer: NO_EQUITY.test(g.co_contribution) ? "No — the listing records no co-contribution." : `Yes — the listed co-contribution is "${g.co_contribution}".`,
    });
  }
  if (parseLooseDate(g.closes_at) || g.next_round_note || g.application_window) {
    const parts: string[] = [];
    if (parseLooseDate(g.closes_at)) parts.push(`The current round closes ${formatDateAu(g.closes_at, g.state)}`);
    if (g.application_window && WINDOW_EXPLAINERS[g.application_window]) parts.push(WINDOW_EXPLAINERS[g.application_window].replace(/\.$/, ""));
    if (g.next_round_note) parts.push(g.next_round_note.replace(/\.$/, ""));
    items.push({ question: `When does ${g.name} close?`, answer: `${parts.join(". ")}.` });
  }
  if (g.provider) {
    items.push({
      question: `Who runs ${g.name}?`,
      answer: `${g.provider} — a ${levelLabel(g.level).toLowerCase()} ${fundingTypeLabel(g.funding_type).toLowerCase()}${g.state === "national" ? " available Australia-wide" : ` for ${stateLabel(g.state)}`}.`,
    });
  }
  if (g.evidence_needed.length) {
    items.push({ question: `What evidence do I need for ${g.name}?`, answer: `${joinAnd(g.evidence_needed.map((e) => e.replace(/\.$/, "")))}.` });
  }
  return items.slice(0, FAQ_MAX);
}

export function enrichGrant(g: AuGrantRow, ctx: EnrichContext): GrantEnrichment {
  const today = ctx.today ?? new Date();
  const faq = grantFaq(g);
  return {
    kind: "grant",
    atAGlance: grantAtAGlance(g),
    whoItIsFor: grantWhoItIsFor(g),
    whatYouGet: grantWhatYouGet(g),
    howToApply: grantHowToApply(g),
    timing: grantTiming(g, today),
    related: {
      programs: relatedProgramsForGrant(g, ctx.programs, today),
      grants: relatedGrants(g, ctx.grants, today),
      insight: insightForGrant(g),
      funding: { ...FUNDING_CTA },
      stateGrants: { href: grantsStatePath(g.state), label: g.state === "national" ? "All federal grants" : `All ${stateLabel(g.state)} grants` },
    },
    faq,
    faqJsonLd: buildFaqJsonLd(faq),
  };
}

// ─── FAQ JSON-LD ─────────────────────────────────────────────────────────────

/** `FAQPage` only when at least two Q&As render — schema without visible content repeats S8-A finding 6. */
export function buildFaqJsonLd(items: ReadonlyArray<FaqItem>): Record<string, unknown> | null {
  if (items.length < FAQ_JSON_LD_MIN) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((q) => ({
      "@type": "Question",
      name: q.question,
      acceptedAnswer: { "@type": "Answer", text: q.answer },
    })),
  };
}

// ─── Word count (used by the tests and the SEO report) ──────────────────────

/** Words across every string the enrichment renders (facts, sentences, FAQ, related names). */
export function enrichmentWordCount(e: ProgramEnrichment | GrantEnrichment): number {
  const parts: string[] = [];
  for (const f of e.atAGlance) parts.push(f.label, f.value);
  parts.push(...e.whoItIsFor, ...e.whatYouGet, ...e.howToApply.steps, ...e.howToApply.evidence, ...e.howToApply.prompts, ...e.timing.sentences);
  if (e.howToApply.intro) parts.push(e.howToApply.intro);
  for (const q of e.faq) parts.push(q.question, q.answer);
  for (const r of [...e.related.programs, ...e.related.grants]) parts.push(r.name, r.meta);
  return parts
    .join(" ")
    .split(/\s+/)
    .filter((w) => /[A-Za-z0-9]/.test(w)).length;
}

