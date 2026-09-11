// Public sample Money Finder report — the data behind /funding/report/demo
// (S7-B). Visitors could not see what the A$3 report looks like and the
// ProductHunt kit had nothing to screenshot, so this builds ONE fixed report
// from the seed catalogue with the real matcher and the template narrative
// (no AI call, no DB, no Stripe) — the output is a pure function of the two
// seed files, so it never changes between builds or requests.
//
//   buildDemoFundingReport()  → PublicFundingReport-shaped object with
//                               id "demo", status "ready", is_owner false
//   DEMO_INTAKE / DEMO_TODAY  → the fixed answers + the fixed "today"
//
// Deliberately NOT imported from any "use client" entry (grant-advisor →
// narrative → ai-client is server-only); the page is a server component.
// Colocated tests: demo-report.test.ts.

import grantsSeed from "../../../content/data/grants-au.seed.json";
import programsSeed from "../../../content/data/programs-au.seed.json";
import {
  FUNDING_DISCLAIMER,
  buildTimeline,
  matchGrants,
  matchPrograms,
  previewFundingReport,
} from "@/lib/agents/grant-advisor";
import { templateNarrative } from "@/lib/agents/grant-advisor-narrative";
import { catalogueForIntake } from "./preview";
import { intakeToGrantProfile, type FundingIntake } from "./intake";
import { mapGrantSeeds, mapProgramSeeds, type AuGrantRow, type AuProgramRow } from "./seed-map";
import type { FundingReportMeta, PublicFundingReport } from "./reports";

/** The three answers the sample was built from — shown verbatim in the header. */
export const DEMO_INTAKE: FundingIntake = Object.freeze({
  description: "Soil-moisture sensors and an app that tell grain farmers when to irrigate",
  state: "NSW",
  stage: "mvp",
  industry_tags: ["agtech_food"],
}) as FundingIntake;

/** Fixed "today" (the seed's research date) so the timeline and deadline chips are stable. */
export const DEMO_TODAY = "2026-09-10";
export const DEMO_GENERATED_AT = `${DEMO_TODAY}T00:00:00.000Z`;
export const DEMO_REPORT_ID = "demo";
export const DEMO_REPORT_PATH = "/funding/report/demo";
/** Where the sample's CTA sends the founder. */
export const DEMO_CTA_HREF = "/funding?intent=money";
export const DEMO_CTA_LABEL = "Build mine for A$3";
export const DEMO_BANNER = "Sample report — a real one is built from your answers";

const SITE_URL = "https://blockid.au";
export const DEMO_CANONICAL = `${SITE_URL}${DEMO_REPORT_PATH}`;
export const DEMO_TITLE = "Sample Money Finder report — what A$3 buys an Australian founder";
export const DEMO_DESCRIPTION =
  "A full sample of the BlockID Money Finder report: ranked grants with eligibility checklists and A$ estimates, matched accelerators and programs, and a 12-month action timeline for an NSW agtech startup at MVP stage. Build yours from three answers for A$3.";

/** Minimal schema.org Article for the sample (pure — the page wraps it in FundingJsonLd with the CSP nonce). */
export function demoReportJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: DEMO_TITLE,
    description: DEMO_DESCRIPTION,
    url: DEMO_CANONICAL,
    datePublished: DEMO_GENERATED_AT,
    dateModified: DEMO_GENERATED_AT,
    isAccessibleForFree: true,
    author: { "@type": "Organization", name: "BlockID.au", url: SITE_URL },
    publisher: {
      "@type": "Organization",
      name: "BlockID.au",
      logo: { "@type": "ImageObject", url: `${SITE_URL}/images/logo-transparent.png` },
    },
  };
}

function seedCatalogue(): { grants: AuGrantRow[]; programs: AuProgramRow[] } {
  const grants = mapGrantSeeds((grantsSeed as { grants: unknown[] }).grants).filter((g) => !g.exclude_from_matching);
  const programs = mapProgramSeeds((programsSeed as { programs: unknown[] }).programs);
  return { grants, programs };
}

/**
 * The template narrative cites rows as `Name [ref_id]` so the name guard can
 * audit an LLM draft. The sample is never audited, so drop the bracketed ids
 * for readability — the names and sections are untouched.
 */
export function stripCitationIds(md: string): string {
  return md.replace(/ \[[a-z0-9][a-z0-9_.-]*\]/gi, "");
}

let cached: PublicFundingReport | null = null;

/** Deterministic: same seeds → same report. Memoised per process. */
export function buildDemoFundingReport(): PublicFundingReport {
  if (cached) return cached;
  const today = new Date(`${DEMO_TODAY}T00:00:00Z`);
  const profile = intakeToGrantProfile(DEMO_INTAKE);
  const all = seedCatalogue();
  const { grants, programs } = catalogueForIntake(DEMO_INTAKE, all.grants, all.programs);
  const g = matchGrants(profile, grants, today);
  const p = matchPrograms(profile, programs, today);
  const timeline = buildTimeline(profile, g, p, today);
  const narrative = templateNarrative(profile, {
    grants: g.slice(0, 8),
    programs: p.slice(0, 8),
    timeline,
    totals: { grants: g.length, programs: p.length },
  });
  const meta: FundingReportMeta = {
    today: DEMO_TODAY,
    generated_at: DEMO_GENERATED_AT,
    summary: previewFundingReport(profile, grants, programs, today),
    tax: {},
    actions: narrative.actions.map(stripCitationIds),
    narrative_source: "template",
    excluded: { grants: grants.length - g.length, programs: programs.length - p.length },
    disclaimer: FUNDING_DISCLAIMER,
  };
  cached = {
    id: DEMO_REPORT_ID,
    status: "ready",
    created_at: DEMO_GENERATED_AT,
    paid_via: null,
    intake: DEMO_INTAKE,
    grants: g,
    programs: p,
    timeline,
    narrative_md: stripCitationIds(narrative.narrative_md),
    meta,
    disclaimer: FUNDING_DISCLAIMER,
    is_owner: false,
    project_id: null,
  };
  return cached;
}
