// Wave 25 Phase B — public Sample Trusted Business Report.
//
// Anonymous preview of the 10-page TBR using a fictional AU SaaS startup so
// visitors can see the deliverable before signing up. Not authenticated.

import type { Metadata } from "next";
import Link from "next/link";
import { BusinessReportClient } from "@/app/(app)/(founder)/workspace/business-report/business-report-client";

export const dynamic = "force-static";
export const revalidate = 3600;

const TITLE = "Sample Business Report — BlockID SVI™";
const DESCRIPTION =
  "Preview a full 10-page BlockID Trusted Business Report — 8 SVI dimensions, 13 investor criteria, valuation range, risk register, and improvement roadmap for a sample AU SaaS startup.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "startup business report australia",
    "SVI sample report",
    "investor ready score example",
    "startup valuation report australia",
    "au saas startup benchmark",
    "startup pitch deck analysis sample",
  ],
  alternates: {
    canonical: "https://blockid.au/sample-business-report",
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "article",
    url: "https://blockid.au/sample-business-report",
    siteName: "BlockID",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
  robots: { index: true, follow: true },
};

// ── Fictional canonical AU SaaS startup ────────────────────────────────────
// "Corella HR" is a made-up name (not a real Australian company). This data
// exists solely to demonstrate the report layout — do not treat as real.

const SAMPLE_DIM_STATES = {
  ftv: {
    status: "complete",
    score: 68,
    priority: "medium" as const,
    marketBenchmark:
      "AU seed median FTV: 58. Top-quartile teams show 2+ prior exits or 5+ years combined domain experience.",
    insights: [
      "Two co-founders with combined 12 years in HR-tech and payroll domain.",
      "Technical co-founder missing — pitch mentions ‘hiring CTO Q2’ but no offer signed.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"Ex-Xero payroll PM\" → domain fit for AU SMB HR pain point\n- \"12 years combined HR-tech\" → credible operator team\n\n**Gaps (what's missing or unverifiable):**\n- No signed CTO — technical execution risk for a product-led motion\n- No advisor board listed → weak investor signal at seed\n\n**Next Step (concrete, this-week action):**\n- Convert CTO conversations to a signed offer + LOI before next raise conversation",
  },
  mpc: {
    status: "complete",
    score: 71,
    priority: "low" as const,
    marketBenchmark:
      "AU seed median MPC: 52. AU HR-tech TAM ~A$1.2B (ABS 2025 wages data), SMB segment growing 8% YoY.",
    insights: [
      "AU SMB HR-tech TAM sized at A$1.2B with 220K businesses in target segment.",
      "Problem well-articulated — ‘payroll compliance eats 6 hrs/week for SMB owners’.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"TAM A$1.2B AU SMB HR\" → sized against ABS 2025 wages data\n- \"Payroll compliance 6 hrs/week\" → quantified pain point\n\n**Gaps (what's missing or unverifiable):**\n- SAM/SOM not explicitly stated — hard to model realistic Year-3 revenue\n- No competitor slide → cannot assess wedge vs Employment Hero / Deputy\n\n**Next Step (concrete, this-week action):**\n- Add a 3-tier TAM/SAM/SOM slide with citations and a competitive-matrix box",
  },
  ptd: {
    status: "complete",
    score: 55,
    priority: "medium" as const,
    marketBenchmark:
      "AU seed median PTD: 55. Investors expect working MVP with ≥1 paying pilot at this stage.",
    insights: [
      "MVP live on production — 3 SMB pilots using core payroll module.",
      "No API integrations shown for Xero/MYOB — key AU accounting stack.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"3 SMB pilots on production MVP\" → past prototype stage\n- \"Modular payroll engine\" → indicates thoughtful architecture\n\n**Gaps (what's missing or unverifiable):**\n- No Xero / MYOB integration slide → 85% of AU SMB use one of these\n- No mention of ATO STP Phase 2 compliance readiness\n\n**Next Step (concrete, this-week action):**\n- Ship Xero OAuth integration + write STP 2 compliance one-pager",
  },
  tre: {
    status: "complete",
    score: 48,
    priority: "high" as const,
    marketBenchmark:
      "AU seed median TRE: 42. Top-quartile shows ≥A$5K MRR + ≥15% MoM growth over 3 months.",
    insights: [
      "MRR A$2.4K across 3 paying pilots — below seed median A$5K.",
      "No MoM growth trend disclosed — hard to project runway or trajectory.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"3 paying pilots at A$800/mo\" → beyond LOI stage\n- \"85% pilot activation\" → strong onboarding signal\n\n**Gaps (what's missing or unverifiable):**\n- MRR growth chart absent → cannot verify traction claim\n- No churn or NPS metrics → retention risk unquantified\n\n**Next Step (concrete, this-week action):**\n- Add 3-month MRR chart + churn + NPS to the traction slide",
  },
  cgh: {
    status: "complete",
    score: 62,
    priority: "medium" as const,
    marketBenchmark:
      "AU seed median CGH: 48. Clean cap tables with vested founder shares expected at seed.",
    insights: [
      "Founders on 4-year vesting with 1-year cliff — clean AU seed structure.",
      "ESOP pool at 8% — below AU seed median 10-12%.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"4/1 vesting, ESOP 8%\" → clean, VC-standard cap table\n- \"No angel round yet\" → 100% founder-owned pre-seed\n\n**Gaps (what's missing or unverifiable):**\n- ESOP below AU seed norm 10-12% → will need topping up at Series A\n- No advisor grants visible — potential later dilution surprise\n\n**Next Step (concrete, this-week action):**\n- Increase ESOP to 12% before priced round + document advisor grants",
  },
  iri: {
    status: "complete",
    score: 58,
    priority: "medium" as const,
    marketBenchmark:
      "AU seed median IRI: 45. Investor-ready decks show data room + 12-month plan + team bios.",
    insights: [
      "Pitch deck present (15 slides) and covers most seed-stage sections.",
      "No accessible data room link in the deck — investor friction.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"15-slide deck with financials\" → sufficient for seed conversations\n- \"12-month use of funds slide\" → clear runway plan\n\n**Gaps (what's missing or unverifiable):**\n- No data room link → investors will bounce during DD\n- No prior raise history shown → uncertain fundraising readiness\n\n**Next Step (concrete, this-week action):**\n- Stand up a Notion / DocSend data room and add the URL to the deck",
  },
  lco: {
    status: "complete",
    score: 60,
    priority: "medium" as const,
    marketBenchmark:
      "AU seed median LCO: 50. ASIC registered Pty Ltd with founder shareholders agreement expected.",
    insights: [
      "Registered as AU Pty Ltd with ABN — meets AU incorporation baseline.",
      "No IP assignment agreements mentioned for contractor code contributors.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"AU Pty Ltd, ABN active\" → correct structure for AU VC investment\n- \"Privacy Policy live on site\" → basic APP compliance stated\n\n**Gaps (what's missing or unverifiable):**\n- No IP assignment for 2 disclosed contractors → assignability risk at DD\n- No trade mark filing mentioned for brand name\n\n**Next Step (concrete, this-week action):**\n- Sign IP assignment deeds with all contractors + file IP Australia TM application",
  },
  svm: {
    status: "complete",
    score: 51,
    priority: "medium" as const,
    marketBenchmark:
      "AU seed median SVM: 47. Investors want a defensibility hypothesis, not necessarily a moat yet.",
    insights: [
      "Vision slide present but generic — ‘be the go-to HR platform for AU SMBs’.",
      "No defensibility narrative — data network effects, switching costs, or brand not articulated.",
    ],
    markdown:
      "**Strengths (with deck evidence):**\n- \"Vision: go-to HR platform for AU SMB\" → clear category ambition\n- \"AU-first compliance\" → positioning wedge vs global players\n\n**Gaps (what's missing or unverifiable):**\n- No moat / defensibility slide → investor pattern-match fails at Series A\n- No exit optionality mentioned (strategic acquirers, IPO comps)\n\n**Next Step (concrete, this-week action):**\n- Add a 3-vector moat slide: AU compliance data, workflow lock-in, brand",
  },
};

const SAMPLE_CRITERION_STATES = [
  { key: "idea", title: "Idea & Innovation", primary_dimension: "mpc", weight: 8, score: 65, verdict: "Solid AU SMB HR-tech thesis with a real, quantified pain point (6 hrs/week payroll compliance). Differentiation vs Employment Hero / Deputy is implied but not explicitly stated.", strengths: ["Quantified pain point with hours-per-week data", "AU-first compliance angle is a genuine wedge"], gaps: ["Competitor matrix missing — cannot assess wedge width", "Innovation vector not articulated (workflow vs data)"], next_action: "Add a competitor matrix slide with the wedge hypothesis explicit." },
  { key: "market", title: "Market Opportunity", primary_dimension: "mpc", weight: 10, score: 70, verdict: "TAM A$1.2B is credibly sourced (ABS 2025). SAM and SOM not stated, limiting Year-3 revenue modelling.", strengths: ["TAM sized against ABS 2025 wages data", "220K SMB target segment quantified"], gaps: ["SAM/SOM missing — investor cannot back-into revenue plan", "No timing catalyst (regulatory / macro) mentioned"], next_action: "Add 3-tier TAM/SAM/SOM slide with cited assumptions and a timing catalyst." },
  { key: "founder_profile", title: "Founder Profile", primary_dimension: "ftv", weight: 8, score: 68, verdict: "Two co-founders with 12 years combined HR-tech domain experience including ex-Xero payroll PM background. Technical co-founder gap is the main risk.", strengths: ["Ex-Xero payroll PM = strong domain-fit", "12 years combined HR-tech operator experience"], gaps: ["No signed technical co-founder yet", "No advisor board listed on the deck"], next_action: "Convert the CTO conversation to a signed offer and add 2 industry advisors." },
  { key: "code_git", title: "Code & Git Repository", primary_dimension: "ptd", weight: 6, score: 50, verdict: "MVP is live in production with 3 paying pilots, indicating a working codebase, but no repo-quality signals (commit cadence, tests, CI) are disclosed.", strengths: ["Production MVP with 3 paying pilots proves shipping capability", "Modular payroll engine suggests architectural discipline"], gaps: ["No GitHub / GitLab link disclosed to investors", "No test coverage or CI/CD posture mentioned"], next_action: "Add a ‘Engineering hygiene’ mini-slide: repo link, coverage %, deploy frequency." },
  { key: "website", title: "Website & Digital Presence", primary_dimension: "ptd", weight: 5, score: 55, verdict: "Product website exists with a privacy policy. No SEO / paid signal about acquisition efficiency visible in the pitch.", strengths: ["Live product website with basic APP compliance", "Clear product positioning on landing page"], gaps: ["No SEO / organic traffic signal in the deck", "No case-study or pilot logos featured"], next_action: "Publish 2 pilot case studies + add SEO landing pages for 3 AU compliance terms." },
  { key: "team", title: "Team Composition", primary_dimension: "ftv", weight: 7, score: 62, verdict: "Founding team is domain-heavy but engineering-light. Hiring plan implies CTO Q2 but no signed offer yet.", strengths: ["Domain-heavy founding team with complementary skills", "Clear hiring plan for CTO + 2 engineers"], gaps: ["Engineering leadership gap = execution risk", "No design or GTM hire in the plan"], next_action: "Prioritise signed CTO offer and add a Head of Growth to the 12-month plan." },
  { key: "customer_size", title: "Customer Base & Traction", primary_dimension: "tre", weight: 10, score: 50, verdict: "3 paying pilots at A$800/mo = A$2.4K MRR. Below AU seed median A$5K but growth trend is absent from the deck.", strengths: ["3 pilots activated (85% activation)", "Paying customers past LOI stage"], gaps: ["MRR A$2.4K below AU seed median A$5K", "No MoM growth chart or retention data"], next_action: "Add a 3-month MRR + retention chart to the traction slide before next investor conversation." },
  { key: "gtm_strategy", title: "Go-to-Market Strategy", primary_dimension: "tre", weight: 8, score: 55, verdict: "GTM described as ‘direct sales to AU SMB via LinkedIn outbound’ — reasonable at seed but no CAC / conversion metrics are shown.", strengths: ["Clear channel focus (LinkedIn outbound to AU SMB owners)", "Founder-led sales at seed = expected motion"], gaps: ["No CAC or SQL-to-paid conversion rate disclosed", "No partnership / channel strategy for scale"], next_action: "Compute CAC + LTV from pilot cohort and add a partnership slide (accountants, brokers)." },
  { key: "documents", title: "Key Documents", primary_dimension: "iri", weight: 6, score: 60, verdict: "15-slide pitch deck covers most seed sections including financials and use-of-funds. Business plan and financial model not confirmed accessible.", strengths: ["15-slide deck with financials and 12-month plan", "Use-of-funds slide is specific"], gaps: ["No linked financial model file", "No 3-year P&L projection shown"], next_action: "Publish a link to the financial model in the data room + attach 3-year P&L in the deck." },
  { key: "dataroom", title: "Data Room", primary_dimension: "iri", weight: 5, score: 40, verdict: "No accessible data room link in the pitch deck. This is a friction point that will slow investor DD.", strengths: ["Deck is investor-facing and self-contained", "Founders responsive to email follow-up"], gaps: ["No data room link in the deck at all", "No prior-raise history or cap-table snapshot"], next_action: "Stand up a Notion / DocSend data room this week and add the URL to slide 15." },
  { key: "team_structure", title: "Team Structure & Governance", primary_dimension: "cgh", weight: 7, score: 60, verdict: "Clean 4/1 vesting on both founders. ESOP at 8% is below AU seed norm 10–12% and will need topping up at Series A.", strengths: ["4-year vest / 1-year cliff on both founders", "AU Pty Ltd structure with clean cap table"], gaps: ["ESOP 8% is below AU seed norm 10–12%", "No advisor grants documented"], next_action: "Increase ESOP pool to 12% before priced round and document all advisor grants." },
  { key: "roadmap", title: "Product Roadmap", primary_dimension: "ptd", weight: 8, score: 58, verdict: "Roadmap slide shows Xero integration Q2 and STP 2 compliance Q3 — the two right AU-priority items but no post-Q4 vision.", strengths: ["Xero integration prioritised for Q2", "STP 2 compliance targeted for Q3"], gaps: ["No product vision beyond Q4 shown", "No API / platform strategy articulated"], next_action: "Extend roadmap to a 24-month view and add an API/platform layer for Year-2." },
  { key: "revenue", title: "Revenue & Unit Economics", primary_dimension: "tre", weight: 12, score: 45, verdict: "A$2.4K MRR at A$800/mo per customer with 85% pilot activation. Gross margin and CAC not disclosed — hard to model unit economics.", strengths: ["Paying customers at A$800/mo (real ACV signal)", "85% pilot activation indicates fit"], gaps: ["No gross-margin or CAC data disclosed", "MRR below AU seed median for the stage"], next_action: "Compute and publish gross margin, CAC, payback period from pilot cohort data." },
];

// Kept as a plain object (not `as const`) so it satisfies the mutable
// PersistedState shape the client expects. Cast at the call-site via
// the component prop signature.
const SAMPLE_DATA = {
  savedAt: Date.now(),
  dimStates: SAMPLE_DIM_STATES as unknown as Record<string, {
    status: string;
    score: number | null;
    markdown: string | null;
    insights: string[];
    priority: "high" | "medium" | "low" | null;
    marketBenchmark: string | null;
  }>,
  criterionStates: SAMPLE_CRITERION_STATES,
  completed: 8,
  total: 8,
  totalMs: 42_000,
  done: true,
  industry: "SaaS" as string | null,
  stage: "Seed" as string | null,
};

export default function SampleBusinessReportPage() {
  return (
    <div className="min-h-screen bg-white dark:bg-ink-950">
      {/* Sample banner — always visible, prompts sign-up */}
      <div className="w-full bg-gradient-to-r from-brand-600 to-brand-500 text-white">
        <div className="mx-auto max-w-7xl px-4 md:px-6 py-3 flex items-center gap-4 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
            Sample Report
          </span>
          <p className="text-sm">
            This is a fictional AU SaaS startup used to preview the 10-page report.
          </p>
          <Link
            href="/score"
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white/95 hover:bg-white text-brand-700 text-sm font-semibold px-3 py-1.5"
          >
            Run yours in 5 min →
          </Link>
        </div>
      </div>
      <BusinessReportClient
        projectId="sample"
        initialData={SAMPLE_DATA}
        shareToken={undefined}
        pdfMode={false}
      />
    </div>
  );
}
