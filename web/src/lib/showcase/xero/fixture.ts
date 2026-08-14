// Xero showcase fixture — first-class demo walkthrough data seed.
//
// Same shape as web/src/lib/showcase/atlassian/fixture.ts. Pure typed TS
// module — no DB, no I/O.
//
// Primary sources:
//   - Wikipedia (Xero)          https://en.wikipedia.org/wiki/Xero_(company)
//   - Xero media releases       https://www.xero.com/global/media-releases/
//   - NZX / ASX filings         https://www.asx.com.au/asx/share-price-research/company/XRO
//   - Xero annual reports       https://www.xero.com/global/investor/reports/
//   - Drury Wikipedia           https://en.wikipedia.org/wiki/Rod_Drury
//
// Xero listed on NZX 2007 six months after founding (unusual) and
// dual-listed ASX 2012. Delisted NZX 2018 to become ASX-primary only.

import type {
  AtlassianDemo,
  AtlassianMilestone,
  PhaseSnapshot,
  SVIScore,
  AgentReport,
  DataRoomRow,
  ValuationSnapshot,
} from "../atlassian/fixture";

export type XeroMilestone = AtlassianMilestone;
export type XeroDemo = AtlassianDemo;

// ── Citation URL constants ─────────────────────────────────────────────────

const SRC_WIKI = "https://en.wikipedia.org/wiki/Xero_(company)";
const SRC_XERO_MEDIA = "https://www.xero.com/global/media-releases/";
const SRC_ASX_XRO = "https://www.asx.com.au/asx/share-price-research/company/XRO";
const SRC_XERO_INVESTOR = "https://www.xero.com/global/investor/reports/";
const SRC_DRURY_WIKI = "https://en.wikipedia.org/wiki/Rod_Drury";
const SRC_NZX_ARCHIVE = "https://www.nzx.com/announcements";
const SRC_XERO_NZ_MEDIA = "https://www.xero.com/nz/media-releases/";

// Xero Australia Pty Ltd — ABN 22 126 439 990 (per ABR).
export const XERO_ABN = "22 126 439 990";

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

const MILESTONES: XeroMilestone[] = [
  {
    year: 2006,
    phaseSlug: "1",
    canonicalStage: stage("1"),
    title: "Founded in Wellington by Rod Drury + Hamish Edwards",
    body:
      "Drury (serial entrepreneur, sold AfterMail to Quest Software 2006 for NZ$70M) + Edwards (accountant) build cloud-first accounting for SMBs. Original bet: a browser-native replacement for desktop MYOB.",
    source: { label: "Wikipedia — Xero", url: SRC_WIKI },
  },
  {
    year: 2007,
    date: "2007-06-05",
    phaseSlug: "10",
    canonicalStage: stage("10"),
    title: "NZX IPO 6 months after founding — NZ$15M raised at NZ$1.00",
    body:
      "Extraordinarily early IPO — effectively pre-revenue. Justified by need for capital + credibility to challenge MYOB in Australia, and by Drury's brand from AfterMail. NZX listing offered a lighter compliance bar than ASX for a company of that stage.",
    source: { label: "Xero NZ media releases", url: SRC_XERO_NZ_MEDIA },
    usd: "NZ$15M",
  },
  {
    year: 2010,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Australian expansion — Sydney office",
    body:
      "AU launch. Sydney office established. Xero's PLG motion (self-serve trial → paid) starts eating MYOB's mid-market flank via accountant referral network.",
    source: { label: "Xero media releases", url: SRC_XERO_MEDIA },
  },
  {
    year: 2012,
    date: "2012-11-14",
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "ASX dual-listing — ticker XRO",
    body:
      "Xero dual-lists on ASX. Both boards active until 2018. First high-profile NZ-to-AU dual-listing that would become the template for later NZ tech (Vista, EROAD).",
    source: { label: "ASX — Xero (XRO)", url: SRC_ASX_XRO },
  },
  {
    year: 2014,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "US expansion + Matrix Capital / Accel US$150M round",
    body:
      "Matrix Capital + Accel + Peter Thiel — reported ~US$150M at ~US$1.5B valuation. Aggressive push into US SMB accounting. Later cited (Drury 2018 shareholder letter) as the loss-making chapter that funded the eventual profitability.",
    source: { label: "Wikipedia — Xero", url: SRC_WIKI },
    usd: "$150M",
  },
  {
    year: 2016,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "1M subscribers milestone",
    body:
      "Global subscriber base crosses 1M; ARR ~NZ$300M. Accountant channel — 'accountant recommends Xero to SMB client' — is the primary growth motion.",
    source: { label: "Xero media releases", url: SRC_XERO_MEDIA },
  },
  {
    year: 2018,
    date: "2018-01-31",
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "NZX delisting — ASX primary only",
    body:
      "Xero delists from NZX to simplify dual-market compliance overhead and consolidate the shareholder register on ASX. NZX retention would have added years of parallel-reporting cost without a corresponding fund-flow benefit.",
    source: { label: "Xero media releases", url: SRC_XERO_MEDIA },
  },
  {
    year: 2018,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Steve Vamos succeeds Rod Drury as CEO",
    body:
      "Drury steps up to Non-Executive Director / Founder. Vamos (ex-Microsoft, ex-Telstra Media) takes CEO — signals the shift from founder-scale to professional-CEO scale.",
    source: { label: "Xero media releases", url: SRC_XERO_MEDIA },
  },
  {
    year: 2019,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Instafile + Hubdoc acquisitions",
    body:
      "Data-capture bet — receipts, expenses, doc management. Fits inside the 'accountant tool-chain around Xero core ledger' thesis, not a fresh product bet.",
    source: { label: "Xero media releases", url: SRC_XERO_MEDIA },
  },
  {
    year: 2020,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "First full-year profitability + 2.7M subscribers",
    body:
      "ARR NZ$820M. Market cap peaks near AU$26B during pandemic SaaS re-rating. Vindication of the 2014-2018 loss-making US chapter — the growth curve compounded into cash generation without a strategic pivot.",
    source: { label: "ASX — XRO", url: SRC_ASX_XRO },
  },
  {
    year: 2022,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Sukhinder Singh Cassidy succeeds Vamos as CEO",
    body:
      "First externally-hired CEO with deep Silicon Valley background (ex-Google, ex-StubHub, ex-Amazon). Signals move to US-market focus + AI product bets. Restructuring + cost programme follows in 2023.",
    source: { label: "Xero media releases", url: SRC_XERO_MEDIA },
  },
  {
    year: 2024,
    phaseSlug: "11",
    canonicalStage: stage("11"),
    title: "Cost-cutting done; 4.2M subscribers; Xero AI ('Just Ask Xero')",
    body:
      "Restructuring completed. Announces Xero AI (Just Ask Xero). Market cap ~AU$25B on ASX. The 'grow-at-any-cost' era formally over; 'growth + margin' era begins.",
    source: { label: "Xero media releases", url: SRC_XERO_MEDIA },
  },
];

// ── Phase snapshots ────────────────────────────────────────────────────────

const PHASE_SNAPSHOTS: PhaseSnapshot[] = [
  {
    phaseSlug: "1",
    canonicalStage: stage("1"),
    headline: "A second-time founder can raise on brand. Drury sold AfterMail six months before Xero incorporated.",
    atlassianMoment:
      "Drury's AfterMail sale to Quest (2006, NZ$70M) funded the Xero founding equity + gave him the credibility for a same-year IPO. Second-time founders arbitrage their own brand.",
    sourceUrl: SRC_DRURY_WIKI,
    sviAtThisPoint: 42,
  },
  {
    phaseSlug: "2",
    canonicalStage: stage("2"),
    headline: "Interview 50 accountants. They are the buyers, not the SMBs.",
    atlassianMoment:
      "Xero's edge over MYOB was the accountant channel — Edwards (Xero co-founder, chartered accountant) opened doors the pure-tech founders couldn't. Two-founder profile matched the two-buyer market.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 46,
  },
  {
    phaseSlug: "3",
    canonicalStage: stage("3"),
    headline: "Size the market as 'accountants × their SMB client-base', not 'SMBs directly'.",
    atlassianMoment:
      "The Xero TAM slide multiplied ~30,000 AU accountants × avg ~50 SMB clients each = 1.5M reachable seats without a single direct-to-SMB ad.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 48,
  },
  {
    phaseSlug: "4",
    canonicalStage: stage("4"),
    headline: "Cloud-native from day one. Never ship a desktop installer.",
    atlassianMoment:
      "Xero's 2006 technical bet was 100% browser-native — a decision that aged into the mobile + collaboration future while MYOB spent a decade porting from desktop.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 54,
  },
  {
    phaseSlug: "5",
    canonicalStage: stage("5"),
    headline: "First 1,000 users through the accountant channel — not through Google Ads.",
    atlassianMoment:
      "Xero's early growth curve was 90%+ accountant-referred. The accountant recommendation is the highest-trust conversion event a SaaS accounting product can win.",
    sourceUrl: SRC_XERO_MEDIA,
    sviAtThisPoint: 58,
  },
  {
    phaseSlug: "6",
    canonicalStage: stage("6"),
    headline: "Charge from day one. Never a free tier for a paid-work product.",
    atlassianMoment:
      "Xero has always been paid-only. Free trials, yes — free forever, no. Accounting is paid work; charging matches the buyer's mental model.",
    sourceUrl: SRC_XERO_MEDIA,
    sviAtThisPoint: 62,
  },
  {
    phaseSlug: "7",
    canonicalStage: stage("7"),
    headline: "Subscriber count + ARR are the two numbers investors care about. Publish both monthly.",
    atlassianMoment:
      "Xero's quarterly subscriber updates became the pattern every ASX SaaS eventually copied. The market rewarded the disclosure with a premium multiple through 2016-2021.",
    sourceUrl: SRC_ASX_XRO,
    sviAtThisPoint: 70,
  },
  {
    phaseSlug: "8",
    canonicalStage: stage("8"),
    headline: "Second-time founders can 'go public young'. First-time founders should not copy this.",
    atlassianMoment:
      "The 2007 NZX IPO worked because of Drury's AfterMail brand + a lighter NZX compliance bar. First-time founders lacking the brand should treat IPO as a Series C/D substitute, not a Series A.",
    sourceUrl: SRC_DRURY_WIKI,
    sviAtThisPoint: 74,
  },
  {
    phaseSlug: "9",
    canonicalStage: stage("9"),
    headline: "Dual-list only if you have a specific TAM defence for the second market. Xero did (AU accountants).",
    atlassianMoment:
      "2012 ASX dual-listing was strategic — the AU accountant TAM was the real prize, and having local currency + local shareholders + local disclosure paid for the compliance overhead.",
    sourceUrl: SRC_ASX_XRO,
    sviAtThisPoint: 78,
  },
  {
    phaseSlug: "10",
    canonicalStage: stage("10"),
    headline: "Growth capital while listed is legal and normal. Don't be dogmatic that 'IPO = last raise'.",
    atlassianMoment:
      "2014 Matrix/Accel/Thiel US$150M private placement went into a public company at ~US$1.5B — funded the loss-making US chapter without a dilutive secondary on-market raise.",
    sourceUrl: SRC_WIKI,
    sviAtThisPoint: 82,
  },
  {
    phaseSlug: "11",
    canonicalStage: stage("11"),
    headline: "Prune your listings when the compliance cost outgrows the fundraising benefit.",
    atlassianMoment:
      "2018 NZX delist was pure cost + governance simplification. Once ASX volume dwarfed NZX volume, maintaining two boards was a self-inflicted tax.",
    sourceUrl: SRC_XERO_MEDIA,
    sviAtThisPoint: 84,
  },
  {
    phaseSlug: "12",
    canonicalStage: stage("12"),
    headline: "The 'founder → professional CEO' transition is a two-step: internal (Vamos 2018), then external (Cassidy 2022).",
    atlassianMoment:
      "Drury → Vamos (2018) was the scale hand-off; Vamos → Cassidy (2022) was the US-market + AI-era hand-off. Two-stage transitions preserve institutional memory while renewing strategic direction.",
    sourceUrl: SRC_XERO_MEDIA,
    sviAtThisPoint: 86,
  },
];

// ── SVI scores ────────────────────────────────────────────────────────────

const SVI_SCORES: SVIScore[] = [
  { criterion: "idea", score0to100: 88, rationale: "Cloud-native SMB accounting — displaced entrenched desktop incumbent (MYOB, QuickBooks Desktop) with browser-first UX." },
  { criterion: "market", score0to100: 90, rationale: "Every SMB globally needs accounting — 4.2M subscribers by 2024, still <5% of addressable global SMBs." },
  { criterion: "founder_profile", score0to100: 92, rationale: "Drury (2nd-time founder, AfterMail exit) + Edwards (chartered accountant) — technical + domain match to buyer." },
  { criterion: "code_git", score0to100: 82, rationale: "Cloud-native monolith → services architecture. Public engineering blog; strong CI/CD discipline." },
  { criterion: "website", score0to100: 88, rationale: "xero.com self-serve funnel with accountant-partner directory as second acquisition surface." },
  { criterion: "team", score0to100: 88, rationale: "5,000+ employees; multi-office (Wellington, Melbourne, Sydney, London, Denver, Auckland)." },
  { criterion: "customer_size", score0to100: 92, rationale: "4.2M subscribers (FY2024); mid-market SMB core + growing accountant channel." },
  { criterion: "gtm_strategy", score0to100: 93, rationale: "Accountant channel — 30k+ AU accountants recommend Xero to their SMB clients. Highest-trust distribution channel in accounting." },
  { criterion: "documents", score0to100: 91, rationale: "Full annual reports + investor days + monthly ASX disclosures. Model listed-company disclosure discipline." },
  { criterion: "dataroom", score0to100: 88, rationale: "S-1-equivalent NZX prospectus (2007) + full ASX filings since 2012." },
  { criterion: "team_structure", score0to100: 87, rationale: "Independent board pre-IPO; two clean CEO transitions (Drury→Vamos→Cassidy) without governance drama." },
  { criterion: "roadmap", score0to100: 87, rationale: "Ledger → payroll → invoicing → doc-capture (Hubdoc) → AI (Just Ask Xero) — coherent accountant-tool-chain adjacency stack." },
  { criterion: "revenue", score0to100: 91, rationale: "First full-year profitable 2020; ARR NZ$1.5B+ (FY2024); ~85% gross margin per annual report." },
];

// ── Agent reports (5) ──────────────────────────────────────────────────────

const AGENT_REPORTS: AgentReport[] = [
  {
    agent: "CEO",
    phaseSlug: "1",
    bodyMarkdown: `# What your CEO would have told 2006 Xero

## The moment
Drury's AfterMail cheque has cleared. He could semi-retire, angel-invest, or go again. He goes again — with a chartered accountant as co-founder.

## The strategic bet
- **Co-founder match to the buyer.** Accounting software is bought by two humans: the SMB owner and their accountant. Drury (tech) + Edwards (accountant) matched that market shape.
- **Cloud-first when 'cloud' was still risky.** 2006 SaaS was novel; the incumbent (MYOB) was desktop-installed. Betting on browser meant the product would only get better as bandwidth + browsers improved.
- **Use the exit brand to raise on story.** Drury's AfterMail exit funded the founding equity + let Xero IPO on NZX 6 months in — a move only a second-time founder could make credibly.

## What I'd have you copy
1. If you have an exit brand, spend it — an IPO on a smaller board (NZX, TSX) is a valid Series A substitute for a serial founder.
2. Match your co-founder to the second buyer, not the first. Xero didn't need two engineers; it needed one engineer + one accountant.
3. Ship on the technical bet that is 3 years away from good, not the one that is good today. Bandwidth + browsers only improved from 2006.
`,
    sources: [
      { label: "Wikipedia — Xero", url: SRC_WIKI },
      { label: "Wikipedia — Rod Drury", url: SRC_DRURY_WIKI },
    ],
  },
  {
    agent: "CFO",
    phaseSlug: "10",
    bodyMarkdown: `# What your CFO would have told 2007 Xero

## The moment
6 months after incorporation. NZX prospectus in draft. NZ$15M target. Is a listed cap table appropriate for a pre-revenue company?

## The answer
- **Yes, because the alternative is worse.** A pre-revenue NZ tech company in 2007 could not have raised NZ$15M at any reasonable valuation from private capital. NZX was the only pool of aligned money.
- **NZX's compliance bar is lower than ASX at this stage.** Half-yearly reporting, smaller free-float requirement, lighter continuous-disclosure discipline. The right listing venue for a Series-A-scale company.
- **Dual-list to ASX when the AU SMB revenue is real (2012).** Compliance cost of a second board only pays for itself when you have local shareholders + local currency + local news coverage in the second market.

## What I'd have you copy
1. If IPO is the only funding path that clears at your stage, don't over-romanticise 'private for as long as possible'.
2. Choose the listing venue with the lowest compliance bar first; upgrade when you outgrow it.
3. Delist secondary boards once volume + shareholder register consolidate — parallel-listing is a self-inflicted tax past that point.
`,
    sources: [
      { label: "Xero NZ media releases", url: SRC_XERO_NZ_MEDIA },
      { label: "ASX — XRO", url: SRC_ASX_XRO },
    ],
  },
  {
    agent: "CTO",
    phaseSlug: "4",
    bodyMarkdown: `# What your CTO would have told 2007 Xero

## The moment
Ledger v1 shipped. MYOB has a 20-year lead in feature coverage. What technical choices carry Xero for the next 15 years?

## The answer
- **Double-entry ledger as immutable event stream.** Xero's ledger core was designed so any transaction can be reconstructed from primitives. Later features (bank feeds, receipts, AI reconciliation) all bolt onto that primitive.
- **Public API from year 2.** Xero's API + app marketplace became a partner-driven ecosystem — 800+ apps by 2020, near-zero incremental engineering cost per app.
- **Multi-tenant single-instance architecture.** One codebase, one deployment, one DB (with per-tenant partitioning). No per-customer forks. This is what made Xero deployable to 4M subscribers without a headcount explosion.

## What I'd have you copy
1. Design your core data model as immutable events, not mutable records. It aged Xero for 15 years without a rewrite.
2. Ship a public API in year 2, not year 5. The marketplace ecosystem is a distributed engineering team.
3. Multi-tenant single-instance from day one. Per-customer forks are the fastest way to kill a SaaS margin.
`,
    sources: [
      { label: "Xero — investor reports", url: SRC_XERO_INVESTOR },
      { label: "Xero media releases", url: SRC_XERO_MEDIA },
    ],
  },
  {
    agent: "CMO",
    phaseSlug: "5",
    bodyMarkdown: `# What your CMO would have told 2010 Xero

## The moment
AU launch. MYOB owns the desktop. QuickBooks owns the US. What is the go-to-market that doesn't get lost in that noise?

## The answer
- **The accountant is the buyer.** Every SMB has an accountant, and the accountant chooses the software. Every marketing dollar goes to the accountant, not to the SMB.
- **Free training + certification for accountants.** Xero Partner Programme certifies accountants as 'Xero-preferred' — turns the accountant into an unpaid sales rep with a badge on their website.
- **Sponsor the accounting conferences, not the tech conferences.** CA ANZ, CPA Australia — these are the rooms where 30 AU accountants each with 50 SMB clients sit together.

## What I'd have you copy
1. Identify the human who chooses your product on behalf of the buyer. Sell to that human, not the buyer.
2. Certification programs are a marketing channel — they generate LinkedIn badges + partner directory listings that outlast any ad campaign.
3. Sponsor the industry conference of your channel partner, not the industry conference of your end user.
`,
    sources: [
      { label: "Xero media releases", url: SRC_XERO_MEDIA },
    ],
  },
  {
    agent: "COO",
    phaseSlug: "11",
    bodyMarkdown: `# What your COO would have told 2018 Xero

## The moment
Vamos succeeds Drury. NZX delist announced. US business still loss-making. What operational discipline lands the profitability year?

## The answer
- **NZX delist saves $2-4M/year in compliance + investor-relations overhead.** Small, but every basis point compounds.
- **Pull US spend on to a growth-with-margin plan.** Not 'exit US' — cut the loss trajectory from 'unlimited' to 'zero by FY2020' with a hard budget line.
- **Bank feeds + AU payroll integration are the retention lever.** Every SMB that connects a bank feed is 3× less likely to churn. Prioritise integrations over new modules.

## What I'd have you copy
1. When you inherit a founder-scale org, prune the compliance line-items the founder never questioned. Small savings, high signal.
2. Loss-making expansions get budget caps + sunset dates, not open-ended narratives.
3. Rank feature work by 'retention lift × user population' rather than 'shiny new module'. Bank feeds beat modules every time.
`,
    sources: [
      { label: "Xero media releases", url: SRC_XERO_MEDIA },
      { label: "ASX — XRO", url: SRC_ASX_XRO },
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
  { category: CAT_CORP, title: "NZX prospectus — Xero Limited IPO (2007)", status: "present", phaseSlug: "10", sourceUrl: SRC_NZX_ARCHIVE },
  { category: CAT_CORP, title: "ASX dual-listing prospectus (2012)", status: "present", phaseSlug: "11", sourceUrl: SRC_ASX_XRO },
  { category: CAT_CORP, title: "NZX delisting notice (2018)", status: "present", phaseSlug: "11", sourceUrl: SRC_XERO_MEDIA },
  { category: CAT_CAP, title: "Founder cap table pre-IPO (2007)", status: "redacted", phaseSlug: "10" },
  { category: CAT_CAP, title: "Matrix Capital / Accel / Thiel US$150M PIPE (2014)", status: "present", phaseSlug: "11", sourceUrl: SRC_WIKI },
  { category: CAT_CAP, title: "ESOP plan + Long-Term Incentive Plan (per Xero annual reports)", status: "present", phaseSlug: "11", sourceUrl: SRC_XERO_INVESTOR },
  { category: CAT_FIN, title: "Xero FY2020 annual report — first full-year profit", status: "present", phaseSlug: "11", sourceUrl: SRC_XERO_INVESTOR },
  { category: CAT_FIN, title: "Xero FY2024 annual report — 4.2M subscribers", status: "present", phaseSlug: "11", sourceUrl: SRC_XERO_INVESTOR },
  { category: CAT_FIN, title: "Monthly subscriber + ARR investor updates (2014-2024)", status: "present", phaseSlug: "11", sourceUrl: SRC_XERO_INVESTOR },
  { category: CAT_PROD, title: "Public API + app marketplace docs (developer.xero.com)", status: "present", phaseSlug: "11", sourceUrl: SRC_WIKI },
  { category: CAT_PROD, title: "Hubdoc + Instafile acquisition briefs (2019)", status: "redacted", phaseSlug: "11", sourceUrl: SRC_XERO_MEDIA },
  { category: CAT_MKT, title: "Xero Partner Programme — accountant certification data", status: "inferred", phaseSlug: "5", sourceUrl: SRC_XERO_MEDIA },
  { category: CAT_TEAM, title: "CEO transitions — Drury→Vamos (2018), Vamos→Cassidy (2022)", status: "present", phaseSlug: "12", sourceUrl: SRC_XERO_MEDIA },
  { category: CAT_STRAT, title: "Xero AI (Just Ask Xero) roadmap disclosures (2024)", status: "present", phaseSlug: "11", sourceUrl: SRC_XERO_MEDIA },
  { category: CAT_TAX, title: "R&D Tax Incentive claims — Xero Australia Pty Ltd", status: "inferred", phaseSlug: "6" },
];

// ── Valuation snapshots ────────────────────────────────────────────────────

const VALUATIONS: ValuationSnapshot[] = [
  { timestamp: "2007-IPO", method: "Comparables", valueAUD: 55_000_000, fxRate: 0.85, narrative: "NZ$55M market cap first day × FX 0.85 NZD/AUD (2007) → ~A$47M; rounded.", sourceUrl: SRC_XERO_NZ_MEDIA },
  { timestamp: "2007-IPO", method: "Berkus", valueAUD: 3_300_000, fxRate: 0.85, narrative: "Berkus cap for pre-revenue product + founding team.", sourceUrl: SRC_WIKI },
  { timestamp: "2012-ASX", method: "Comparables", valueAUD: 400_000_000, fxRate: 0.79, narrative: "Dual-listing valuation ~NZ$500M × FX ~0.80 NZD/AUD = ~A$400M.", sourceUrl: SRC_ASX_XRO },
  { timestamp: "2014-Matrix", method: "Comparables", valueAUD: 1_700_000_000, fxRate: 1.10, narrative: "US$1.5B post × FX 1.10 = ~A$1.65B; rounded.", sourceUrl: SRC_WIKI },
  { timestamp: "2020-Profit", method: "Comparables", valueAUD: 26_000_000_000, fxRate: 1.00, narrative: "ASX market cap peak ~A$26B during 2020-21 pandemic SaaS re-rating.", sourceUrl: SRC_ASX_XRO },
  { timestamp: "2020-Profit", method: "DCF", valueAUD: 22_000_000_000, fxRate: 1.00, narrative: "DCF on NZ$820M ARR × 25× × FX; supports peak market cap.", sourceUrl: SRC_XERO_INVESTOR },
  { timestamp: "2026-current", method: "Comparables", valueAUD: 25_000_000_000, fxRate: 1.00, narrative: "ASX market cap ~A$25B (2024 Xero AI announcement window).", sourceUrl: SRC_ASX_XRO },
  { timestamp: "2026-current", method: "DCF", valueAUD: 24_000_000_000, fxRate: 1.00, narrative: "DCF on NZ$1.5B+ ARR × 15× × FX + margin lift from restructuring.", sourceUrl: SRC_XERO_INVESTOR },
];

// ── Assembled fixture ─────────────────────────────────────────────────────

export const XERO_DEMO: XeroDemo = {
  profile: {
    name: "Xero",
    foundedYear: 2006,
    founders: ["Rod Drury", "Hamish Edwards"],
    hqCity: "Wellington",
    ticker: "ASX:XRO",
    url: "https://www.xero.com",
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
  milestones: XeroMilestone[];
}> {
  const buckets = new Map<number, XeroMilestone[]>();
  for (const m of XERO_DEMO.milestones) {
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
