// SafetyCulture showcase fixture — first-class demo walkthrough data seed.
//
// Same shape as web/src/lib/showcase/atlassian/fixture.ts. Pure typed TS
// module — no DB, no I/O.
//
// Primary sources:
//   - Wikipedia (SafetyCulture)   https://en.wikipedia.org/wiki/SafetyCulture
//   - SafetyCulture press         https://safetyculture.com/press/
//   - AFR profiles                Luke Anear founder profile pieces
//   - Crunchbase                  https://www.crunchbase.com/organization/safetyculture
//
// SafetyCulture is still private (as of 2026). Regional-Aussie founder
// story (Townsville) — atypical for AU tech, which clusters in Syd/Melb.
// 12-year bootstrap arc before Series A in 2016. Softbank round 2022.

import type {
  AtlassianDemo,
  AtlassianMilestone,
  PhaseSnapshot,
  SVIScore,
  AgentReport,
  DataRoomRow,
  ValuationSnapshot,
} from "../atlassian/fixture";

export type SafetyCultureMilestone = AtlassianMilestone;
export type SafetyCultureDemo = AtlassianDemo;

// ── Citation URL constants ─────────────────────────────────────────────────

const SRC_WIKI = "https://en.wikipedia.org/wiki/SafetyCulture";
const SRC_PRESS = "https://safetyculture.com/press/";
const SRC_CB = "https://www.crunchbase.com/organization/safetyculture";
const SRC_TIGER =
  "https://safetyculture.com/press/safetyculture-raises-us70m-series-b/";
const SRC_INSIGHT =
  "https://safetyculture.com/press/safetyculture-raises-us99m-series-c/";
const SRC_SOFTBANK =
  "https://safetyculture.com/press/safetyculture-raises-us34m-softbank/";
const SRC_ABR = "https://abr.business.gov.au/"; // SafetyCulture Pty Ltd on ABR

// SafetyCulture Pty Ltd — ABN 42 145 671 175 (ABR).
export const SAFETYCULTURE_ABN = "42 145 671 175";

const PHASE_TO_CANONICAL: Record<string, string> = {
  "1": "idea",
  "2": "validation",
  "3": "validation",
  "4": "mvp_early_revenue",
  "5": "mvp_early_revenue",
  "6": "seed",
  "7": "seed",
  "8": "series_a",
  "9": "series_a",
  "10": "series_b_c",
  "11": "late_stage",
  "12": "public_exit",
};
function stage(s: string): string { return PHASE_TO_CANONICAL[s] ?? "idea"; }

// ── Milestones ─────────────────────────────────────────────────────────────

const MILESTONES: SafetyCultureMilestone[] = [
  {
    year: 2004,
    phaseSlug: "1",
    canonicalStage: stage("1"),
    title: "Founded in Townsville by Luke Anear",
    body:
      "Ex-Private Investigator with a passion for workplace safety builds paper-forms replacement for construction + mining sites. Regional Aussie founder — atypical for a tech company that will eventually raise from Softbank.",
    source: { label: "Wikipedia — SafetyCulture", url: SRC_WIKI },
  },
  {
    year: 2012,
    phaseSlug: "4",
    canonicalStage: stage("4"),
    title: "iAuditor mobile app launched",
    body:
      "Native iOS + Android inspection app replaces paper safety checklists. Freemium model — every free download generates a data trail of what industry / geography / use-case actually adopts. Product-led growth from Day 0.",
    source: { label: "SafetyCulture press", url: SRC_PRESS },
  },
  {
    year: 2016,
    phaseSlug: "10",
    canonicalStage: stage("10"),
    title: "US$23M Series A led by Index Ventures + Blackbird",
    body:
      "Series A after 12 years of bootstrap-and-slow-growth. Uncommon path — most AU tech takes seed inside 2 years. iAuditor's freemium install base was the diligence artefact: real usage across industries, not slide-deck projections.",
    source: { label: "SafetyCulture press", url: SRC_PRESS },
    usd: "$23M",
  },
  {
    year: 2018,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "US$70M Series B led by Tiger Global @ ~US$440M",
    body:
      "HQ shifts to Sydney office alongside Townsville roots — deliberate 'two-city' HR posture. International expansion into US + UK. Tiger's cheque is the signal that iAuditor's install-base metrics passed institutional diligence.",
    source: { label: "SafetyCulture — Series B press", url: SRC_TIGER },
    usd: "$70M",
  },
  {
    year: 2021,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "US$99M Series C led by Insight Partners — unicorn (~US$1.6B)",
    body:
      "First Townsville-founded tech unicorn. Insight Partners' 'ScaleUp' operating model overlays as SafetyCulture crosses 25k paying customers.",
    source: { label: "SafetyCulture — Series C press", url: SRC_INSIGHT },
    usd: "$1.6B valuation",
  },
  {
    year: 2022,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "US$34M Series C extension led by Softbank Vision Fund 2 @ ~US$2.7B",
    body:
      "First Australian round led by Softbank. Growth acceleration into US + APAC. Softbank arrival is often a peak-valuation signal for late-cycle mega-rounds — the 2024 secondary reset would prove that pattern out.",
    source: { label: "SafetyCulture — Softbank press", url: SRC_SOFTBANK },
    usd: "$2.7B valuation",
  },
  {
    year: 2023,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "AI product line launched (Safety Copilot)",
    body:
      "Generative AI features for safety checklist creation + inspection analysis. Partnerships with OpenAI + Anthropic. AI is a wedge back into the freemium install base — the 12-year bootstrap dividend.",
    source: { label: "SafetyCulture press", url: SRC_PRESS },
  },
  {
    year: 2024,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Secondary trades reprice to ~US$2B (down from US$2.7B peak)",
    body:
      "Consistent with global late-stage valuation resets (Klarna, Stripe, Canva). Company remains cash-flow positive per press disclosures — the primary financing intact.",
    source: { label: "Wikipedia — SafetyCulture", url: SRC_WIKI },
    usd: "$2B secondary",
  },
  {
    year: 2025,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "80,000+ paying customers; ~85,000 workplace inspections per day",
    body:
      "Category leadership in workplace inspections / EHS software. iAuditor renamed to 'Operations' as the platform expands beyond safety-only. Product-line adjacency into Training + Heads Up (comms).",
    source: { label: "SafetyCulture press", url: SRC_PRESS },
  },
];

// ── Phase snapshots ────────────────────────────────────────────────────────

const PHASE_SNAPSHOTS: PhaseSnapshot[] = [
  {
    phaseSlug: "1",
    canonicalStage: stage("1"),
    headline: "Solve the pain of a job you've actually done. Anear was a PI in industrial-injury cases.",
    atlassianMoment:
      "Luke Anear investigated workplace injuries as a PI — every SafetyCulture feature request had a real inspector or safety-officer name attached before it shipped.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 28,
  },
  {
    phaseSlug: "2",
    canonicalStage: stage("2"),
    headline: "Interview 50 safety officers before you write code. Paper checklists are the incumbent to beat.",
    atlassianMoment:
      "SafetyCulture's earliest validation was 200+ site visits with mining + construction supervisors — the pain of clipboards, wet paper, and lost inspection records was the wedge.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 34,
  },
  {
    phaseSlug: "3",
    canonicalStage: stage("3"),
    headline: "Size the TAM as 'every worksite that fills in a checklist', not 'every mining company'.",
    atlassianMoment:
      "Anear framed the TAM as 'every worksite on earth' — a 100M+ workplace TAM that made the 'we only serve mining' investor objection irrelevant.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 40,
  },
  {
    phaseSlug: "4",
    canonicalStage: stage("4"),
    headline: "Ship a mobile-first freemium MVP. Enterprise deals come from bottom-up adoption.",
    atlassianMoment:
      "iAuditor (2012) — native iOS + Android inspection app, freemium. Every free install fed a data trail that later became the Series A diligence artefact.",
    sourceUrl: SRC_PRESS,
    sviAtThisPoint: 48,
  },
  {
    phaseSlug: "5",
    canonicalStage: stage("5"),
    headline: "Track adoption by industry code. Freemium works when 5 industries all install for the same reason.",
    atlassianMoment:
      "iAuditor's early free-install base spanned construction, mining, hospitality, aviation, and healthcare — same pain (paper inspections), same fix. That breadth is what made a horizontal Series A pitch defensible.",
    sourceUrl: SRC_PRESS,
    sviAtThisPoint: 55,
  },
  {
    phaseSlug: "6",
    canonicalStage: stage("6"),
    headline: "Convert freemium to paid only when the pain of a lost record is clear. Enterprise wants audit trails.",
    atlassianMoment:
      "SafetyCulture Business tier — team accounts, admin controls, integrations — sells because the buyer needs a defensible audit trail, not because the free tier is crippled.",
    sourceUrl: SRC_PRESS,
    sviAtThisPoint: 62,
  },
  {
    phaseSlug: "7",
    canonicalStage: stage("7"),
    headline: "Inspection-per-day is the leading indicator of retention. Publish it internally weekly.",
    atlassianMoment:
      "By 2025, ~85,000 inspections per day across 80k+ paying customers — the operational cadence became the growth KPI + the retention KPI in one metric.",
    sourceUrl: SRC_PRESS,
    sviAtThisPoint: 70,
  },
  {
    phaseSlug: "8",
    canonicalStage: stage("8"),
    headline: "Regional-founded is a feature, not a bug. Two-city HR posture (Townsville + Sydney) attracts talent both incumbents miss.",
    atlassianMoment:
      "SafetyCulture kept a Townsville engineering base alongside Sydney HQ — the regional office attracted senior engineers who wanted to stay out of Sydney's cost-of-living squeeze.",
    sourceUrl: SRC_PRESS,
    sviAtThisPoint: 74,
  },
  {
    phaseSlug: "9",
    canonicalStage: stage("9"),
    headline: "Prep for institutional diligence 12 months before the raise. Freemium data is the artefact.",
    atlassianMoment:
      "Index Ventures' 2016 diligence was primarily a data-room review of iAuditor's freemium usage — 12 years of install + inspection data was the proof-of-market that a 2-year-old startup could never produce.",
    sourceUrl: SRC_CB,
    sviAtThisPoint: 78,
  },
  {
    phaseSlug: "10",
    canonicalStage: stage("10"),
    headline: "Stack rounds only while the ARR curve keeps compounding. 2016 → 2018 → 2021 → 2022 was earned.",
    atlassianMoment:
      "Series A ($23M) → B ($70M) → C ($99M) → C-ext ($34M) — each round validated by paying-customer count crossing a new threshold. No 'raising because we can' cycles.",
    sourceUrl: SRC_INSIGHT,
    sviAtThisPoint: 82,
  },
  {
    phaseSlug: "11",
    canonicalStage: stage("11"),
    headline: "Softbank is a peak-signal. Take the money but plan for the reset.",
    atlassianMoment:
      "Softbank's 2022 US$34M @ US$2.7B was widely read as a peak-cycle indicator. SafetyCulture's 2024 secondary reset to US$2B validated that read while preserving cash-flow positivity on the operating side.",
    sourceUrl: SRC_SOFTBANK,
    sviAtThisPoint: 85,
  },
  {
    phaseSlug: "12",
    canonicalStage: stage("12"),
    headline: "IPO isn't obligatory. Cash-flow positive + private is a durable model at $2B scale.",
    atlassianMoment:
      "SafetyCulture stays private past decacorn-adjacent scale — the 'cash-flow positive' disclosure removes the IPO forcing function that pressures other private unicorns.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 87,
  },
];

// ── SVI scores ────────────────────────────────────────────────────────────

const SVI_SCORES: SVIScore[] = [
  { criterion: "idea", score0to100: 88, rationale: "Digital inspection replaces paper — obvious in hindsight, but requires mobile + camera + cloud all being cheap." },
  { criterion: "market", score0to100: 87, rationale: "Every worksite on earth is TAM; ~85k inspections/day (2025) is <0.1% of global daily inspections." },
  { criterion: "founder_profile", score0to100: 91, rationale: "Anear's PI background = domain match to safety-inspector buyer. Non-tech founder → hired CTO successfully." },
  { criterion: "code_git", score0to100: 82, rationale: "Native iOS + Android + web + offline-first sync. Complex but well-executed mobile architecture." },
  { criterion: "website", score0to100: 88, rationale: "safetyculture.com — freemium download funnel + paid-tier upsell + template library as SEO surface." },
  { criterion: "team", score0to100: 87, rationale: "1,000+ employees across Townsville + Sydney + Manchester + Kansas City. Two-city AU HR posture." },
  { criterion: "customer_size", score0to100: 92, rationale: "80,000+ paying customers (2025 press); Fortune 500 industrial + retail buyers." },
  { criterion: "gtm_strategy", score0to100: 90, rationale: "Bottom-up freemium via iAuditor mobile install → team account → enterprise contract. PLG done right." },
  { criterion: "documents", score0to100: 78, rationale: "Private company; press releases + Softbank-round SPA are the primary disclosure surface." },
  { criterion: "dataroom", score0to100: 83, rationale: "Passed diligence for Index (2016), Tiger (2018), Insight (2021), Softbank (2022) — 4 institutional rounds without a public restart." },
  { criterion: "team_structure", score0to100: 85, rationale: "Independent board additions post-2018; founder still CEO — no forced hand-off." },
  { criterion: "roadmap", score0to100: 87, rationale: "iAuditor (2012) → Team (2018) → Training + Heads Up + Sensors (2020+) → AI Safety Copilot (2023). Coherent stack." },
  { criterion: "revenue", score0to100: 88, rationale: "80k+ paying customers, cash-flow positive per press disclosures. ARR est ~US$300M+." },
];

// ── Agent reports (5) ──────────────────────────────────────────────────────

const AGENT_REPORTS: AgentReport[] = [
  {
    agent: "CEO",
    phaseSlug: "1",
    bodyMarkdown: `# What your CEO would have told 2004 SafetyCulture

## The moment
Anear is a Private Investigator in Townsville. He's read 100+ industrial-accident files. The pattern is the same: no inspection was logged, or the paper record got lost.

## The strategic bet
- **Solve the pain of the job you've done.** Anear knew safety officers by first name. Every product decision could be sanity-checked against a real inspector's day.
- **Bootstrap for as long as it takes.** SafetyCulture didn't take a Series A until 2016 — 12 years after founding. The freemium install base was the artefact that made the Series A worth having.
- **Regional is a feature.** Townsville isn't Sydney. Lower cost base, fewer competitors for engineers, and a founder story that stood out in every VC intro deck.

## What I'd have you copy
1. Bootstrap for as long as the product can pay its own rent. Freemium install data compounds for free during that time.
2. If your city isn't a startup hub, don't relocate. Add a second office in the hub when the raise clears — don't move the founder.
3. Your day-job before founding is a moat, not a resume line. Anear's PI years were the moat.
`,
    sources: [
      { label: "Wikipedia — SafetyCulture", url: SRC_WIKI },
      { label: "SafetyCulture press", url: SRC_PRESS },
    ],
  },
  {
    agent: "CFO",
    phaseSlug: "10",
    bodyMarkdown: `# What your CFO would have told 2016 SafetyCulture

## The moment
Index Ventures + Blackbird Series A US$23M. 12 years post-founding. Cash-flow positive on the freemium+paid mix.

## The answer
- **Take the round because it accelerates hiring, not because you need the cash.** Every founder wishes they'd hired sooner. Index's cheque buys 3-year headcount runway; the freemium engine keeps paying for itself.
- **Structure a founder-secondary tranche.** After 12 years of bootstrap, founder secondary is a fair-value liquidity event, not a red flag. Institutionalise the norm early — it will matter at Series B/C/D.
- **Keep an emergency cash reserve equal to 18 months of burn.** Cash-flow-positive companies get cocky. The 2022 → 2024 valuation reset showed why 18 months of reserve is the difference between 'ride it out' and 'forced round'.

## What I'd have you copy
1. If you bootstrap past year 5, treat the first institutional round as a hiring accelerator, not a survival raise.
2. Founder secondary is legitimate at Series A after long bootstrap arcs. Codify the norm.
3. Keep 18 months of burn in reserve regardless of ARR trajectory. Valuation cycles turn on a dime.
`,
    sources: [
      { label: "SafetyCulture press", url: SRC_PRESS },
      { label: "Crunchbase — SafetyCulture", url: SRC_CB },
    ],
  },
  {
    agent: "CTO",
    phaseSlug: "4",
    bodyMarkdown: `# What your CTO would have told 2012 SafetyCulture

## The moment
Web-first is the tempting default. Every SMB software from 2012 was web-first. But the safety officer is standing on a construction site with dirt on their gloves.

## The answer
- **Mobile-first. Offline-first. Camera-native.** A safety inspector on a mine site has no signal. The MVP has to work fully offline with photo + video capture and sync when back on wifi.
- **Native iOS + Android, not React Native / Cordova.** In 2012 the hybrid mobile stacks were not ready for camera + offline-first workloads. Native was the right technical debt.
- **Template + form model as the primitive.** Every checklist is a form template + response instances. The data model aged into every subsequent feature (Training, Heads Up, Sensors).

## What I'd have you copy
1. Ship on the runtime your buyer physically uses. If the buyer is on a construction site, they are not on a MacBook.
2. Offline-first sync is table-stakes for field-work software. Never assume connectivity.
3. Design your core data model as 'templates + instances'. It aged SafetyCulture for 15 years.
`,
    sources: [
      { label: "SafetyCulture press", url: SRC_PRESS },
      { label: "Wikipedia — SafetyCulture", url: SRC_WIKI },
    ],
  },
  {
    agent: "CMO",
    phaseSlug: "5",
    bodyMarkdown: `# What your CMO would have told 2014 SafetyCulture

## The moment
iAuditor is 2 years old. Freemium install base is growing but the paid conversion is thin. What is the go-to-market that turns free installs into enterprise contracts?

## The answer
- **Publish a template library, indexed for SEO.** 'Confined space entry checklist', 'construction site pre-start checklist', 'restaurant HACCP audit' — every template is a landing page, every landing page is an install.
- **Certify the safety consultants.** Safety consultants advise multiple worksites. Certify them as 'SafetyCulture Preferred' and they carry the product into every client engagement.
- **Case studies over ad spend.** A published case study from a Tier 1 miner (BHP, Rio Tinto) is worth more than a year of AdWords in the enterprise-safety category.

## What I'd have you copy
1. Every template your product ships is an SEO landing page. Publish them all.
2. Certify the consultants that already sell to your buyer. They become an unpaid sales force with a badge.
3. Anchor case-study from a Tier 1 in your vertical. It legitimises every subsequent Tier 2 conversation.
`,
    sources: [
      { label: "SafetyCulture press", url: SRC_PRESS },
    ],
  },
  {
    agent: "CLO",
    phaseSlug: "11",
    bodyMarkdown: `# What your CLO would have told 2022 SafetyCulture

## The moment
Softbank Vision Fund 2 US$34M @ US$2.7B. Late-cycle. Every corporate lawyer in Sydney has seen the paperwork by now.

## The answer
- **Softbank term-sheets carry non-standard preferences. Read every schedule.** Liquidation preference, drag-along, ratchet triggers — Softbank's paper is more aggressive than a typical Series C lead. Land with a lawyer who has actually closed a Softbank deal.
- **Cap the ratchet.** If a ratchet is on the term sheet, negotiate a cap. Uncapped ratchets destroy common at any downround.
- **Reserve a founder-veto on major asset sales.** At US$2.7B with Softbank on the register, the acquisition-offer probability is non-trivial. Protect the founder-veto in the constitution before the acquirer arrives.

## What I'd have you copy
1. Hire a lawyer who has actually closed a deal with your target VC. Sector-generic M&A counsel is not enough.
2. Negotiate a cap on any ratchet clause. Uncapped ratchets destroy common on the next downround.
3. Founder-veto on major asset sales — protect it in the constitution when the cap table is still friendly.
`,
    sources: [
      { label: "SafetyCulture — Softbank press", url: SRC_SOFTBANK },
      { label: "SafetyCulture press", url: SRC_PRESS },
    ],
  },
];

// ── Data-room rows ─────────────────────────────────────────────────────────

const CAT_CORP = "1. Corporate & Legal";
const CAT_CAP = "2. Cap Table & Equity";
const CAT_FIN = "3. Financial Projections";
const CAT_PROD = "4. Product & Technology";
const CAT_MKT = "5. Market & Traction";
const CAT_TEAM = "6. Team & Advisors";
const CAT_STRAT = "9. Strategy & Roadmap";
const CAT_TAX = "11. Tax (AU)";

const DATA_ROOM_ROWS: DataRoomRow[] = [
  { category: CAT_CORP, title: "SafetyCulture Pty Ltd — ASIC company extract (2004)", status: "inferred", phaseSlug: "1", sourceUrl: SRC_ABR },
  { category: CAT_CAP, title: "Series A share purchase agreement — Index + Blackbird (2016)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_PRESS },
  { category: CAT_CAP, title: "Series B SPA — Tiger Global (2018)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_TIGER },
  { category: CAT_CAP, title: "Series C SPA — Insight Partners (2021)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_INSIGHT },
  { category: CAT_CAP, title: "Series C-ext SPA — Softbank Vision Fund 2 (2022)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_SOFTBANK },
  { category: CAT_CAP, title: "Founder + employee secondary allocations (2018+)", status: "redacted", phaseSlug: "11" },
  { category: CAT_FIN, title: "Cash-flow-positive disclosure (2024 press)", status: "present", phaseSlug: "11", sourceUrl: SRC_WIKI },
  { category: CAT_PROD, title: "iAuditor v1.0 release notes (2012)", status: "inferred", phaseSlug: "4", sourceUrl: SRC_PRESS },
  { category: CAT_PROD, title: "Safety Copilot (AI) architecture brief (2023)", status: "inferred", phaseSlug: "11", sourceUrl: SRC_PRESS },
  { category: CAT_MKT, title: "80k+ paying customers disclosure (2025 press)", status: "present", phaseSlug: "11", sourceUrl: SRC_PRESS },
  { category: CAT_MKT, title: "~85k inspections/day operational metric (2025)", status: "present", phaseSlug: "11", sourceUrl: SRC_PRESS },
  { category: CAT_TEAM, title: "Founder bio — Luke Anear (Wikipedia)", status: "present", phaseSlug: "1", sourceUrl: SRC_WIKI },
  { category: CAT_TEAM, title: "Two-city HR posture (Townsville + Sydney)", status: "inferred", phaseSlug: "8", sourceUrl: SRC_TIGER },
  { category: CAT_STRAT, title: "iAuditor → Operations rename + platform expansion (2024)", status: "present", phaseSlug: "11", sourceUrl: SRC_PRESS },
  { category: CAT_TAX, title: "R&D Tax Incentive claims — SafetyCulture Pty Ltd", status: "inferred", phaseSlug: "6" },
];

// ── Valuation snapshots ────────────────────────────────────────────────────

const VALUATIONS: ValuationSnapshot[] = [
  { timestamp: "2016-SeriesA", method: "Comparables", valueAUD: 145_000_000, fxRate: 1.34, narrative: "US$23M into ~US$100M post inferred × FX 0.75 USD/AUD (2016 avg).", sourceUrl: SRC_PRESS },
  { timestamp: "2016-SeriesA", method: "DCF", valueAUD: 120_000_000, fxRate: 1.34, narrative: "DCF on early paid-tier ARR + freemium install base × 20× × FX.", sourceUrl: SRC_PRESS },
  { timestamp: "2018-SeriesB", method: "Comparables", valueAUD: 600_000_000, fxRate: 1.36, narrative: "US$440M post × FX 0.74 USD/AUD (2018 avg).", sourceUrl: SRC_TIGER },
  { timestamp: "2021-Unicorn", method: "Comparables", valueAUD: 2_160_000_000, fxRate: 1.35, narrative: "US$1.6B post × FX 0.74 USD/AUD (2021 avg).", sourceUrl: SRC_INSIGHT },
  { timestamp: "2022-Softbank", method: "Comparables", valueAUD: 3_920_000_000, fxRate: 1.45, narrative: "US$2.7B post × FX 0.69 USD/AUD (2022 avg).", sourceUrl: SRC_SOFTBANK },
  { timestamp: "2022-Softbank", method: "DCF", valueAUD: 3_000_000_000, fxRate: 1.45, narrative: "DCF on ~US$150M ARR (est) × 20× × FX; supports Softbank round.", sourceUrl: SRC_SOFTBANK },
  { timestamp: "2024-Reset", method: "Comparables", valueAUD: 3_050_000_000, fxRate: 1.52, narrative: "US$2B secondary × FX 0.66 USD/AUD (2024 spot).", sourceUrl: SRC_WIKI },
  { timestamp: "2026-current", method: "Comparables", valueAUD: 3_500_000_000, fxRate: 1.52, narrative: "US$2.3B est (inferred from 2025 customer + inspection growth) × FX.", sourceUrl: SRC_PRESS },
];

// ── Assembled fixture ─────────────────────────────────────────────────────

export const SAFETYCULTURE_DEMO: SafetyCultureDemo = {
  profile: {
    name: "SafetyCulture",
    foundedYear: 2004,
    founders: ["Luke Anear"],
    hqCity: "Townsville",
    ticker: "PRIVATE",
    url: "https://safetyculture.com",
  },
  milestones: MILESTONES,
  phaseSnapshots: PHASE_SNAPSHOTS,
  sviScores: SVI_SCORES,
  agentReports: AGENT_REPORTS,
  dataRoomRows: DATA_ROOM_ROWS,
  valuations: VALUATIONS,
};

export const PHASE_DISPLAY_NAMES: Record<number, string> = {
  1: "Vision / Day-0 Idea",
  2: "Idea Validation",
  3: "Market Research",
  4: "MVP / Product Discovery",
  5: "PMF / Early Traction",
  6: "Revenue / Business Model",
  7: "Growth / Analytics",
  8: "Team & Culture",
  9: "Funding-Ready",
  10: "Fundraise / Term Sheet",
  11: "Post-Funding / Growth Scale",
  12: "Exit / Beyond",
};

export function groupMilestonesByPhase(): Array<{
  phase: number;
  milestones: SafetyCultureMilestone[];
}> {
  const buckets = new Map<number, SafetyCultureMilestone[]>();
  for (const m of SAFETYCULTURE_DEMO.milestones) {
    const p = Number(m.phaseSlug);
    if (!Number.isFinite(p)) continue;
    const bucket = buckets.get(p);
    if (bucket) bucket.push(m);
    else buckets.set(p, [m]);
  }
  return Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([phase, milestones]) => ({ phase, milestones }));
}
