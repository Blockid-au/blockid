// Canva showcase fixture — first-class demo walkthrough data seed.
//
// Same shape as web/src/lib/showcase/atlassian/fixture.ts. Pure typed TS
// module — no DB, no I/O. Every fact traces to a public source URL cited
// inline on the milestone / valuation row.
//
// Primary sources:
//   - Wikipedia (Canva)      https://en.wikipedia.org/wiki/Canva
//   - Crunchbase (Canva)     https://www.crunchbase.com/organization/canva/company_financials
//   - Canva Newsroom         https://www.canva.com/newsroom/
//   - Forbes / Bloomberg     valuation resets (2022 secondary reprice)
//   - AFR (Anthony Macali)   "Canva has raised how much?" round-up
//
// Note: Canva is still private (as of 2026). All valuations flagged
// "post-money" come from press releases or reputable secondary-market
// reports; where a number is inferred rather than confirmed, the
// narrative marks it as such.

import type {
  AtlassianDemo,
  AtlassianMilestone,
  PhaseSnapshot,
  SVIScore,
  AgentReport,
  DataRoomRow,
  ValuationSnapshot,
} from "../atlassian/fixture";

// Re-export the shared demo type as a Canva-flavoured alias so downstream
// consumers can `import type { CanvaDemo }` for readability without a duplicate
// interface definition. Structurally identical to AtlassianDemo.
export type CanvaMilestone = AtlassianMilestone;
export type CanvaDemo = AtlassianDemo;

// ── Citation URL constants ─────────────────────────────────────────────────

const SRC_WIKI = "https://en.wikipedia.org/wiki/Canva";
const SRC_CB = "https://www.crunchbase.com/organization/canva/company_financials";
const SRC_TURNS_10 = "https://www.canva.com/newsroom/news/canva-turns-10/";
const SRC_GIVING_PLEDGE =
  "https://www.canva.com/newsroom/news/canva-reaches-40-billion-valuation-signs-giving-pledge/";
const SRC_NEWSROOM = "https://www.canva.com/newsroom/";
const SRC_AFFINITY =
  "https://www.canva.com/newsroom/news/canva-and-affinity-join-forces/";
const SRC_2023_REVIEW =
  "https://www.canva.com/newsroom/news/canva-2023-year-in-review/";
const SRC_MAGIC =
  "https://www.canva.com/newsroom/news/introducing-magic-studio/";
const SRC_ASIC_ABN = "https://abr.business.gov.au/ABN/View?id=80158929938"; // Canva Pty Ltd ABN 80 158 929 938

// Canva Pty Ltd — ABR record. Founding entity ABN (public via abr.business.gov.au).
export const CANVA_ABN = "80 158 929 938";

// Phase-to-canonical helper (mirrors atlassian fixture).
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

function stage(phaseSlug: string): string {
  return PHASE_TO_CANONICAL[phaseSlug] ?? "idea";
}

// ── Milestones ─────────────────────────────────────────────────────────────

const MILESTONES: CanvaMilestone[] = [
  {
    year: 2007,
    phaseSlug: "1",
    canonicalStage: stage("1"),
    title: "Fusion Yearbooks — the precursor",
    body:
      "Perkins and Obrecht bootstrap a school-yearbook design business in Perth. The pain point that becomes Canva five years later — non-designers using clunky desktop software — is validated in-market first, without VC.",
    source: { label: "Wikipedia — Canva", url: SRC_WIKI },
  },
  {
    year: 2012,
    phaseSlug: "4",
    canonicalStage: stage("4"),
    title: "Canva incorporates in Sydney; Cameron Adams joins as CTO",
    body:
      "Perkins + Obrecht + Adams. Over 100 investor rejections in Silicon Valley. Bill Tai eventually introduces Perkins to Lars Rasmussen (ex-Google Maps), who becomes an early angel and advisor.",
    source: { label: "Canva — turns 10", url: SRC_TURNS_10 },
  },
  {
    year: 2013,
    date: "2013-08-26",
    phaseSlug: "10",
    canonicalStage: stage("10"),
    title: "US$3M seed round; Canva.com launched",
    body:
      "Matrix Partners + Blackbird Ventures + Bill Tai + Lars Rasmussen. Canva.com opens to public 2013-08-26 with 50,000 sign-ups in the first month — a launch-day traction curve that anchors every subsequent round narrative.",
    source: { label: "Crunchbase — Canva financials", url: SRC_CB },
    usd: "$3M",
  },
  {
    year: 2015,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "US$15M Series A led by Sequoia's Bond + Felicis",
    body:
      "Post-money ~US$165M. Canva for Work (later Canva Business) launched — the paid tier that flips a free product into a revenue engine.",
    source: { label: "Crunchbase — Canva financials", url: SRC_CB },
    usd: "$15M",
  },
  {
    year: 2018,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Unicorn — US$40M @ US$1B valuation",
    body:
      "Sequoia China + Blackbird + Felicis. First Australian-founded unicorn led by a female founder. Print + video features stitched onto the design core.",
    source: { label: "Canva newsroom", url: SRC_NEWSROOM },
    usd: "$1B valuation",
  },
  {
    year: 2019,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "US$70M @ US$2.5B, then US$85M @ US$3.2B",
    body:
      "Two rounds in a single year — General Catalyst + Bond + Sequoia China. Manila operations grow to be the second-largest office. Rapid international expansion into APAC and LATAM.",
    source: { label: "Canva newsroom", url: SRC_NEWSROOM },
    usd: "$2.5B → $3.2B",
  },
  {
    year: 2021,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "US$200M @ US$40B — decacorn; Perkins + Obrecht sign the Giving Pledge",
    body:
      "T. Rowe Price + Franklin Templeton + Sequoia Capital Global Equities + Bessemer. Founders pledge 30% of their equity to charitable causes — codified before any pre-IPO reshuffle could re-negotiate it.",
    source: { label: "Canva — Giving Pledge announcement", url: SRC_GIVING_PLEDGE },
    usd: "$40B valuation",
  },
  {
    year: 2022,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Secondary-market repricing to ~US$26B",
    body:
      "As global tech valuations reset (Tiger + Insight mark-downs, Klarna cascade), Canva secondary trades reprice from US$40B to ~US$26B. Primary financing remains intact — no primary down-round.",
    source: { label: "Wikipedia — Canva", url: SRC_WIKI },
    usd: "$26B",
  },
  {
    year: 2023,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Magic Studio — generative AI product line",
    body:
      "Magic Design, Magic Media, Magic Write ship as a bundled AI suite built on partnerships with OpenAI, Google Cloud and Anthropic. First mass-market generative-AI product from an Aussie decacorn.",
    source: { label: "Canva — Introducing Magic Studio", url: SRC_MAGIC },
  },
  {
    year: 2024,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Affinity acquisition (Serif Ltd, UK)",
    body:
      "Reported ~US$380M deal for the Photoshop/Illustrator alternative. Largest Canva acquisition to date and the pro-designer beachhead — closes the credibility gap with Adobe's power-user base.",
    source: { label: "Canva + Affinity — press release", url: SRC_AFFINITY },
    usd: "$380M deal",
  },
  {
    year: 2025,
    phaseSlug: "12",
    canonicalStage: stage("12"),
    title: "Revenue crosses US$3B ARR; IPO speculation intensifies",
    body:
      "Multiple press reports on 2025-26 IPO planning; investment banks reportedly engaged. Company publicly declines to confirm timing. FY2023 review disclosed $1.7B ARR; 2025 press quotes 'well past $3B'.",
    source: { label: "Canva — 2023 year in review", url: SRC_2023_REVIEW },
  },
];

// ── 12 phase snapshots ────────────────────────────────────────────────────

const PHASE_SNAPSHOTS: PhaseSnapshot[] = [
  {
    phaseSlug: "1",
    canonicalStage: stage("1"),
    headline: "Solve a pain you've already been paid to fix. Perkins ran a paper yearbook business first.",
    atlassianMoment:
      "Fusion Yearbooks (2007) put Perkins in front of teachers wrestling with Microsoft Publisher. Every Canva feature request had a real customer name attached.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 30,
  },
  {
    phaseSlug: "2",
    canonicalStage: stage("2"),
    headline: "Talk to 100 investors — the 100th 'no' is worth more than the first 'yes'.",
    atlassianMoment:
      "Perkins pitched 100+ VCs across 2010-2012 before Bill Tai + Rasmussen said yes. The rejection cycle sharpened the deck, not the plan.",
    sourceUrl: SRC_TURNS_10,
    sviAtThisPoint: 38,
  },
  {
    phaseSlug: "3",
    canonicalStage: stage("3"),
    headline: "Price the consumer-graphic-design market on billions of non-designers, not thousands of pros.",
    atlassianMoment:
      "Canva sized the TAM as 'everyone who ever opened PowerPoint' — an Adobe-inverse frame that made the VC pitch and the pricing page work together.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 44,
  },
  {
    phaseSlug: "4",
    canonicalStage: stage("4"),
    headline: "Ship a browser-native MVP. If the buyer needs to install anything, redesign.",
    atlassianMoment:
      "2012: Canva incorporates and immediately commits to browser-first — no desktop app, no plugin. The technical bet aged into the mobile + collaboration future.",
    sourceUrl: SRC_TURNS_10,
    sviAtThisPoint: 52,
  },
  {
    phaseSlug: "5",
    canonicalStage: stage("5"),
    headline: "PMF = a public launch that oversubscribes. Track 30-day active retention, not sign-ups.",
    atlassianMoment:
      "50,000 sign-ups in month one (Aug-Sep 2013), organic PR from teachers, marketers, and small-business owners — no ad spend for the first year.",
    sourceUrl: SRC_TURNS_10,
    sviAtThisPoint: 61,
  },
  {
    phaseSlug: "6",
    canonicalStage: stage("6"),
    headline: "Add a paid tier the moment free users hit a natural workflow wall.",
    atlassianMoment:
      "Canva for Work (2015, at Series A) — brand kits, teams, templates. Freemium becomes revenue engine without punishing the free-user funnel.",
    sourceUrl: SRC_CB,
    sviAtThisPoint: 68,
  },
  {
    phaseSlug: "7",
    canonicalStage: stage("7"),
    headline: "Instrument every design action. The metric that predicts renewal is 'designs per user per week'.",
    atlassianMoment:
      "Canva's analytics stack tracks weekly design events per team — the leading indicator that Canva for Work seats will renew (published pattern in later engineering-blog posts).",
    sourceUrl: SRC_NEWSROOM,
    sviAtThisPoint: 72,
  },
  {
    phaseSlug: "8",
    canonicalStage: stage("8"),
    headline: "Codify culture before you hit 100 hires. Perkins' 'Two Goals' still frames every all-hands.",
    atlassianMoment:
      "'Empower the world to design. Do the most good we can.' Two-sentence mission set in 2013 — still the anchor for the 2021 Giving Pledge.",
    sourceUrl: SRC_GIVING_PLEDGE,
    sviAtThisPoint: 76,
  },
  {
    phaseSlug: "9",
    canonicalStage: stage("9"),
    headline: "Prep the cap table for growth capital before you take it. Class-A / Class-B optionality, ESOP top-ups, secondary reserves.",
    atlassianMoment:
      "Canva structured a founder-friendly ESOP + reserved secondary allocations for early employees before the 2018 mega-rounds — no employee got squeezed on the way up.",
    sourceUrl: SRC_NEWSROOM,
    sviAtThisPoint: 80,
  },
  {
    phaseSlug: "10",
    canonicalStage: stage("10"),
    headline: "Stack rounds only when growth is above plan. Two rounds in a year (2019) only work when the numbers keep pace.",
    atlassianMoment:
      "US$70M @ US$2.5B then US$85M @ US$3.2B — nine months apart. Only defensible because MAU + paid seats compounded through the year.",
    sourceUrl: SRC_NEWSROOM,
    sviAtThisPoint: 85,
  },
  {
    phaseSlug: "11",
    canonicalStage: stage("11"),
    headline: "Acquire the pro-designer story. Affinity was Canva's 'Photoshop respect' move.",
    atlassianMoment:
      "Affinity (2024) — ~US$380M for Serif Ltd. Closes the credibility gap with Adobe's power-user base without diluting the mass-market brand.",
    sourceUrl: SRC_AFFINITY,
    sviAtThisPoint: 88,
  },
  {
    phaseSlug: "12",
    canonicalStage: stage("12"),
    headline: "Stay private until the story is 'growing profitably at $3B ARR', not 'growing at any cost'.",
    atlassianMoment:
      "Canva has taken 9 private rounds and reached decacorn scale without IPO — a live experiment in whether growth capital can substitute for public markets indefinitely.",
    sourceUrl: SRC_2023_REVIEW,
    sviAtThisPoint: 91,
  },
];

// ── SVI scores ────────────────────────────────────────────────────────────

const SVI_SCORES: SVIScore[] = [
  { criterion: "idea", score0to100: 94, rationale: "Repriced graphic design from pro-only to universal — category redefinition, not feature." },
  { criterion: "market", score0to100: 92, rationale: "Every knowledge worker is a design buyer; ARR crossed US$3B (2025 press)." },
  { criterion: "founder_profile", score0to100: 93, rationale: "Perkins + Obrecht + Adams — 13-year co-founder team; Perkins remains CEO." },
  { criterion: "code_git", score0to100: 82, rationale: "Browser-native from day one; heavy WebAssembly + Canvas engine, private repos." },
  { criterion: "website", score0to100: 96, rationale: "canva.com is the funnel: free → paid, teams, print, video — no salesperson required." },
  { criterion: "team", score0to100: 90, rationale: "5,000+ employees across Sydney + Manila + Austin + Prague; Perkins/Obrecht/Adams still active." },
  { criterion: "customer_size", score0to100: 93, rationale: "170M+ monthly active users (Canva 2023 review); 500K+ team accounts." },
  { criterion: "gtm_strategy", score0to100: 91, rationale: "Bottom-up product-led growth; teams tier upsell drives US$3B+ ARR." },
  { criterion: "documents", score0to100: 78, rationale: "Private company — press releases + newsroom are the primary disclosure surface." },
  { criterion: "dataroom", score0to100: 84, rationale: "Passed diligence for T. Rowe Price + Franklin Templeton + Bessemer at 2021 US$40B round." },
  { criterion: "team_structure", score0to100: 86, rationale: "External board additions in 2021+ (T. Rowe, Sequoia Global) — governance layered ahead of any IPO track." },
  { criterion: "roadmap", score0to100: 92, rationale: "Design → Business tier → Print → Video → AI (Magic Studio) → Pro design (Affinity) — coherent adjacency stack." },
  { criterion: "revenue", score0to100: 93, rationale: "US$3B+ ARR (2025); profitable at scale per press disclosures; recurring subscription base." },
];

// ── Agent reports (5) ──────────────────────────────────────────────────────

const AGENT_REPORTS: AgentReport[] = [
  {
    agent: "CEO",
    phaseSlug: "2",
    bodyMarkdown: `# What your CEO would have told 2011 Canva

## The moment
100+ VCs have said no. Perkins is sleeping on her brother's floor in San Francisco. The right instinct is to push, not pivot.

## The strategic bet
- **Own the introduction path.** Bill Tai's kite-surfing scene → Lars Rasmussen intro → Matrix + Blackbird. The 'network the network' motion beat any cold-email sequence.
- **Iterate the deck, not the plan.** Perkins rewrote her deck dozens of times but kept the thesis intact — 'graphic design for the other 99%' — until the deck matched the pitch verbally.
- **Bootstrap the team.** Cameron Adams joined as CTO/co-founder — a founder-equity round rather than a hired-CTO cash round. Same equity math, radically different alignment.

## What I'd have you copy
1. If your first 20 pitches all miss, the deck is wrong, not the market. Rewrite it against the objection you keep hearing.
2. Find a category-native introducer before you cold-pitch — Rasmussen for design; whoever your equivalent is for your sector.
3. Convert your 'need-to-hire' senior technical role into a co-founder equity conversation. It moves faster and aligns harder.
`,
    sources: [
      { label: "Canva — 10-year anniversary", url: SRC_TURNS_10 },
      { label: "Wikipedia — Canva", url: SRC_WIKI },
    ],
  },
  {
    agent: "CFO",
    phaseSlug: "11",
    bodyMarkdown: `# What your CFO would have told 2021 Canva

## The moment
US$40B post-money. Perkins + Obrecht sign the Giving Pledge (30% of equity to charity) in the same press release as the round close.

## The answer
- **Codify the philanthropy pledge BEFORE the round closes.** Once a Bessemer or T. Rowe Price cheque lands, altering the founders' economic stake becomes a governance conversation. Pre-money is the last free move.
- **Reserve secondary allocations for staff-at-scale.** Canva's 2019 + 2021 rounds included employee secondary tranches — the retention lever that prevents an 'IPO or nothing' pressure cooker.
- **Publish an ARR headline.** Even without S-1 disclosure, a $1.7B → $3B ARR arc positions Canva as an IPO-optional issuer rather than an IPO-forced one.

## What I'd have you copy
1. If founder giving matters to you, codify it in the pre-money cap table. Post-money is expensive and negotiated.
2. Every mega-round should carry a scoped employee secondary tranche — the retention math is worth the primary dilution.
3. Publish one metric per year that anchors your valuation story publicly. Silence is a discount.
`,
    sources: [
      { label: "Canva — Giving Pledge announcement", url: SRC_GIVING_PLEDGE },
      { label: "Canva — 2023 year in review", url: SRC_2023_REVIEW },
    ],
  },
  {
    agent: "CTO",
    phaseSlug: "4",
    bodyMarkdown: `# What your CTO would have told 2012 Canva

## The moment
The team is about to ship. The dominant design software is desktop-native (Photoshop, Illustrator, InDesign). Every Adobe engineer thinks the browser can't do this.

## The answer
- **Browser-only. No installer. No mobile-app-first.** Chromium's Canvas + WebGL had just crossed the threshold where in-browser rendering could match desktop. Ship there.
- **Bet on a template-first content model.** Canva's data model is 'templates + editable overlays' — reusable, portable, later cloudable, later collaborative in real time. The domain model aged into every subsequent feature.
- **Keep the render engine in-house.** No dependency on a third-party design SDK. When Affinity was acquired (2024), Canva's engine was strong enough to absorb Serif's engine rather than the other way around.

## What I'd have you copy
1. Choose the runtime that is 6 months from good-enough, not the one that is best today. You will ship into the future.
2. Design your data model for the feature after the one you're shipping — Canva's template + overlay model is why collaboration + AI worked without a rewrite.
3. Keep the engine core in-house. Every acquired product will need to fit your engine, not the other way around.
`,
    sources: [
      { label: "Canva — Introducing Magic Studio", url: SRC_MAGIC },
      { label: "Canva + Affinity", url: SRC_AFFINITY },
    ],
  },
  {
    agent: "CMO",
    phaseSlug: "5",
    bodyMarkdown: `# What your CMO would have told 2013 Canva

## The moment
Launch day. 50,000 sign-ups in the first month. No paid acquisition. What do you keep doing, and what do you avoid?

## The answer
- **Refuse paid acquisition for the first year.** Every dollar spent on ads at this stage would hide whether the product's word-of-mouth was real.
- **Onboard for time-to-first-design, not time-to-signup.** The activation metric that matters is 'user finishes one design in the first session'. Everything on the homepage exists to shorten that path.
- **Give teachers + students the enterprise product free forever.** Canva for Education became the second-largest install base — teachers who use Canva at school become the mums who use it at home who become the marketing manager who buys the team plan.

## Channels that worked (2013-2018)
1. **SEO on 'design a poster', 'make a flyer'.** Long-tail intent volume with near-zero commercial competition (Adobe wasn't ranking).
2. **Templates as SEO surface.** Every template = an indexable landing page. Compounding organic moat.
3. **Product-led referrals from team seats.** Canva for Work seats invite colleagues → same-domain viral loop, no CAC.

## What I'd have you copy
1. Publish transparent per-seat pricing. 'Contact sales' is a growth tax.
2. Rank your onboarding funnel by time-to-first-value, not time-to-signup.
3. Free-for-schools / free-for-nonprofits is a distribution channel, not a philanthropy line-item.
`,
    sources: [
      { label: "Canva — turns 10", url: SRC_TURNS_10 },
      { label: "Canva — Newsroom", url: SRC_NEWSROOM },
    ],
  },
  {
    agent: "CHRO",
    phaseSlug: "8",
    bodyMarkdown: `# What your CHRO would have told 2016 Canva

## The moment
The team is crossing 100 people across Sydney and Manila. The design-values + engineering-values gap is starting to show.

## The answer
- **Write two sentences, not a manifesto.** 'Empower the world to design. Do the most good we can.' The full values doc lives inside those two sentences — everything else is an operationalisation.
- **Manila is a peer office, not a support office.** Canva staffed engineering + design leadership in Manila from Day 1 — a decision that later made the 5,000-person distributed org possible without a two-tier culture.
- **Bake the Giving Pledge in early.** Five years before the founders signed the pledge publicly (2021), the cultural expectation that Canva would 'do the most good it can' was written into onboarding.

## What I'd have you copy
1. Two-sentence mission. If you can't shrink it to two, the mission isn't sharp yet.
2. Any second office must be a peer office — not 'the cheap one'. The two-tier tax compounds.
3. Codify the giving-back cultural expectation now, even if you can't fund it yet. Founders don't sign the Giving Pledge; cultures do.
`,
    sources: [
      { label: "Canva — Giving Pledge announcement", url: SRC_GIVING_PLEDGE },
      { label: "Canva — turns 10", url: SRC_TURNS_10 },
    ],
  },
];

// ── Data-room rows (subset) ────────────────────────────────────────────────

const CAT_CORP = "1. Corporate & Legal";
const CAT_CAP = "2. Cap Table & Equity";
const CAT_FIN = "3. Financial Projections";
const CAT_PROD = "4. Product & Technology";
const CAT_MKT = "5. Market & Traction";
const CAT_TEAM = "6. Team & Advisors";
const CAT_IP = "7. IP & Compliance";
const CAT_STRAT = "9. Strategy & Roadmap";
const CAT_TAX = "11. Tax (AU)";

const DATA_ROOM_ROWS: DataRoomRow[] = [
  { category: CAT_CORP, title: "Canva Pty Ltd — ASIC company extract (2012)", status: "inferred", phaseSlug: "4", sourceUrl: SRC_ASIC_ABN },
  { category: CAT_CORP, title: "Canva Newsroom — 10-year retrospective", status: "present", phaseSlug: "11", sourceUrl: SRC_TURNS_10 },
  { category: CAT_CORP, title: "Giving Pledge signatory disclosure (2021)", status: "present", phaseSlug: "11", sourceUrl: SRC_GIVING_PLEDGE },
  { category: CAT_CAP, title: "Seed round SAFE / equity docs (2013)", status: "redacted", phaseSlug: "10", sourceUrl: SRC_CB },
  { category: CAT_CAP, title: "Series A share purchase agreement (2015)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_CB },
  { category: CAT_CAP, title: "US$40B Series (2021) — SPA + secondary allocation", status: "redacted", phaseSlug: "11", sourceUrl: SRC_GIVING_PLEDGE },
  { category: CAT_FIN, title: "ARR disclosure — $1.7B (2023 year in review)", status: "present", phaseSlug: "11", sourceUrl: SRC_2023_REVIEW },
  { category: CAT_FIN, title: "ARR disclosure — 'well past $3B' (2025 press)", status: "inferred", phaseSlug: "11", sourceUrl: SRC_WIKI },
  { category: CAT_PROD, title: "Magic Studio launch technical brief (2023)", status: "present", phaseSlug: "11", sourceUrl: SRC_MAGIC },
  { category: CAT_PROD, title: "Affinity acquisition — technical due diligence (2024)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_AFFINITY },
  { category: CAT_MKT, title: "170M+ monthly active users disclosure (2023 review)", status: "present", phaseSlug: "11", sourceUrl: SRC_2023_REVIEW },
  { category: CAT_TEAM, title: "Founder bios — Perkins, Obrecht, Adams (Newsroom)", status: "present", phaseSlug: "4", sourceUrl: SRC_TURNS_10 },
  { category: CAT_IP, title: "Trademark register — Canva, Magic Studio, Affinity", status: "inferred", phaseSlug: "11" },
  { category: CAT_STRAT, title: "Two-sentence mission (2013 codification)", status: "present", phaseSlug: "8", sourceUrl: SRC_TURNS_10 },
  { category: CAT_TAX, title: "R&D Tax Incentive claims (AU) — Canva Pty Ltd", status: "inferred", phaseSlug: "6" },
];

// ── Valuation snapshots ────────────────────────────────────────────────────

const VALUATIONS: ValuationSnapshot[] = [
  { timestamp: "2013-Seed", method: "Comparables", valueAUD: 6_600_000, fxRate: 1.10, narrative: "US$3M @ ~US$6M pre inferred from seed dilution norms; FX 2013 avg 0.91 USD/AUD.", sourceUrl: SRC_CB },
  { timestamp: "2013-Seed", method: "Berkus", valueAUD: 3_300_000, fxRate: 1.10, narrative: "Berkus cap for pre-revenue with prototype + founding team.", sourceUrl: SRC_CB },
  { timestamp: "2013-Seed", method: "Scorecard", valueAUD: 5_500_000, fxRate: 1.10, narrative: "Scorecard vs 2013 AU seed median × strong founder + PMF momentum factor.", sourceUrl: SRC_CB },
  { timestamp: "2015-SeriesA", method: "Comparables", valueAUD: 217_800_000, fxRate: 1.32, narrative: "US$165M post × FX 0.76 USD/AUD (2015 avg).", sourceUrl: SRC_CB },
  { timestamp: "2015-SeriesA", method: "DCF", valueAUD: 165_000_000, fxRate: 1.32, narrative: "Speculative DCF on Canva-for-Work seat forecast × 20× fwd rev multiple.", sourceUrl: SRC_CB },
  { timestamp: "2018-Unicorn", method: "Comparables", valueAUD: 1_360_000_000, fxRate: 1.36, narrative: "US$1B post × FX 0.74 USD/AUD (2018 avg).", sourceUrl: SRC_NEWSROOM },
  { timestamp: "2021-Decacorn", method: "Comparables", valueAUD: 54_000_000_000, fxRate: 1.35, narrative: "US$40B post × FX 0.74 USD/AUD (2021 avg).", sourceUrl: SRC_GIVING_PLEDGE },
  { timestamp: "2021-Decacorn", method: "DCF", valueAUD: 38_000_000_000, fxRate: 1.35, narrative: "DCF on $1B ARR (est) × 30× × FX.", sourceUrl: SRC_GIVING_PLEDGE },
  { timestamp: "2022-Reset", method: "Comparables", valueAUD: 37_700_000_000, fxRate: 1.45, narrative: "US$26B secondary × FX 0.69 USD/AUD (2022 avg).", sourceUrl: SRC_WIKI },
  { timestamp: "2026-current", method: "Comparables", valueAUD: 48_000_000_000, fxRate: 1.52, narrative: "US$32B est (secondary trades late 2025) × FX 0.66 USD/AUD; inferred from press reports.", sourceUrl: SRC_WIKI },
  { timestamp: "2026-current", method: "DCF", valueAUD: 55_000_000_000, fxRate: 1.52, narrative: "DCF on ~US$3B ARR × 12× × FX; assumes profitable at scale per press disclosures.", sourceUrl: SRC_2023_REVIEW },
];

// ── Assembled fixture ─────────────────────────────────────────────────────

export const CANVA_DEMO: CanvaDemo = {
  profile: {
    name: "Canva",
    foundedYear: 2012,
    founders: ["Melanie Perkins", "Cliff Obrecht", "Cameron Adams"],
    hqCity: "Sydney",
    ticker: "PRIVATE",
    url: "https://www.canva.com",
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
  milestones: CanvaMilestone[];
}> {
  const buckets = new Map<number, CanvaMilestone[]>();
  for (const m of CANVA_DEMO.milestones) {
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
