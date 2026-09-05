import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { computeScore, type ScoreInput } from "@/lib/score";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { newSlug } from "@/lib/slug";
import { sendScoreReady } from "@/lib/email";
import { getCurrentUser } from "@/lib/auth";
import {
  buildVcValuationReport,
  type BuildVcValuationInput,
} from "@/lib/agents/cfo-valuation";

// ── Wave 29/30: 8-Dimension SVI Analysis + 13 Criteria Sub-breakdown ─────────

export interface CriterionResult {
  key: string;
  title: string;
  subtitle: string;
  score: number; // 0–100
  status: "strong" | "developing" | "gap";
  commentary: string; // 2-sentence specific commentary
}

export interface SviDimAnalysis {
  dim: string;
  label: string;
  score: number; // 0–100
  status: "strong" | "developing" | "gap"; // green / amber / red
  commentary: string; // 5-sentence deterministic assessment
  weight: number; // SVI weight %
  criteria: CriterionResult[]; // Wave 30 — per-criterion breakdown
}

export interface RiskItem {
  criterion: string;
  title: string;
  severity: "critical" | "major" | "moderate";
  impact: string;
  fix: string;
}

export interface SviFullAnalysis {
  dims: SviDimAnalysis[];
  executiveSummary: string;
  topThreePriorities: string[];
  riskRegister: RiskItem[]; // Wave 30 — top 5 weakest criteria
}

// ── Wave 30: Per-criterion scoring helpers ────────────────────────────────────

const scoreOf = (s: number): "strong" | "developing" | "gap" =>
  s >= 70 ? "strong" : s >= 45 ? "developing" : "gap";

function buildCriterionCommentary(key: string, score: number, inputs: ScoreInput): string {
  const mrr = inputs.monthlyRevenue ?? 0;
  const stage = inputs.stage ?? "seed";
  const commentaries: Record<string, () => string> = {
    founder_profile: () => {
      const exp = inputs.founders > 1
        ? `A ${inputs.founders}-person founding team brings complementary domain expertise in ${inputs.sector.toUpperCase()}, which materially reduces key-person risk.`
        : "A solo-founder structure concentrates execution and knowledge risk — investors will probe this heavily in early conversations.";
      const action = score < 65
        ? "Adding a co-founder or experienced operator with complementary skills is the highest-leverage move to improve this criterion."
        : "Documenting each founder's track record, prior exits, and domain wins in a single-page bio will strengthen due diligence conversations.";
      return `${exp} ${action}`;
    },
    team: () => {
      const teamCtx = inputs.founders >= 4
        ? `A team of ${inputs.founders} people signals meaningful operational capacity and reduces single-point-of-failure risk.`
        : inputs.founders >= 2
          ? `With ${inputs.founders} team members, the founding unit is lean but functional — scalability of the team will be questioned at Series A.`
          : "A solo operator faces questions about execution bandwidth and key-person dependency from institutional investors.";
      const action = score < 65
        ? "Defining clear functional roles (CEO/CTO/CMO split) and publishing an org chart will demonstrate intentional team design."
        : "Establishing an advisory board with at least 2 industry-specific advisors adds credibility and fills skill gaps cost-effectively.";
      return `${teamCtx} ${action}`;
    },
    market: () => {
      const tam = inputs.monthlyRevenue * 12 * 100; // rough implied TAM proxy
      const marketCtx = inputs.sector === "saas" || inputs.sector === "fintech"
        ? `The ${inputs.sector.toUpperCase()} sector carries strong investor appetite in AU, with multiple comparable transactions at the ${stage} stage supporting valuation theses.`
        : `The ${inputs.sector.toUpperCase()} sector has a more selective investor base in AU — a tight problem-market fit narrative is essential.`;
      const action = score < 65
        ? "Conducting 10+ structured customer discovery interviews and publishing a TAM/SAM/SOM breakdown with verifiable data sources will sharpen the market thesis."
        : "Quantifying the market with a bottom-up sizing model and citing 2–3 recent analyst reports will make the investor pitch defensible.";
      return `${marketCtx} ${action}`;
    },
    website: () => {
      const webCtx = mrr > 0
        ? `An active product generating A$${Math.round(mrr).toLocaleString()}/month MRR implies a functioning digital presence that validates the go-to-market channel.`
        : "Pre-revenue status means the website must work harder as a conviction-builder, demonstrating product clarity and social proof before commercial validation.";
      const action = score < 55
        ? "Investing in a clear above-the-fold value proposition, 3 customer testimonials, and a working demo or free-trial flow will meaningfully improve conversion signals."
        : "Adding a metrics-transparency page or live traction counter reinforces credibility for investors evaluating organic interest.";
      return `${webCtx} ${action}`;
    },
    idea: () => {
      const stageCtx = stage === "pre-seed" || stage === "seed"
        ? `At the ${stage} stage, idea quality is the primary signal for investors — execution evidence is expected to be limited by definition.`
        : `At ${stage}, the innovation thesis should be anchored in demonstrated product usage, not just conceptual novelty.`;
      const action = score < 55
        ? "Articulating a single, non-obvious insight that competitors have missed — and supporting it with 5+ customer quotes — will sharpen the idea narrative significantly."
        : "Writing a product vision document that connects the current idea to a 3-year platform thesis demonstrates strategic depth that investors value.";
      return `${stageCtx} ${action}`;
    },
    code_git: () => {
      const stageCtx = stage === "pre-seed"
        ? "At pre-seed, a private prototype or MVP codebase is sufficient — investors will assess architecture decisions rather than code volume."
        : `At ${stage}, code quality and engineering rigour are scrutinised more closely — test coverage, CI/CD pipelines, and security practices become visible signals.`;
      const action = score < 55
        ? "Creating a GitHub or GitLab repository with a clear README, architecture diagram, and contributing guide establishes technical credibility before a CTO review."
        : "Adding automated test coverage above 60% and a CI/CD pipeline that runs on every PR will satisfy technical due diligence requirements at Series A.";
      return `${stageCtx} ${action}`;
    },
    roadmap: () => {
      const roCtx = stage === "series-a" || stage === "growth"
        ? `At ${stage}, investors expect a 12-18 month roadmap with clearly gated milestones linked to funding tranches and KPI targets.`
        : `At ${stage}, a 3-6 month near-term roadmap with 3 defined milestone outcomes is the minimum credible product plan to share with investors.`;
      const action = score < 55
        ? "Publishing a roadmap in a shared tool (Notion, Linear, or Trello) with dates, owners, and success metrics transforms product conversations from conceptual to operational."
        : "Linking each roadmap milestone to a revenue or retention metric will make the plan investor-legible and demonstrate data-driven product decision-making.";
      return `${roCtx} ${action}`;
    },
    customer_size: () => {
      const custCtx = mrr > 0
        ? `Commercial traction of A$${Math.round(mrr).toLocaleString()}/month MRR implies a paying customer base that validates product-market fit at some level.`
        : "No commercial traction means the customer evidence story relies entirely on users, pilots, or letters of intent — each of which carries progressively less weight with investors.";
      const action = score < 55
        ? "Signing 1–3 paying anchor customers and documenting their use case, outcome, and willingness to provide a reference would be a transformative milestone for investor conversations."
        : "Building a customer dashboard that tracks cohort retention, NPS, and expansion MRR will give investors the traction narrative they need at due diligence.";
      return `${custCtx} ${action}`;
    },
    revenue: () => {
      const revCtx = mrr >= 100000
        ? `Monthly revenue of A$${Math.round(mrr / 1000)}k/month puts the business firmly in commercial traction territory — the investor conversation shifts from 'if' to 'how fast'.`
        : mrr >= 20000
          ? `Revenue of A$${Math.round(mrr / 1000)}k/month shows early validation but investors will probe growth rate and unit economics closely.`
          : mrr > 0
            ? `Revenue of A$${Math.round(mrr).toLocaleString()}/month is an important signal — even at early scale, it proves willingness-to-pay which qualitative evidence cannot.`
            : "Pre-revenue status is the largest single risk signal for institutional investors — closing even A$1k MRR changes the investor conversation materially.";
      const action = score < 55
        ? "Prioritising the close of 1–3 paying customers at any price point transforms the story from 'idea' to 'business' — execute this before any pitch meeting."
        : "Documenting month-on-month MRR growth, churn rate, and net revenue retention in a single chart provides the investor-grade traction narrative needed at Series A.";
      return `${revCtx} ${action}`;
    },
    gtm_strategy: () => {
      const gtmCtx = stage === "pre-seed"
        ? "At pre-seed, a directional go-to-market hypothesis is sufficient — investors are evaluating founder thinking, not proven channels."
        : `At ${stage}, the GTM strategy should be evidenced by actual CAC data, conversion rates, and at least one proven acquisition channel with consistent performance.`;
      const action = score < 55
        ? "Defining 2 primary acquisition channels with a cost-per-acquisition hypothesis and a 90-day test plan is the minimum GTM evidence for a credible pitch deck."
        : "Publishing a GTM playbook that documents ICP, messaging, channel mix, and a 12-month acquisition target will satisfy institutional investor scrutiny at Series A.";
      return `${gtmCtx} ${action}`;
    },
    documents: () => {
      const docCtx = inputs.hasShareholdersAgreement && inputs.hasFinancialAudit
        ? "A shareholders agreement and audited financials are both in place — these two documents resolve the most common blocking issues in investor due diligence."
        : inputs.hasShareholdersAgreement
          ? "A shareholders agreement is in place, covering the most critical governance document, but audited financials are still outstanding."
          : inputs.hasFinancialAudit
            ? "Audited financials are in place, but the absence of a shareholders agreement will block any institutional round."
            : "Neither a shareholders agreement nor audited financials are confirmed — both are blocking issues for institutional capital.";
      const action = score < 55
        ? "Engaging an AU startup lawyer to draft an SHA and a Big-4-affiliated accountant to prepare a financial review should be the immediate priority — typically A$3-8k combined."
        : "Adding a one-page executive summary and a 3-year financial projection model with bear/base/bull scenarios will complete the core document set for investor readiness.";
      return `${docCtx} ${action}`;
    },
    dataroom: () => {
      const drCtx = inputs.hasFinancialAudit
        ? "Audited financials anchor the data room with the most credible financial evidence — investors will move through due diligence faster with this in place."
        : "Without audited financials, the data room will face scrutiny on financial claims — management accounts with a detailed assumptions sheet are the minimum substitute.";
      const action = score < 55
        ? "Organising a data room across 5 folders — Legal, Financial, Product, Team, and Traction — with named documents in each takes 4–6 hours and immediately signals institutional readiness."
        : "Keeping the data room updated monthly and enabling granular access tracking (per-document views, time spent) creates leverage in negotiations with multiple investors.";
      return `${drCtx} ${action}`;
    },
    regulatory_compliance: () => {
      const registered = (inputs as ScoreInput & { companyRegistered?: boolean }).companyRegistered ?? true;
      const sectorCtx = inputs.sector === "fintech" || (inputs.sector as string) === "healthtech"
        ? `${inputs.sector.toUpperCase()} carries a heavier compliance burden in AU — AFSL/AUSTRAC or TGA/APP-3 obligations extend well beyond baseline ASIC filings.`
        : `Operating in ${inputs.sector.toUpperCase()} keeps the compliance surface closer to standard ASIC and ATO obligations, without the sector-specific licensing overhead that regulated verticals carry.`;
      const action = registered
        ? score < 65
          ? "Documenting an ASIC filings register, director consents, and a sector-specific compliance checklist would materially strengthen investor confidence in this criterion."
          : "The company is registered with ASIC and baseline compliance posture is in place — sustaining this with an annual compliance health check will preserve investor-grade evidence."
        : "Company registration is the foundational compliance step — completing ASIC incorporation and constitution filings should precede any investor conversation.";
      return `${sectorCtx} ${action}`;
    },
    ip_protection: () => {
      const shaCtx = inputs.hasShareholdersAgreement
        ? "A shareholders agreement is in place, which typically bundles IP assignment clauses that transfer founder and contributor IP to the company — the single most important IP posture signal for investors."
        : `Without a shareholders agreement, IP assignment from founders and early contributors is likely undocumented — a hard blocker for institutional due diligence in ${inputs.sector.toUpperCase()}.`;
      const action = score < 65
        ? "Filing at least one trademark for the brand name and executing IP assignment deeds with all founders and contractors would meaningfully lift this criterion within 30 days."
        : "Maintaining a live IP register (trademarks, copyright, IP deeds, contributor agreements) and refreshing it quarterly will preserve institutional-grade IP evidence.";
      return `${shaCtx} ${action}`;
    },
    team_structure: () => {
      const structCtx = inputs.hasBoardMeetings
        ? "Regular board meetings signal governance maturity and create a documented decision trail that institutional investors expect to see during due diligence."
        : "Without a formal board cadence, governance decisions appear ad hoc — this is a yellow flag that compounds other governance concerns during due diligence.";
      const action = score < 55
        ? "Establishing a quarterly board meeting with a standard agenda (financials, KPIs, strategic decisions, risk register) and circulating minutes within 14 days establishes a formal governance record."
        : "Adding 1–2 independent directors with relevant domain expertise (sector or finance) elevates the governance structure to the standard expected at Series A.";
      return `${structCtx} ${action}`;
    },
    customer_concentration: () => {
      const mktCtx = inputs.sector === "saas" || inputs.sector === "fintech"
        ? `In ${inputs.sector.toUpperCase()}, revenue of A$${Math.round(mrr).toLocaleString()}/month ${mrr > 50000 ? "across multiple subscription accounts suggests manageable concentration risk" : "at early scale carries higher concentration risk if anchored to a small number of accounts"}.`
        : `In the ${inputs.sector.toUpperCase()} sector, revenue of A$${Math.round(mrr).toLocaleString()}/month ${mrr > 50000 ? "at scale suggests some diversification, though concentration metrics should be documented" : "at early scale often concentrates in 1–2 anchor accounts — a risk that investors will probe during due diligence"}.`;
      const investorImpact = "Customer concentration is a key due-diligence focus — investors want to see that no single customer represents more than 20–30% of ARR, as departure of one anchor customer can materially damage the business.";
      const action = score < 55
        ? "Actively diversifying the customer base by targeting 3–5 additional ICP accounts in the next 90 days will reduce concentration exposure and strengthen the revenue quality narrative."
        : "Documenting customer concentration metrics (top-5 customer share of ARR, churn by cohort) in the data room will give investors the evidence they need to assess revenue quality.";
      return `${mktCtx} ${investorImpact} ${action}`;
    },
    growth_trajectory: () => {
      const growthCtx = mrr > 50000
        ? `Revenue of A$${Math.round(mrr / 1000)}k/month after ${inputs.yearsTrading} year${inputs.yearsTrading === 1 ? "" : "s"} of trading implies a growth trajectory that institutional investors can model — the focus shifts to growth rate documentation.`
        : mrr > 10000
          ? `Revenue of A$${Math.round(mrr / 1000)}k/month over ${inputs.yearsTrading} year${inputs.yearsTrading === 1 ? "" : "s"} suggests early traction, but the trajectory needs to be evidenced with month-on-month data to support a growth narrative.`
          : `Early-stage revenue of A$${Math.round(mrr).toLocaleString()}/month over ${inputs.yearsTrading} year${inputs.yearsTrading === 1 ? "" : "s"} means the growth trajectory is not yet established — this is the most important signal to build over the next quarter.`;
      const investorImpact = "Growth trajectory is the single most powerful signal for institutional investors at the seed and Series A stages — a clear month-on-month growth chart with annotated inflection points transforms the investor conversation.";
      const action = score < 55
        ? "Building a simple monthly revenue tracker and identifying the top 3 levers that drove each growth spike will establish the trajectory narrative needed for investor pitches."
        : "Presenting MoM growth rate alongside net revenue retention and payback period in a single traction slide creates a complete investor-grade growth story.";
      return `${growthCtx} ${investorImpact} ${action}`;
    },
    vesting_schedule: () => {
      const esopCtx = inputs.esopAllocated >= 8 && inputs.esopAllocated <= 15
        ? `An ESOP pool of ${inputs.esopAllocated}% is within the 8–15% range expected by AU investors — this signals that equity is available to attract key hires without requiring a pool top-up at closing.`
        : inputs.esopAllocated > 15
          ? `An ESOP pool of ${inputs.esopAllocated}% is above the typical 8–15% range — investors will scrutinise whether the pool is appropriately structured and may require a reset before closing.`
          : inputs.esopAllocated > 0
            ? `An ESOP pool of ${inputs.esopAllocated}% exists but is below the 8% minimum expected by most AU institutional investors — a top-up condition is likely in any term sheet.`
            : "No ESOP pool is a structural gap for institutional investors — it signals the company is not yet prepared to incentivise and retain key hires with equity.";
      const investorImpact = "Documented 4-year vesting with a 1-year cliff for all founders and key hires is the AU market standard — undocumented or non-standard vesting creates negotiation risk and due-diligence friction.";
      const action = score < 55
        ? "Formalising a vesting schedule for all founders in the shareholders agreement and topping the ESOP pool to 10% can both be achieved within 30 days with an AU startup lawyer."
        : "Ensuring all option grants are documented in a signed deed of grant with vesting terms, and maintaining a live option register, will satisfy institutional due-diligence requirements.";
      return `${esopCtx} ${investorImpact} ${action}`;
    },
    investor_rights: () => {
      const shaCtx = inputs.hasShareholdersAgreement
        ? `A shareholders agreement is in place at the ${stage} stage — this is a prerequisite for institutional investment and typically defines drag-along rights, information rights, and anti-dilution provisions.`
        : `Without a shareholders agreement at the ${stage} stage, investor rights are undefined — this creates uncertainty around information rights, voting thresholds, and protective provisions that institutional investors require.`;
      const investorImpact = "Investor rights provisions — including information rights, pre-emptive rights, drag-along, and tag-along — are non-negotiable for institutional investors and must be documented before any serious term-sheet conversation.";
      const action = score < 55
        ? "Engaging an AU startup lawyer to draft an SHA with standard investor rights provisions should be the immediate priority — typically A$2-5k and can be completed in 2–3 weeks."
        : "Reviewing the SHA to ensure it includes pro-rata rights, ROFR, and a drag-along threshold appropriate for your cap table will prepare you for institutional round negotiations.";
      return `${shaCtx} ${investorImpact} ${action}`;
    },
    data_room_readiness: () => {
      const drCtx = inputs.hasFinancialAudit && inputs.hasShareholdersAgreement
        ? "Both audited financials and a shareholders agreement are in place — these two documents anchor the data room and resolve the most common blocking issues in institutional due diligence."
        : inputs.hasFinancialAudit
          ? "Audited financials are in place, providing a strong financial evidence base, but the absence of a shareholders agreement will create friction in the legal section of due diligence."
          : inputs.hasShareholdersAgreement
            ? "A shareholders agreement is in place, but unaudited financials mean investors will need to rely on management accounts — this increases scrutiny and may slow closing."
            : "Neither audited financials nor a shareholders agreement are confirmed — these are the two highest-priority documents to establish before approaching institutional investors.";
      const investorImpact = "A structured, permissioned data room with clearly named folders and up-to-date documents signals operational maturity — investors who cannot find key documents quickly tend to deprioritise the deal.";
      const action = score < 55
        ? "Organising a 5-folder data room (Legal, Financial, Product, Team, Traction) with at least one document in each folder takes 4–6 hours and immediately signals institutional readiness."
        : "Adding granular access tracking (per-document views, time spent) and refreshing the data room monthly will create leverage in negotiations and demonstrate ongoing operational discipline.";
      return `${drCtx} ${investorImpact} ${action}`;
    },
    due_diligence_score: () => {
      const ddCtx = inputs.yearsTrading >= 3
        ? `With ${inputs.yearsTrading} years of trading history, ASIC filings, tax records, and operational documentation should be substantive and available for inspection — this is a positive signal for due-diligence completeness.`
        : inputs.yearsTrading >= 1
          ? `With ${inputs.yearsTrading} year${inputs.yearsTrading === 1 ? "" : "s"} of trading history, some operational records exist, but the evidence base is still building — investors will be more forgiving but will probe for consistency.`
          : "A pre-trading company has minimal operational history — investors will focus entirely on founder credentials, documentation quality, and the strength of the business plan.";
      const boardCtx = inputs.hasBoardMeetings
        ? " Regular board meetings create a documented decision trail that technical due-diligence reviewers can verify — this materially accelerates the DD process."
        : " The absence of board meeting minutes means investors cannot verify governance decisions independently — a recurring yellow flag in institutional due diligence.";
      const investorImpact = "Due-diligence completeness directly affects deal velocity — well-prepared companies with complete records typically close 40–60% faster than those with documentation gaps, reducing the risk of deal fatigue.";
      const action = score < 55
        ? "Creating a DD readiness checklist across legal, financial, product, and HR domains — and completing 80% of items before any investor conversation — will dramatically reduce closing friction."
        : "Running a mock due-diligence exercise with a trusted advisor will surface gaps that are invisible from inside the founding team and prepare you for the institutional process.";
      return `${ddCtx}${boardCtx} ${investorImpact} ${action}`;
    },
    employment_contracts: () => {
      const empCtx = inputs.founders >= 3
        ? `With ${inputs.founders} founders and ${inputs.yearsTrading} year${inputs.yearsTrading === 1 ? "" : "s"} of trading history, employment contract documentation becomes an increasing priority — undocumented team arrangements create legal and IP risk.`
        : inputs.yearsTrading >= 2
          ? `After ${inputs.yearsTrading} years of trading, employment contracts and contractor agreements should be formalised — investors will probe the legal basis of each team member's engagement during due diligence.`
          : `At ${inputs.yearsTrading} year${inputs.yearsTrading === 1 ? "" : "s"} of trading, employment documentation may still be informal — this is acceptable at early stages but should be formalised before any institutional conversation.`;
      const investorImpact = "Employment contracts, IP assignment clauses, and contractor agreements are reviewed in every institutional due diligence — undocumented arrangements create contingent liabilities that can delay or block closing.";
      const action = score < 55
        ? "Ensuring all team members (employees and contractors) have signed agreements that include IP assignment, confidentiality, and non-compete clauses should be the immediate legal priority — typically A$1-2k per set of templates."
        : "Conducting an annual employment law review with an AU employment lawyer to update contracts for legislative changes will maintain institutional-grade HR documentation.";
      return `${empCtx} ${investorImpact} ${action}`;
    },
    privacy_compliance: () => {
      const sectorCtx = inputs.sector === "fintech" || (inputs.sector as string) === "healthtech"
        ? `Operating in ${inputs.sector.toUpperCase()} places the company within a heavily regulated privacy environment — ${inputs.sector === "fintech" ? "AUSTRAC AML/CTF obligations, AFSL requirements, and the Privacy Act APP-3 provisions" : "the My Health Records Act, Notifiable Data Breaches scheme, and APP obligations"} apply and must be evidenced.`
        : `In the ${inputs.sector.toUpperCase()} sector, the primary privacy obligations are the Australian Privacy Principles under the Privacy Act 1988 — applicable once annual turnover exceeds A$3M or sensitive data is handled.`;
      const investorImpact = "Privacy compliance gaps are increasingly deal-critical — institutional investors and their legal advisors routinely flag Privacy Act non-compliance as a material risk in AU due diligence, particularly post-2024 reforms.";
      const action = score < 55
        ? "Publishing a Privacy Policy, completing an AU-compliant privacy impact assessment, and registering a privacy officer role within the business are the three immediate actions that resolve most privacy due-diligence flags."
        : "Ensuring the Privacy Policy covers the 13 APPs, implementing a data breach response plan, and completing the OAIC's privacy governance self-assessment will maintain institutional-grade compliance posture.";
      return `${sectorCtx} ${investorImpact} ${action}`;
    },
    competitive_moat: () => {
      const moatCtx = inputs.sector === "saas" || inputs.sector === "fintech"
        ? `In ${inputs.sector.toUpperCase()}, the most durable moats derive from data network effects, workflow embedding, and switching costs — ${inputs.hasShareholdersAgreement ? "with governance structures in place, the company is positioned to protect and build on early moat signals" : "formalising governance structures will help protect and document emerging competitive advantages"}.`
        : inputs.sector === "devtools"
          ? `In DevTools, competitive moats typically derive from developer workflow integration, community adoption, and platform ecosystem lock-in — documenting these dynamics is critical for investor conversations.`
          : `The competitive moat in ${inputs.sector.toUpperCase()} typically derives from brand trust, distribution relationships, or regulatory positioning — these must be explicitly articulated and evidenced for institutional investors.`;
      const investorImpact = "A clearly defined and defensible competitive moat is one of the top 3 due-diligence questions from institutional investors — without it, premium valuation multiples cannot be justified.";
      const action = score < 55
        ? "Writing a 1-page competitive moat analysis that identifies the specific mechanism (data, switching costs, network effects, or regulatory barrier) and explains why it compounds over time is the highest-leverage strategic action."
        : "Documenting the moat evidence with supporting data (customer retention rates, integration depth, data asset inventory) will make the competitive positioning defensible in due diligence.";
      return `${moatCtx} ${investorImpact} ${action}`;
    },
    exit_optionality: () => {
      const exitCtx = stage === "series-a" || stage === "growth"
        ? `At the ${stage} stage with A$${Math.round(mrr / 1000)}k/month MRR, the business is entering the zone where strategic acquirers and PE buyers begin active monitoring — exit optionality is high if the revenue trajectory is sustained.`
        : mrr > 50000
          ? `With A$${Math.round(mrr / 1000)}k/month MRR at the ${stage} stage, early exit signals are emerging — maintaining growth and governance discipline now will maximise option value at the eventual liquidity event.`
          : `At the ${stage} stage with pre-scale revenue, exit optionality is primarily a strategic consideration — building the right foundations now determines which exit paths will be available in 3–5 years.`;
      const investorImpact = "Investors at every stage are underwriting a specific exit thesis — trade sale, PE-backed buyout, or IPO. A startup that can articulate 2–3 credible exit paths and name relevant acquirer categories is a more compelling investment than one that cannot.";
      const action = score < 55
        ? "Researching the last 10 M&A transactions in your sector globally and identifying 3–5 strategic acquirer categories gives investors the exit context they need to underwrite their return model."
        : "Maintaining a live competitive landscape map and tracking acquirer activity in the sector signals strategic awareness and positions the company as a knowledgeable participant in the M&A market.";
      return `${exitCtx} ${investorImpact} ${action}`;
    },
  };
  return commentaries[key]?.()
    ?? `This criterion scores ${score}/100, indicating ${score >= 70 ? "strong evidence" : score >= 45 ? "a developing evidence base" : "a significant gap"} that needs attention before investor conversations.`;
}

function computeCriteriaForDim(dim: string, inputs: ScoreInput): CriterionResult[] {
  const mrr = inputs.monthlyRevenue ?? 0;
  const stage = inputs.stage ?? "seed";
  const founders = inputs.founders ?? 1;

  const make = (key: string, title: string, subtitle: string, rawScore: number): CriterionResult => {
    const score = Math.min(100, Math.max(0, Math.round(rawScore)));
    return { key, title, subtitle, score, status: scoreOf(score), commentary: buildCriterionCommentary(key, score, inputs) };
  };

  switch (dim) {
    case "ftv": return [
      make("founder_profile", "Founder Profile", "Background, track record, domain expertise",
        (inputs.founders > 1 ? 65 : 35) + (stage === "series-a" || stage === "growth" ? 15 : stage === "seed" ? 8 : 0) + (inputs.sector === "saas" || inputs.sector === "fintech" ? 5 : 0)
      ),
      make("team", "Team Composition", "Skills, complementary expertise, hiring plan",
        founders === 1 ? 45 : founders <= 3 ? 65 : founders <= 6 ? 80 : 90
      ),
      make("team_structure", "Team Structure & Governance", "Org chart, roles, advisory board",
        (inputs.hasBoardMeetings ? 55 : 25) + (inputs.hasShareholdersAgreement ? 20 : 0) + (founders >= 2 ? 10 : 0)
      ),
      make("founder_market_fit", "Founder–Market Fit", "Domain expertise depth, prior sector experience",
        (inputs.sector === "saas" || inputs.sector === "fintech" || inputs.sector === "devtools" ? 55 : 40)
        + (stage === "series-a" || stage === "growth" ? 20 : stage === "seed" ? 10 : 0)
        + (inputs.yearsTrading >= 3 ? 15 : inputs.yearsTrading >= 1 ? 8 : 0)
      ),
    ];
    case "mpc": return [
      make("market", "Market Opportunity", "TAM/SAM/SOM, timing, competitive landscape",
        inputs.sector === "saas" ? 72 : inputs.sector === "fintech" ? 68 : inputs.sector === "devtools" ? 66 : inputs.sector === "marketplace" ? 60 : 55
      ),
      make("idea", "Idea & Innovation", "Uniqueness, problem-solution fit, innovation level",
        stage === "pre-seed" ? 50 : stage === "seed" ? 62 : stage === "series-a" ? 72 : stage === "growth" ? 80 : 55
      ),
      make("gtm_strategy", "Go-to-Market Strategy", "Distribution channels, pricing, acquisition strategy",
        (stage === "series-a" || stage === "growth" ? 70 : stage === "seed" ? 58 : 45) + (mrr > 20000 ? 10 : mrr > 0 ? 5 : 0)
      ),
      make("competitive_positioning", "Competitive Positioning", "Differentiation, moat clarity, competitor mapping",
        (inputs.sector === "saas" || inputs.sector === "fintech" ? 60 : 48)
        + (mrr > 20000 ? 15 : mrr > 5000 ? 8 : 0)
        + (stage === "series-a" || stage === "growth" ? 12 : 0)
      ),
    ];
    case "ptd": return [
      make("idea", "Idea & Innovation", "Product stage, technical complexity",
        stage === "pre-seed" ? 40 : stage === "seed" ? 58 : stage === "series-a" ? 72 : stage === "growth" ? 82 : 45
      ),
      make("code_git", "Code & Git Repository", "Code quality, architecture, commit history",
        stage === "pre-seed" ? 30 : stage === "seed" ? 50 : stage === "series-a" ? 70 : stage === "growth" ? 82 : 38
      ),
      make("roadmap", "Product Roadmap", "Milestones, timeline, execution plan",
        (stage === "series-a" || stage === "growth" ? 70 : stage === "seed" ? 55 : 38) + (founders >= 2 ? 8 : 0)
      ),
      make("technical_moat", "Technical Moat & IP", "Proprietary tech, architecture depth, defensibility",
        (inputs.sector === "devtools" ? 55 : inputs.sector === "saas" || inputs.sector === "fintech" ? 45 : 30)
        + (inputs.yearsTrading >= 3 ? 25 : inputs.yearsTrading >= 1 ? 15 : 5)
        + (stage === "series-a" || stage === "growth" ? 15 : stage === "seed" ? 8 : 0)
      ),
    ];
    case "tre": return [
      make("customer_size", "Customer Base & Traction", "User base, growth rate, engagement",
        mrr === 0 ? 25 : mrr <= 5000 ? 50 : mrr <= 20000 ? 65 : mrr <= 100000 ? 80 : 92
      ),
      make("revenue", "Revenue & Unit Economics", "MRR/ARR, margins, growth trajectory",
        mrr === 0 ? 20 : mrr <= 5000 ? 45 : mrr <= 20000 ? 62 : mrr <= 100000 ? 78 : 92
      ),
      make("customer_concentration", "Customer Concentration Risk", "Revenue diversification, anchor account exposure",
        inputs.sector === "saas" || inputs.sector === "fintech"
          ? (mrr > 50000 ? 75 : mrr > 10000 ? 55 : 35)
          : (mrr > 50000 ? 65 : mrr > 10000 ? 48 : 30)
      ),
      make("growth_trajectory", "Growth Trajectory", "Month-on-month revenue trend, growth rate signal",
        mrr === 0 ? 15
          : mrr <= 5000 ? (inputs.yearsTrading <= 1 ? 45 : 35)
          : mrr <= 20000 ? (inputs.yearsTrading <= 2 ? 60 : 50)
          : mrr <= 100000 ? (stage === "seed" ? 72 : stage === "series-a" || stage === "growth" ? 82 : 65)
          : 88
      ),
    ];
    case "cgh": return [
      make("team_structure", "Team Structure & Governance", "Vesting schedules, board consent thresholds",
        (inputs.hasShareholdersAgreement ? 50 : 20) + (inputs.hasBoardMeetings ? 20 : 0) + (founders >= 2 ? 10 : 0) + (inputs.esopAllocated >= 8 ? 10 : inputs.esopAllocated > 0 ? 5 : 0)
      ),
      make("documents", "Key Documents", "Pitch deck, SHA, financial projections",
        (inputs.hasShareholdersAgreement ? 45 : 10) + (inputs.hasFinancialAudit ? 30 : 5) + (stage === "series-a" || stage === "growth" ? 10 : 5)
      ),
      make("vesting_schedule", "Vesting Schedule", "Founder and key-hire vesting terms, ESOP structure",
        inputs.esopAllocated >= 8 && inputs.esopAllocated <= 15
          ? (inputs.hasShareholdersAgreement ? 80 : 60)
          : inputs.esopAllocated > 15
            ? (inputs.hasShareholdersAgreement ? 65 : 45)
            : inputs.esopAllocated > 0
              ? (inputs.hasShareholdersAgreement ? 55 : 35)
              : 20
      ),
      make("investor_rights", "Investor Rights Provisions", "Information rights, pre-emptive rights, drag-along",
        inputs.hasShareholdersAgreement
          ? (stage === "series-a" || stage === "growth" ? 82 : stage === "seed" ? 70 : 58)
          : (stage === "series-a" || stage === "growth" ? 25 : stage === "seed" ? 30 : 40)
      ),
    ];
    case "iri": return [
      make("dataroom", "Data Room", "Completeness, organisation, investor-readiness",
        (inputs.hasFinancialAudit ? 50 : 20) + (inputs.hasShareholdersAgreement ? 20 : 0) + (stage === "series-a" || stage === "growth" ? 15 : stage === "seed" ? 8 : 0)
      ),
      make("documents", "Key Documents", "Pitch deck, business plan, financial projections",
        (inputs.hasShareholdersAgreement ? 40 : 10) + (inputs.hasFinancialAudit ? 30 : 8) + (inputs.esopAllocated > 0 ? 10 : 0)
      ),
      make("data_room_readiness", "Data Room Readiness", "Financial and legal documents, folder structure",
        (inputs.hasFinancialAudit ? 45 : 15) + (inputs.hasShareholdersAgreement ? 25 : 0) + (stage === "series-a" || stage === "growth" ? 15 : stage === "seed" ? 8 : 3)
      ),
      make("due_diligence_score", "Due Diligence Completeness", "Operating history, board records, DD readiness",
        (inputs.yearsTrading >= 3 ? 45 : inputs.yearsTrading >= 1 ? 30 : 15)
          + (inputs.hasBoardMeetings ? 25 : 5)
          + (inputs.hasShareholdersAgreement ? 15 : 0)
          + (inputs.hasFinancialAudit ? 10 : 0)
      ),
    ];
    case "lco": {
      // Wave 32a — LCO expanded to 4 criteria for full Wave 32a coverage.
      // Regulated sectors (fintech/healthtech) carry a stricter compliance burden.
      const registered = (inputs as ScoreInput & { companyRegistered?: boolean }).companyRegistered ?? true;
      const sectorPenalty = inputs.sector === "fintech" || (inputs.sector as string) === "healthtech" ? -10 : 0;
      const regScore = (registered ? 80 : 40) + sectorPenalty;
      const ipScore = 55 + (inputs.hasShareholdersAgreement ? 10 : 0);
      const empScore = (inputs.yearsTrading >= 2 ? 45 : 25)
        + (inputs.founders >= 2 ? 20 : 0)
        + (inputs.hasShareholdersAgreement ? 20 : 0);
      const privacyScore = (registered ? 50 : 25)
        + (inputs.sector === "fintech" || (inputs.sector as string) === "healthtech" ? -15 : 0)
        + (inputs.yearsTrading >= 2 ? 15 : 5)
        + (inputs.hasFinancialAudit ? 10 : 0);
      return [
        make(
          "regulatory_compliance",
          "Regulatory Compliance",
          "ASIC registration, sector licences, jurisdiction posture",
          regScore,
        ),
        make(
          "ip_protection",
          "IP Protection",
          "Trademarks, copyright, IP assignment deeds, contributor agreements",
          ipScore,
        ),
        make(
          "employment_contracts",
          "Employment Contracts",
          "Team agreements, IP assignment clauses, contractor deeds",
          empScore,
        ),
        make(
          "privacy_compliance",
          "Privacy Compliance",
          "Privacy Act APPs, data breach plan, privacy impact assessment",
          privacyScore,
        ),
      ];
    }
    case "svm": return [
      make("roadmap", "Product Roadmap", "Strategic milestones, 3-year vision",
        (stage === "series-a" || stage === "growth" ? 72 : stage === "seed" ? 60 : 48) + (inputs.runwayMonths >= 18 ? 8 : inputs.runwayMonths >= 12 ? 4 : 0)
      ),
      make("gtm_strategy", "Go-to-Market Strategy", "Distribution moat, competitive positioning",
        (stage === "series-a" || stage === "growth" ? 68 : stage === "seed" ? 56 : 42) + (mrr > 50000 ? 12 : mrr > 10000 ? 6 : 0)
      ),
      make("competitive_moat", "Competitive Moat", "Defensibility, network effects, switching costs",
        inputs.sector === "saas" || inputs.sector === "fintech"
          ? (stage === "series-a" || stage === "growth" ? 72 : stage === "seed" ? 58 : 42)
            + (inputs.hasShareholdersAgreement ? 8 : 0)
          : (stage === "series-a" || stage === "growth" ? 62 : stage === "seed" ? 48 : 35)
      ),
      make("exit_optionality", "Exit Optionality", "Exit paths, acquirer landscape, liquidity options",
        (stage === "series-a" || stage === "growth" ? 72 : stage === "seed" ? 55 : 38)
          + (mrr > 50000 ? 12 : mrr > 10000 ? 6 : 0)
          + (inputs.yearsTrading >= 3 ? 8 : inputs.yearsTrading >= 1 ? 4 : 0)
      ),
    ];
    default: return [];
  }
}

function computeRiskRegister(dims: SviDimAnalysis[]): RiskItem[] {
  const allCriteria: { crit: CriterionResult; dimLabel: string }[] = [];
  for (const d of dims) {
    for (const c of d.criteria) {
      allCriteria.push({ crit: c, dimLabel: d.label });
    }
  }

  // Dedupe by criterion key — keep lowest score instance
  const seen = new Map<string, { crit: CriterionResult; dimLabel: string }>();
  for (const item of allCriteria) {
    const existing = seen.get(item.crit.key);
    if (!existing || item.crit.score < existing.crit.score) {
      seen.set(item.crit.key, item);
    }
  }

  const weakest = [...seen.values()]
    .filter((item) => item.crit.score < 55)
    .sort((a, b) => a.crit.score - b.crit.score)
    .slice(0, 5);

  const RISK_META: Record<string, { title: string; impact: string; fix: string }> = {
    revenue: {
      title: "No or insufficient revenue",
      impact: "Blocks commercial validation narrative and depresses valuation multiples at every stage.",
      fix: "Close 1–3 paying customers at any price point to establish willingness-to-pay evidence.",
    },
    customer_size: {
      title: "Limited customer traction",
      impact: "Prevents credible CAC/LTV modelling and undermines the market-demand thesis in investor pitches.",
      fix: "Run a focused 30-day outbound sprint targeting 5 ICP prospects with a time-limited pilot offer.",
    },
    dataroom: {
      title: "Data room not investor-ready",
      impact: "Slows due diligence significantly and signals operational immaturity to institutional investors.",
      fix: "Organise a 5-folder data room (Legal, Financial, Product, Team, Traction) within 1 week.",
    },
    documents: {
      title: "Key legal/financial documents missing",
      impact: "Creates a hard blocker in any institutional due diligence process.",
      fix: "Engage an AU startup lawyer to draft the SHA and commission a financial review (A$3-8k combined).",
    },
    founder_profile: {
      title: "Founder profile needs strengthening",
      impact: "Limits investor confidence in execution ability, particularly for first-time founders.",
      fix: "Recruit an experienced advisor or co-founder with a complementary track record in the sector.",
    },
    team: {
      title: "Team composition gaps",
      impact: "Raises execution risk concerns, especially in technical or sales-heavy sectors.",
      fix: "Define and publicly post 1–2 key hires, or bring on an advisor to fill the critical skill gap.",
    },
    team_structure: {
      title: "Governance structure underdeveloped",
      impact: "Absence of formal board cadence and documented decision-making flags governance risk.",
      fix: "Hold a quarterly board meeting with a formal agenda and circulate minutes within 14 days.",
    },
    market: {
      title: "Market thesis lacks evidence",
      impact: "Investors cannot independently validate market size claims without bottom-up data.",
      fix: "Publish a TAM/SAM/SOM analysis using ABS or IBISWorld data with a verifiable methodology.",
    },
    idea: {
      title: "Innovation differentiation unclear",
      impact: "Without a distinct insight, the startup appears substitutable by existing alternatives.",
      fix: "Write a 1-page product manifesto that articulates the non-obvious insight and 3 competitor gaps.",
    },
    code_git: {
      title: "Technical foundation not evidenced",
      impact: "CTO-level investors and technical due diligence partners will pass without code evidence.",
      fix: "Create a GitHub repo with README, architecture diagram, and a working prototype or demo link.",
    },
    roadmap: {
      title: "Product roadmap not documented",
      impact: "Investors cannot assess execution predictability without milestone evidence.",
      fix: "Publish a 6-month roadmap in a shared tool with owners, dates, and measurable success criteria.",
    },
    gtm_strategy: {
      title: "Go-to-market strategy unclear",
      impact: "Without a proven acquisition channel, revenue scale projections appear speculative.",
      fix: "Define 2 primary channels with a 90-day experiment plan and a cost-per-lead hypothesis.",
    },
    website: {
      title: "Digital presence underdeveloped",
      impact: "A weak website undermines the credibility of the product narrative before a single conversation.",
      fix: "Invest in a clear value proposition, 3 social proof elements, and a conversion-optimised CTA.",
    },
    customer_concentration: {
      title: "Customer concentration risk elevated",
      impact: "High revenue concentration in a small number of accounts creates material churn risk that investors will flag in due diligence.",
      fix: "Target 3–5 additional ICP accounts in the next 90 days to diversify the revenue base and reduce single-account dependency.",
    },
    growth_trajectory: {
      title: "Growth trajectory not evidenced",
      impact: "Without a documented month-on-month growth rate, investors cannot underwrite a return model or validate the revenue scale thesis.",
      fix: "Build a monthly revenue tracker and document the top 3 levers driving each growth period for the pitch narrative.",
    },
    vesting_schedule: {
      title: "Vesting schedule undocumented or non-standard",
      impact: "Undocumented vesting creates uncertainty around founder commitment and key-hire retention — a common blocker in AU term-sheet negotiations.",
      fix: "Formalise a 4-year vesting schedule with a 1-year cliff for all founders in the SHA, and top up the ESOP pool to 8–15%.",
    },
    investor_rights: {
      title: "Investor rights provisions undefined",
      impact: "Without documented investor rights (information rights, pre-emptive rights, drag-along), institutional investors cannot close a round.",
      fix: "Engage an AU startup lawyer to draft an SHA with standard investor rights provisions — typically A$2-5k and achievable in 2–3 weeks.",
    },
    data_room_readiness: {
      title: "Data room not structured for due diligence",
      impact: "An unstructured data room slows due diligence significantly and signals operational immaturity to institutional investors.",
      fix: "Organise a 5-folder data room (Legal, Financial, Product, Team, Traction) with at least one document per folder within 1 week.",
    },
    due_diligence_score: {
      title: "Due diligence preparation incomplete",
      impact: "Incomplete DD readiness extends closing timelines by 40–60% and increases the risk of deal fatigue causing investor withdrawal.",
      fix: "Complete a DD readiness checklist across legal, financial, product, and HR domains before any institutional investor conversation.",
    },
    employment_contracts: {
      title: "Employment contracts not formalised",
      impact: "Undocumented employment arrangements create IP ownership uncertainty and contingent liabilities that can block closing.",
      fix: "Ensure all team members have signed agreements with IP assignment, confidentiality, and applicable non-compete clauses.",
    },
    privacy_compliance: {
      title: "Privacy compliance posture inadequate",
      impact: "Privacy Act non-compliance is increasingly flagged as material risk in AU due diligence, particularly post-2024 legislative reforms.",
      fix: "Publish an APPs-compliant Privacy Policy, appoint a privacy officer, and complete an OAIC privacy governance self-assessment.",
    },
    competitive_moat: {
      title: "Competitive moat not articulated",
      impact: "Without a defined moat mechanism, investors cannot justify a premium valuation multiple or model defensibility of market position.",
      fix: "Write a 1-page moat analysis identifying the specific mechanism (data, switching costs, network effects) and how it compounds over time.",
    },
    exit_optionality: {
      title: "Exit optionality not evidenced",
      impact: "Investors underwrite a specific exit thesis — a startup that cannot name 2–3 credible exit paths is harder to model and value.",
      fix: "Research the last 10 M&A transactions in your sector and identify 3–5 strategic acquirer categories for the investor pitch.",
    },
  };

  return weakest.map(({ crit }) => {
    const meta = RISK_META[crit.key] ?? {
      title: `${crit.title} gap`,
      impact: "This criterion weakness may raise questions during investor due diligence.",
      fix: "Review and document key evidence for this criterion before sharing with investors.",
    };
    const severity: "critical" | "major" | "moderate" =
      crit.score < 30 ? "critical" : crit.score < 45 ? "major" : "moderate";
    return {
      criterion: crit.key,
      title: meta.title,
      severity,
      impact: meta.impact,
      fix: meta.fix,
    };
  });
}

/** Derive 8 SVI dimension scores deterministically from the 5 sub-scores + inputs.
 *  These are informed estimates — not the AI-powered SVI stream scores — but give
 *  founders a meaningful breakdown without requiring login or an AI call.
 */
function computeSviDimAnalysis(
  inputs: ScoreInput,
  subScores: Record<string, number>,
  total: number,
): SviFullAnalysis {
  const fin = subScores.financials ?? 50;
  const cap = subScores.capTable ?? 50;
  const gov = subScores.governance ?? 50;
  const fnd = subScores.founder ?? 50;
  const doc = subScores.documentation ?? 50;

  const mrr = inputs.monthlyRevenue ?? 0;
  const runway = inputs.runwayMonths ?? 0;
  const stage = inputs.stage ?? "seed";
  const sector = inputs.sector;

  // FTV — Founder & Team Value (derives from founder background + governance)
  const ftvRaw = Math.round((fnd * 0.65 + gov * 0.35));
  const ftv = Math.min(100, Math.max(0, ftvRaw));

  // MPC — Market & Problem Clarity (sector heat + stage signals)
  const sectorHeat: Record<string, number> = { saas: 72, fintech: 68, devtools: 66, marketplace: 60, other: 55 };
  const stageBoostMpc = stage === "series-a" || stage === "growth" ? 8 : stage === "seed" ? 4 : 0;
  const mpc = Math.min(100, Math.max(0, Math.round((sectorHeat[sector] ?? 60) + stageBoostMpc - (mrr === 0 ? 8 : 0))));

  // PTD — Product & Tech Depth (doc + sector dev-signals)
  const ptdBase = doc * 0.5 + (sector === "devtools" || sector === "saas" ? 20 : 10);
  const ptd = Math.min(100, Math.max(0, Math.round(ptdBase + (inputs.yearsTrading > 2 ? 8 : 0))));

  // TRE — Traction & Revenue (financials-heavy)
  const treBase = fin * 0.8 + (mrr > 50000 ? 15 : mrr > 10000 ? 8 : mrr > 0 ? 4 : 0);
  const tre = Math.min(100, Math.max(0, Math.round(treBase)));

  // CGH — Cap Table & Governance Health
  const cgh = Math.min(100, Math.max(0, Math.round((cap * 0.6 + gov * 0.4))));

  // IRI — Investor Readiness Index (doc + funding readiness signals)
  const iriBase = doc * 0.4 + cap * 0.3 + gov * 0.3;
  const iriBoost = inputs.hasShareholdersAgreement ? 5 : 0;
  const iri = Math.min(100, Math.max(0, Math.round(iriBase + iriBoost)));

  // LCO — Legal & Compliance (SHA + audit + ESOP + years)
  const lcoBase = (inputs.hasShareholdersAgreement ? 30 : 5)
    + (inputs.hasFinancialAudit ? 35 : 8)
    + (inputs.esopAllocated > 0 ? 20 : 5)
    + Math.min(10, inputs.yearsTrading * 2);
  const lco = Math.min(100, Math.max(0, Math.round(lcoBase)));

  // SVM — Strategic Vision & Moat (stage + sector premium + runway confidence)
  const svmBase = (stage === "series-a" || stage === "growth" ? 70 : stage === "seed" ? 60 : 48)
    + (runway >= 18 ? 10 : runway >= 12 ? 5 : 0)
    + (sector === "saas" || sector === "fintech" ? 5 : 0);
  const svm = Math.min(100, Math.max(0, Math.round(svmBase)));

  const dims: SviDimAnalysis[] = [
    {
      dim: "ftv", label: "Founder & Team Value", score: ftv, weight: 15, status: scoreOf(ftv),
      commentary: buildDimCommentary("ftv", ftv, inputs),
      criteria: computeCriteriaForDim("ftv", inputs),
    },
    {
      dim: "mpc", label: "Market & Problem Clarity", score: mpc, weight: 18, status: scoreOf(mpc),
      commentary: buildDimCommentary("mpc", mpc, inputs),
      criteria: computeCriteriaForDim("mpc", inputs),
    },
    {
      dim: "ptd", label: "Product & Tech Depth", score: ptd, weight: 12, status: scoreOf(ptd),
      commentary: buildDimCommentary("ptd", ptd, inputs),
      criteria: computeCriteriaForDim("ptd", inputs),
    },
    {
      dim: "tre", label: "Traction & Revenue", score: tre, weight: 20, status: scoreOf(tre),
      commentary: buildDimCommentary("tre", tre, inputs),
      criteria: computeCriteriaForDim("tre", inputs),
    },
    {
      dim: "cgh", label: "Cap Table & Governance", score: cgh, weight: 12, status: scoreOf(cgh),
      commentary: buildDimCommentary("cgh", cgh, inputs),
      criteria: computeCriteriaForDim("cgh", inputs),
    },
    {
      dim: "iri", label: "Investor Readiness", score: iri, weight: 10, status: scoreOf(iri),
      commentary: buildDimCommentary("iri", iri, inputs),
      criteria: computeCriteriaForDim("iri", inputs),
    },
    {
      dim: "lco", label: "Legal & Compliance", score: lco, weight: 8, status: scoreOf(lco),
      commentary: buildDimCommentary("lco", lco, inputs),
      criteria: computeCriteriaForDim("lco", inputs),
    },
    {
      dim: "svm", label: "Strategic Vision & Moat", score: svm, weight: 5, status: scoreOf(svm),
      commentary: buildDimCommentary("svm", svm, inputs),
      criteria: computeCriteriaForDim("svm", inputs),
    },
  ];

  const gaps = dims.filter((d) => d.status === "gap").sort((a, b) => a.score - b.score);
  const developing = dims.filter((d) => d.status === "developing").sort((a, b) => a.score - b.score);
  const weakest = [...gaps, ...developing].slice(0, 3);

  const topThreePriorities: string[] = weakest.map((d) => {
    const prefix = d.status === "gap" ? "Urgently strengthen" : "Improve";
    return `${prefix} ${d.label} (currently ${d.score}/100) — ${getPriorityAction(d.dim, inputs)}`;
  });

  // BUG 1 fix: always pad to exactly 3 priorities for high-scoring startups
  if (topThreePriorities.length < 3) {
    // Use dims sorted by weight × (100 - score) descending, excluding already included dims
    const includedDims = new Set(weakest.map((d) => d.dim));
    const paddingCandidates = [...dims]
      .filter((d) => !includedDims.has(d.dim))
      .sort((a, b) => (b.weight * (100 - b.score)) - (a.weight * (100 - a.score)));
    for (const d of paddingCandidates) {
      if (topThreePriorities.length >= 3) break;
      topThreePriorities.push(`Strengthen ${d.label} (currently ${d.score}/100) — ${getPriorityAction(d.dim, inputs)}`);
    }
  }

  const executiveSummary = buildExecutiveSummary(total, dims, inputs);
  const riskRegister = computeRiskRegister(dims);

  return { dims, executiveSummary, topThreePriorities, riskRegister };
}

function buildDimCommentary(dim: string, score: number, inputs: ScoreInput): string {
  const mrr = inputs.monthlyRevenue ?? 0;
  const runway = inputs.runwayMonths ?? 0;
  const stage = inputs.stage ?? "seed";
  const commentaries: Record<string, () => string> = {
    ftv: () => {
      const strength = inputs.founders > 1 ? "The co-founder structure reduces key-person risk and brings complementary skills to the founding team." : "A solo-founder structure concentrates execution risk and may concern investors seeking team resilience and redundancy.";
      const sectorCtx = `Operating in ${inputs.sector.toUpperCase()} adds sector credibility to the team narrative, particularly with specialist investors who track this vertical.`;
      const stageCtx = stage === "series-a" || stage === "growth" ? "At this stage, investors will conduct deep reference checks on every founding team member and expect documented track records." : "At the early stage, investors are betting heavily on founder quality — it is the dominant signal above all others.";
      const improvement = score < 65 ? "Bringing on an experienced advisor or co-founder in a key gap area would meaningfully lift this dimension and reduce due-diligence friction." : "Documenting founder track records and domain wins in a structured bio or deck slide further solidifies this strength.";
      const action = `Consider adding ${inputs.founders <= 1 ? "a co-founder or senior operator" : "an advisory board member"} with a demonstrable exit or domain credibility in ${inputs.sector.toUpperCase()} to materially strengthen investor conviction.`;
      return `${strength} ${sectorCtx} ${stageCtx} ${improvement} ${action}`;
    },
    mpc: () => {
      const marketCtx = `The ${inputs.sector.toUpperCase()} sector carries ${score >= 70 ? "strong" : score >= 50 ? "moderate" : "limited"} market clarity signals for investors at the ${stage} stage.`;
      const revenueCtx = mrr > 0 ? `Existing revenue of A$${Math.round(mrr).toLocaleString()}/month validates some market demand — even early MRR is a meaningful proof point for the thesis.` : "Pre-revenue status means the market thesis relies on qualitative evidence rather than commercial validation, which increases perceived risk.";
      const timingCtx = "Market timing is a critical but often under-evidenced component of the market thesis — investors want to understand why this problem is solvable now, not 3 years ago.";
      const action = score < 65 ? "Conducting and publishing 10+ structured customer discovery interviews would materially strengthen market evidence and demonstrate founder listening discipline." : "Quantifying the total addressable market with a bottom-up analysis and citing 2–3 verifiable data sources will make the investor pitch defensible.";
      const next = "A one-page market map showing the competitive landscape, TAM/SAM/SOM breakdown, and market-timing rationale should be part of every investor materials package.";
      return `${marketCtx} ${revenueCtx} ${timingCtx} ${action} ${next}`;
    },
    ptd: () => {
      const yearsCtx = inputs.yearsTrading > 2 ? `With ${inputs.yearsTrading} years of product development, there is meaningful iteration data to reference and customer feedback cycles to evidence.` : "Early-stage products have less iteration history, making customer validation evidence — even informal — especially important to present.";
      const docCtx = inputs.hasFinancialAudit ? "A financial audit suggests structured operational discipline that typically extends to the product build and engineering practices." : "Unaudited operations suggest the product may benefit from more rigorous engineering documentation and QA processes.";
      const stageCtx = stage === "series-a" || stage === "growth" ? "At this stage, technical due diligence by a CTO-level reviewer is standard — architecture decisions, scalability evidence, and security posture will be probed." : "Early-stage technical diligence focuses more on prototype quality and founder technical credibility than production-grade engineering.";
      const action = score < 60 ? "Publishing a public product roadmap and shipping at least one quantified customer case study would lift product credibility and provide investor-grade evidence." : "Maintaining a technical documentation standard, publishing an architecture diagram, and tracking product NPS will sustain and grow this dimension.";
      const next = "A 5-slide product section in the pitch deck — covering problem, solution, demo screenshot, technical differentiation, and roadmap — addresses the most common product questions from institutional investors.";
      return `${yearsCtx} ${docCtx} ${stageCtx} ${action} ${next}`;
    },
    tre: () => {
      const revCtx = mrr > 100000 ? `Monthly revenue of A$${Math.round(mrr / 1000)}k demonstrates strong commercial traction — at this level, investors focus on growth rate and unit economics rather than existence of revenue.` : mrr > 20000 ? `Monthly revenue of A$${Math.round(mrr / 1000)}k shows early commercial validation but needs a demonstrated growth rate to attract institutional capital.` : mrr > 0 ? `Revenue of A$${Math.round(mrr).toLocaleString()}/month is early-stage; investors will want to see a clear trajectory and month-on-month growth data.` : "Pre-revenue status is the largest drag on this dimension — even A$1k MRR changes the investor narrative from concept to commerce significantly.";
      const runwayCtx = runway >= 18 ? `${runway} months runway gives the team strong negotiating leverage and the ability to be selective about investor terms.` : runway >= 12 ? `${runway} months runway is adequate but leaves limited buffer — a fundraise process typically takes 4–6 months in AU.` : `${runway} months runway creates urgency that may pressure valuation conversations and weaken negotiating position.`;
      const growthCtx = mrr > 0 ? "Month-on-month revenue growth rate is the single most important traction metric for growth-stage investors — document and present this prominently." : "In the absence of revenue, user growth rate, engagement metrics, and pipeline value are the next best traction signals to present.";
      const action = score < 60 ? "Prioritise closing 1–3 paying customers and publishing their measurable outcomes as proof points — even A$500/month from a named customer changes the conversation." : "Building a revenue dashboard accessible to investors during due diligence, showing MRR, churn, and net retention, will accelerate closing.";
      const next = "A traction slide with a clear MRR or user growth chart, top 3 customer logos, and a net revenue retention figure is the most-read slide in any investor pitch deck.";
      return `${revCtx} ${runwayCtx} ${growthCtx} ${action} ${next}`;
    },
    cgh: () => {
      const esopCtx = inputs.esopAllocated >= 8 && inputs.esopAllocated <= 15 ? `An ESOP pool of ${inputs.esopAllocated}% sits in the ideal 8–15% range that AU investors expect and will minimise post-investment dilution friction.` : inputs.esopAllocated > 15 ? `An ESOP pool of ${inputs.esopAllocated}% is above the typical 8–15% range — institutional investors will scrutinise dilution mechanics and may require a pool reset.` : inputs.esopAllocated > 0 ? `An ESOP pool of ${inputs.esopAllocated}% exists but is below the investor-expected 8% minimum — this will likely be a term-sheet condition.` : "No ESOP pool is a structural red flag for AU investors and significantly limits the ability to attract and retain key hires.";
      const shaCtx = inputs.hasShareholdersAgreement ? "A shareholders agreement is in place — this is a prerequisite for any institutional round and covers the most common governance disputes." : "The absence of a shareholders agreement is a hard blocker for most institutional investors — it creates undefined risk around founder exit, vesting, and voting rights.";
      const vestingCtx = "Documented 4-year vesting schedules with a 1-year cliff for all founders and key hires is the AU market standard — deviations will require explanation.";
      const action = score < 65 ? "Formalise a shareholders agreement and top-up the ESOP pool to 10% before your next investor conversation — both can be executed within 30 days." : "Ensuring vesting schedules are documented, board consent thresholds are clearly defined, and drag-along rights are in place will complete this dimension.";
      const next = "A clean cap table in a tool like Carta or a formatted Excel with all shareholders, share classes, and option grants provides instant governance credibility during due diligence.";
      return `${esopCtx} ${shaCtx} ${vestingCtx} ${action} ${next}`;
    },
    iri: () => {
      const readyCtx = score >= 70 ? "The overall investor-readiness posture is strong — documentation and governance signals align well with institutional expectations for this stage." : score >= 50 ? "The investor-readiness posture is developing — several key signals are present but material gaps remain before a serious institutional conversation is appropriate." : "Significant preparation is required before approaching institutional investors — the current posture would likely result in a due-diligence pass without active remediation.";
      const docCtx = inputs.hasShareholdersAgreement && inputs.hasFinancialAudit ? "Both a shareholders agreement and audited financials are in place — these two documents resolve the most common DD blockers in AU institutional rounds." : inputs.hasShareholdersAgreement ? "A shareholders agreement is in place, but audited or reviewed financials are still outstanding and will be required before closing." : "Missing either a shareholders agreement or audited financials creates friction that typically stalls due diligence at the critical negotiation stage.";
      const dataRoomCtx = "A structured, permissioned data room signals institutional-grade operational readiness — investors who cannot find key documents quickly tend to move to the next deal.";
      const action = "Building a curated data room with financials, cap table, product demo, and 3 customer proof points is the highest-leverage single action for improving investor readiness.";
      const next = "Consider running a mock due-diligence process with a trusted advisor or experienced angel — they will surface gaps that are not visible from inside the founding team.";
      return `${readyCtx} ${docCtx} ${dataRoomCtx} ${action} ${next}`;
    },
    lco: () => {
      const auditCtx = inputs.hasFinancialAudit ? "Audited financials establish the financial rigour that AU institutional investors and ASIC compliance require — this is a meaningful signal of governance maturity." : "Unaudited financials limit investor confidence and may create complications with ASIC obligations as the company scales and approaches regulated activities.";
      const esicCtx = inputs.hasShareholdersAgreement && inputs.esopAllocated > 0 ? "The combination of an SHA and ESOP plan positions the company well for ESIC eligibility — this unlocks a 20% tax offset for qualifying angel investors, increasing deal attractiveness." : "ESIC eligibility is worth pursuing — it can meaningfully increase angel investor appetite at the pre-seed and seed stages and reduce the effective cost of capital.";
      const registrationCtx = inputs.yearsTrading > 0 ? `With ${inputs.yearsTrading} year${inputs.yearsTrading === 1 ? "" : "s"} of trading history, ASIC filings and compliance records should be up to date and available for inspection.` : "Early-stage companies should ensure ASIC registration, company constitution, and director consent forms are complete and accessible before any investor conversation.";
      const action = score < 60 ? "Completing the ESIC self-assessment and filing the working papers is a high-leverage 30-day compliance action that directly increases the investor pool." : "Maintaining an updated compliance register, assigning a director-level compliance owner, and scheduling an annual legal health check will sustain this dimension.";
      const next = "A legal health check from an AU startup law firm (typically A$1-3k) produces a compliance gap report that doubles as investor-ready evidence of legal diligence.";
      return `${auditCtx} ${esicCtx} ${registrationCtx} ${action} ${next}`;
    },
    svm: () => {
      const stageCtx = stage === "series-a" || stage === "growth" ? "At Series A and beyond, investors expect a clearly articulated strategic moat — a competitive advantage that compounds over time and becomes harder to replicate." : stage === "seed" ? "At seed stage, strategic vision is about demonstrating an opinionated, non-obvious view of where the market is heading and why this team is uniquely positioned to lead it." : "Early-stage strategic vision is primarily about founder conviction and a defensible initial wedge into a market that can evolve into a platform.";
      const runwayCtx = runway >= 18 ? `${runway} months runway allows the team to execute against a multi-year strategic plan without capital-pressure distraction — a significant advantage in negotiation.` : runway >= 12 ? `${runway} months runway provides enough time to execute the near-term strategy, but limits the ability to pursue longer-horizon moat-building initiatives.` : "Extending runway is a strategic priority — investors discount even compelling visions when burn concerns dominate the conversation.";
      const sectorMoat = inputs.sector === "saas" ? "SaaS moats most commonly derive from data network effects, switching costs, and workflow embedding — identify which applies and document it explicitly." : inputs.sector === "fintech" ? "Fintech moats often derive from regulatory complexity, trust accumulation, and payment infrastructure — identify the specific defensible position." : "The moat mechanics — network effects, data advantages, switching costs, or regulatory barriers — must be explicitly articulated for investors to assign a premium valuation.";
      const action = score < 60 ? "Articulating a 3-year strategic narrative with specific market-timing arguments and at least one compounding moat mechanic will sharpen investor confidence in the vision." : "Documenting the moat mechanics with supporting evidence (data assets, integrations, switching cost analysis) adds strategic depth that justifies premium valuation.";
      const next = "A 'why now, why us, why win' framework applied to the pitch deck's strategy section is the most effective structure for communicating strategic conviction to investors.";
      return `${stageCtx} ${runwayCtx} ${sectorMoat} ${action} ${next}`;
    },
  };
  return commentaries[dim]?.() ?? `Score of ${score}/100 indicates ${score >= 70 ? "strong performance" : score >= 45 ? "development opportunity" : "a key gap"} in this dimension — review the criteria breakdown below for targeted improvement actions.`;
}

function getPriorityAction(dim: string, inputs: ScoreInput): string {
  const actions: Record<string, string> = {
    ftv: inputs.founders <= 1 ? "consider adding a co-founder or experienced advisor with complementary skills" : "document founder track records and domain expertise for the data room",
    mpc: inputs.monthlyRevenue === 0 ? "run 10+ customer discovery interviews and publish a market-sizing analysis" : "quantify the total addressable market with a bottom-up model",
    ptd: "publish a public product roadmap and ship at least one quantified customer case study",
    tre: inputs.monthlyRevenue === 0 ? "close 1–3 paying customers to establish commercial validation" : "build a revenue dashboard and document month-on-month growth rate",
    cgh: !inputs.hasShareholdersAgreement ? "execute a shareholders agreement before any investor conversation" : "ensure ESOP pool is 8–15% with documented vesting schedules",
    iri: "build a curated data room covering financials, cap table, product demo, and 3 customer proof points",
    lco: !inputs.hasShareholdersAgreement ? "formalise the SHA and complete the ESIC self-assessment" : "complete a financial audit or review to satisfy AU investor DD requirements",
    svm: "write a 3-year strategic narrative that explains the moat mechanics and market timing",
  };
  return actions[dim] ?? "review and document key metrics for investor due diligence";
}

function buildExecutiveSummary(total: number, dims: SviDimAnalysis[], inputs: ScoreInput): string {
  const band = total >= 80 ? "strong" : total >= 65 ? "solid" : total >= 50 ? "developing" : total >= 35 ? "early-stage" : "nascent";
  const strongDims = dims.filter((d) => d.status === "strong").map((d) => d.label);
  const gapDims = dims.filter((d) => d.status === "gap").map((d) => d.label);
  const stage = inputs.stage ?? "seed";
  const sector = inputs.sector.toUpperCase();

  const sentence1 = `This ${stage} ${sector} startup presents a ${band} overall investment profile with a composite score of ${total}/100.`;
  const sentence2 = strongDims.length > 0
    ? `Key strengths are concentrated in ${strongDims.slice(0, 2).join(" and ")}, which provide a credible foundation for investor conversations.`
    : `No dimensions yet register as strong — the focus should be on establishing a few high-confidence proof points before approaching investors.`;
  const sentence3 = gapDims.length > 0
    ? `The most significant gaps are in ${gapDims.slice(0, 2).join(" and ")}, which carry the highest downside risk in a due-diligence process.`
    : `All dimensions are at developing or above — the priority is depth of evidence, not breadth of coverage.`;
  const sentence4 = `Addressing the priority actions below could meaningfully lift the score by the next funding conversation.`;

  return `${sentence1} ${sentence2} ${sentence3} ${sentence4}`;
}

// POST /api/score
// Body: { email, companyName?, inputs: ScoreInput }
// Behaviour:
//   - Always computes the deterministic score.
//   - Enriches with VC-scorecard valuation (via cfo-valuation) + funding
//     readiness gates + evidence gaps so the returned payload is
//     "investor-ready" not just a headline number.
//   - Persists to Supabase if configured.
//   - Fires the score-ready email (with score PDF attachment) fire-and-forget
//     for EVERY submission — even demo-mode (Supabase absent) — so founders
//     always get something in their inbox.
//   - Falls back to a `demo-XXXX` slug when Supabase is missing so the dev
//     UX (share link + PDF) still works locally.
//
// Returns: { slug, totalScore, subScores, valuation, fundingReadiness, evidenceGaps, ... }

interface FundingGate {
  pass: boolean;
  missing: string[];
}

interface FundingReadinessBlock {
  seed: FundingGate;
  seriesA: FundingGate;
}

function computeSimpleFundingReadiness(
  inputs: ScoreInput,
  subScoresMap: Record<string, number>,
): FundingReadinessBlock {
  const mrr = inputs.monthlyRevenue ?? 0;
  const runway = inputs.runwayMonths ?? 0;
  const arrBand = inputs.arrBand ?? "pre-revenue";
  const seedMissing: string[] = [];
  const seriesAMissing: string[] = [];

  // Seed gates
  if (mrr < 8000) seedMissing.push("Reach at least A$8k MRR");
  if (runway < 12) seedMissing.push("Extend runway to 12+ months");
  if (!inputs.hasShareholdersAgreement) seedMissing.push("Shareholders agreement signed");
  if ((subScoresMap.governance ?? 0) < 55) seedMissing.push("Lift governance score above 55");
  if ((subScoresMap.capTable ?? 0) < 55) seedMissing.push("Tidy cap-table hygiene (ESOP + SHA)");
  if (inputs.esopAllocated < 8) seedMissing.push("Allocate an 8-15% ESOP pool");

  // Series A gates
  if (mrr < 83000) seriesAMissing.push("Reach A$83k MRR (~A$1M ARR)");
  if (!["250k-1m", "1m-3m", "3m-plus"].includes(arrBand)) {
    seriesAMissing.push("Reach A$250k+ ARR band");
  }
  if (runway < 15) seriesAMissing.push("Runway of 15+ months for Series A pitch");
  if (!inputs.hasFinancialAudit) seriesAMissing.push("Complete a financial audit or review");
  if (!inputs.hasBoardMeetings) seriesAMissing.push("Establish regular board cadence");
  if ((subScoresMap.governance ?? 0) < 70) seriesAMissing.push("Governance score of 70+");
  if ((subScoresMap.financials ?? 0) < 65) seriesAMissing.push("Financials score of 65+");

  return {
    seed: { pass: seedMissing.length === 0, missing: seedMissing },
    seriesA: { pass: seriesAMissing.length === 0, missing: seriesAMissing },
  };
}

function computeValuation(inputs: ScoreInput): {
  lowAud: number;
  midAud: number;
  highAud: number;
  method: "vc_scorecard_blend";
} | null {
  try {
    const arg: BuildVcValuationInput = {
      sector: inputs.sector,
      stage: inputs.stage,
      mrrAud: inputs.monthlyRevenue,
      monthlyOpexAud: inputs.monthlyBurn,
      raiseAud: inputs.targetRaiseAud,
      hasShareholdersAgreement: inputs.hasShareholdersAgreement,
      hasFounderVesting: inputs.hasShareholdersAgreement,
      hasEsopPool: inputs.esopAllocated > 0,
      hasDataRoom: inputs.hasFinancialAudit,
    };
    const rep = buildVcValuationReport(arg);
    return {
      lowAud: rep.blended.lowAud,
      midAud: rep.blended.midAud,
      highAud: rep.blended.highAud,
      method: "vc_scorecard_blend",
    };
  } catch (err) {
    console.error("[blockid:score] valuation failed", err);
    return null;
  }
}

// Best-effort read of first-touch / last-touch attribution cookies dropped
// by <UtmCapture />. Returns null on parse failure so the pipeline never
// blocks a submit if the cookie is malformed. The scores table does NOT
// currently carry attribution columns (checked 2026-08-23 against
// migrations/0001_init.sql) — we return the payload to the client so
// score_form_submitted can include it in GA4 without a schema change.
interface AttributionSnapshot {
  ts?: string;
  source?: string | null;
  medium?: string | null;
  campaign?: string | null;
  term?: string | null;
  content?: string | null;
  gclid?: string | null;
  fbclid?: string | null;
  referrer?: string | null;
  landing_path?: string | null;
}

async function readAttributionCookies(): Promise<{
  firstTouch: AttributionSnapshot | null;
  lastTouch: AttributionSnapshot | null;
}> {
  try {
    const store = await cookies();
    const ft = store.get("bid_ft")?.value ?? null;
    const lt = store.get("bid_lt")?.value ?? null;
    const parse = (raw: string | null): AttributionSnapshot | null => {
      if (!raw) return null;
      try {
        return JSON.parse(decodeURIComponent(raw)) as AttributionSnapshot;
      } catch {
        try {
          return JSON.parse(raw) as AttributionSnapshot;
        } catch {
          return null;
        }
      }
    };
    return { firstTouch: parse(ft), lastTouch: parse(lt) };
  } catch {
    return { firstTouch: null, lastTouch: null };
  }
}

export async function POST(request: Request) {
  let body: unknown = null;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = body as {
    email?: string;
    companyName?: string;
    inputs?: Partial<ScoreInput>;
  } | null;

  if (
    !parsed ||
    !parsed.email ||
    typeof parsed.email !== "string" ||
    !parsed.email.includes("@")
  ) {
    return NextResponse.json(
      { ok: false, error: "Valid email is required" },
      { status: 400 },
    );
  }
  if (!parsed.inputs || typeof parsed.inputs !== "object") {
    return NextResponse.json(
      { ok: false, error: "inputs object is required" },
      { status: 400 },
    );
  }

  // Validate required fields exist
  // companyName can come from top-level OR inputs — fallback to "My Startup"
  if (!parsed.inputs.companyName && parsed.companyName) {
    parsed.inputs.companyName = parsed.companyName;
  }
  if (!parsed.inputs.companyName) {
    parsed.inputs.companyName = "My Startup";
  }
  if (!parsed.inputs.sector) {
    return NextResponse.json(
      { ok: false, reason: "Sector is required" },
      { status: 400 },
    );
  }

  // Reject negative numbers for numeric fields
  const numericFields: (keyof ScoreInput)[] = [
    "monthlyRevenue",
    "monthlyBurn",
    "runwayMonths",
    "yearsTrading",
    "founders",
    "esopAllocated",
    "targetRaiseAud",
    "valuationCapAud",
  ];
  for (const field of numericFields) {
    const val = parsed.inputs[field];
    if (val !== undefined && typeof val === "number" && val < 0) {
      return NextResponse.json(
        { ok: false, reason: `${field} must not be negative` },
        { status: 400 },
      );
    }
  }

  const inputs = parsed.inputs as ScoreInput;
  const breakdown = computeScore(inputs);

  // Map sub-scores into a stable keyed shape for storage.
  const subScoresMap: Record<string, number> = {
    financials: 0,
    capTable: 0,
    governance: 0,
    founder: 0,
    documentation: 0,
  };
  const keyForLabel = (label: string): keyof typeof subScoresMap => {
    if (/^cap/i.test(label)) return "capTable";
    if (/^gov/i.test(label)) return "governance";
    if (/^founder/i.test(label)) return "founder";
    if (/^doc/i.test(label)) return "documentation";
    return "financials";
  };
  for (const s of breakdown.subs) {
    subScoresMap[keyForLabel(s.label)] = Math.round(s.value);
  }
  const benchmark = breakdown.benchmark;

  // ---- Enrichment: valuation + funding readiness + evidence gaps ----------
  const valuation = computeValuation(inputs);
  const fundingReadiness = computeSimpleFundingReadiness(inputs, subScoresMap);
  const evidenceGaps = breakdown.missingInputs.slice(0, 10);

  // Wave 29 — full 8-dim SVI analysis for the public score results page.
  const sviAnalysis = computeSviDimAnalysis(inputs, subScoresMap, breakdown.total);

  // Attribution (best-effort, never blocks). See readAttributionCookies()
  // for the schema-check note — scores table has no attribution columns
  // today, so we echo the payload back to the client for GA4 emission
  // instead of a silent DB insert.
  const { firstTouch, lastTouch } = await readAttributionCookies();

  const supabase = getSupabaseAdmin();
  let slug = newSlug();
  let persisted = false;

  if (!supabase) {
    slug = `demo-${slug.slice(0, 6)}`;
    console.warn(
      "[blockid:score] Supabase not configured — returning demo slug",
      { slug, email: parsed.email },
    );
  } else {
    const { error } = await supabase.from("scores").insert({
      id: slug,
      email: parsed.email,
      company_name: parsed.companyName ?? inputs.companyName ?? null,
      total_score: breakdown.total,
      sub_scores: subScoresMap,
      inputs,
      score_version: breakdown.version,
      confidence_score: breakdown.confidence,
      missing_inputs: breakdown.missingInputs,
      action_plan: breakdown.actionPlan,
      benchmark,
    });
    if (error) {
      console.error("[blockid:score] Supabase insert failed", error);
      // Degrade: return a demo slug so the UI still has somewhere to land.
      slug = `demo-${slug.slice(0, 6)}`;
    } else {
      persisted = true;
    }
  }

  // Best-effort: link score to user's startup history if authenticated
  const currentUser = await getCurrentUser().catch(() => null);
  if (currentUser && supabase && persisted) {
    const slugName = (parsed.companyName ?? inputs.companyName ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "unnamed";
    const startupId = `${currentUser.id}:${slugName}`;
    void supabase
      .from("startup_score_history")
      .insert({
        user_id: currentUser.id,
        startup_id: startupId,
        startup_name: parsed.companyName ?? inputs.companyName ?? "Unnamed Startup",
        inputs,
        svi_analysis: sviAnalysis,
        sub_scores: subScoresMap,
        total_score: breakdown.total,
        valuation_low_aud: valuation?.lowAud ?? null,
        valuation_high_aud: valuation?.highAud ?? null,
        score_version: breakdown.version,
        confidence_score: breakdown.confidence,
        missing_inputs: breakdown.missingInputs,
        source: "blockid",
      })
      .then(({ error }) => {
        if (error) console.error("[blockid:history] insert failed", error);
      });
  }

  // Fire-and-forget email — always attempt, even in demo mode.
  void sendScoreReady({
    to: parsed.email,
    slug,
    totalScore: breakdown.total,
    companyName: parsed.companyName ?? inputs.companyName ?? null,
    subScores: subScoresMap,
    actionPlan: breakdown.actionPlan,
    valuation,
    fundingReadiness,
    evidenceGaps,
    benchmark,
    breakdown,
  }).catch((err) => {
    console.error("[blockid:score] sendScoreReady failed", err);
  });

  return NextResponse.json({
    ok: true,
    slug,
    totalScore: breakdown.total,
    subScores: subScoresMap,
    scoreVersion: breakdown.version,
    confidenceScore: breakdown.confidence,
    missingInputs: breakdown.missingInputs,
    actionPlan: breakdown.actionPlan,
    benchmark,
    breakdown,
    valuation,
    fundingReadiness,
    evidenceGaps,
    sviAnalysis,
    persisted: persisted && isSupabaseConfigured() && !slug.startsWith("demo-"),
    attribution: {
      firstTouch,
      lastTouch,
    },
  });
}

export const dynamic = "force-dynamic";
