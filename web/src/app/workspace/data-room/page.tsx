import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getProjectIdFromRequest, findOrCreateSVIAccount, getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { DataRoomClient } from "./data-room-client";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";

export const metadata: Metadata = {
  title: "Data Room",
  description: "Build and manage your investor-ready data room on BlockID.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// ---------------------------------------------------------------------------
// Data room item definition — shared between server & client
// ---------------------------------------------------------------------------

export interface DataRoomItemDef {
  id: string;
  category: string;
  label: string;
  description: string;
  dimension: string;
  /**
   * When true, wording must be reviewed by a compliance-qualified founder
   * or adviser before it is surfaced to investors. Applies to AU regulatory
   * items (AFSL, ESIC, ESVCLP) where our conservative default language
   * may not fit every startup's fact pattern.
   */
  founder_review_required?: boolean;
  /**
   * Fundraise stage at which this item is typically first requested. Plain
   * strings for now — will be rewired to the canonical StageKey vocabulary
   * once Task 1 lands.
   */
  required_for_stage?: "seed" | "series_a" | "series_b_plus";
}

export interface DataRoomItemState {
  id: string;
  status: "not_started" | "uploaded" | "verified";
  fileUrl: string | null;
  fileName: string | null;
  evidenceId: string | null;
}

const DATA_ROOM_ITEMS: DataRoomItemDef[] = [
  // Company Formation
  { id: "cert_incorp", category: "Company Formation", label: "Certificate of Incorporation / ASIC registration", description: "Official registration document from ASIC or equivalent authority", dimension: "lco" },
  { id: "constitution", category: "Company Formation", label: "Company constitution", description: "The company's governing rules and constitution document", dimension: "lco" },
  { id: "sha", category: "Company Formation", label: "Shareholders agreement (SHA)", description: "Agreement between all shareholders covering rights and obligations", dimension: "lco" },
  { id: "abn", category: "Company Formation", label: "ABN confirmation", description: "Australian Business Number registration confirmation", dimension: "lco" },

  // Cap Table & Equity
  { id: "cap_table", category: "Cap Table & Equity", label: "Cap table (current)", description: "Current ownership structure showing all shareholders and their holdings", dimension: "cgh" },
  { id: "vesting", category: "Cap Table & Equity", label: "Vesting schedules", description: "Vesting timelines for founders and key employees", dimension: "cgh" },
  { id: "esop", category: "Cap Table & Equity", label: "ESOP plan document", description: "Employee Share Option Plan terms and documentation", dimension: "cgh" },
  { id: "safe_notes", category: "Cap Table & Equity", label: "Convertible note / SAFE terms", description: "Terms of any convertible instruments or SAFEs issued", dimension: "cgh" },

  // Financials
  { id: "pnl", category: "Financials", label: "P&L (last 12 months)", description: "Profit and loss statement for the previous 12 months", dimension: "tre" },
  { id: "cashflow", category: "Financials", label: "Cash flow forecast", description: "Forward-looking cash flow projections (12-24 months)", dimension: "tre" },
  { id: "revenue_metrics", category: "Financials", label: "Revenue metrics dashboard", description: "Key revenue metrics: MRR, ARR, churn, LTV, CAC", dimension: "tre" },
  { id: "bank_statements", category: "Financials", label: "Bank statements (last 3 months)", description: "Recent bank statements showing cash position", dimension: "tre" },

  // Product & Tech
  { id: "product_demo", category: "Product & Tech", label: "Product demo / screenshots", description: "Screenshots, video demo, or live product walkthrough", dimension: "ptd" },
  { id: "tech_arch", category: "Product & Tech", label: "Technical architecture doc", description: "Overview of tech stack, infrastructure, and system design", dimension: "ptd" },
  { id: "ip_assignment", category: "Product & Tech", label: "IP assignment agreements", description: "Intellectual property assignment from founders and contractors", dimension: "ptd" },

  // Market & Traction
  { id: "pitch_deck", category: "Market & Traction", label: "Pitch deck", description: "Investor-facing pitch deck (10-15 slides)", dimension: "mpc" },
  { id: "customer_contracts", category: "Market & Traction", label: "Customer contracts / LOIs", description: "Signed customer agreements, LOIs, or pilot contracts", dimension: "mpc" },
  { id: "market_research", category: "Market & Traction", label: "Market research summary", description: "TAM/SAM/SOM analysis and competitive landscape", dimension: "mpc" },

  // Legal & Compliance
  { id: "tos", category: "Legal & Compliance", label: "Terms of service", description: "Customer-facing terms of service or EULA", dimension: "lco" },
  { id: "privacy_policy", category: "Legal & Compliance", label: "Privacy policy", description: "Privacy policy compliant with Australian Privacy Act", dimension: "lco" },
  { id: "key_contracts", category: "Legal & Compliance", label: "Key contracts (suppliers, partners)", description: "Material contracts with suppliers, distributors, or partners", dimension: "lco" },

  // ── Series-A / acquirer standard extensions (Task 3, 2026-07-23) ──
  // Company Formation extras
  { id: "asic_extract", category: "Company Formation", label: "ASIC company extract (<30 days old)", description: "Current ASIC company extract showing directors, shareholders, ABN, ACN", dimension: "lco", required_for_stage: "seed" },
  { id: "director_consents", category: "Company Formation", label: "Director consents to act (Form 201/205A)", description: "Signed ASIC consents to act from each current director", dimension: "lco", required_for_stage: "seed" },
  { id: "register_of_charges", category: "Company Formation", label: "Register of charges (ASIC / PPSR)", description: "Current PPSR search and register of registered security interests over company assets", dimension: "lco", required_for_stage: "series_a" },
  { id: "board_minutes_12mo", category: "Company Formation", label: "Board minutes (last 12 months)", description: "Signed minutes of all board meetings held in the last 12 months", dimension: "lco", required_for_stage: "seed" },

  // Cap Table & Equity extras
  { id: "founder_agreements", category: "Cap Table & Equity", label: "Founder agreements", description: "Executed founder agreements including vesting, IP assignment, non-compete", dimension: "cgh", required_for_stage: "seed" },
  { id: "cap_table_waterfall", category: "Cap Table & Equity", label: "Cap table waterfall (exit scenarios)", description: "Liquidation-preference waterfall showing shareholder proceeds at multiple exit valuations", dimension: "cgh", required_for_stage: "series_a" },
  { id: "option_warrant_register", category: "Cap Table & Equity", label: "Option / warrant register", description: "All outstanding options, warrants, and other convertible instruments", dimension: "cgh", required_for_stage: "seed" },

  // Financials extras
  { id: "management_accounts", category: "Financials", label: "Monthly management accounts (12 months)", description: "Month-by-month P&L, balance sheet and cash flow prepared for internal management", dimension: "tre", required_for_stage: "series_a" },
  { id: "budget_vs_actual", category: "Financials", label: "Budget vs actuals (rolling 12 months)", description: "Board-approved budget compared against realised actuals with variance commentary", dimension: "tre", required_for_stage: "series_a" },
  { id: "unit_economics_model", category: "Financials", label: "Unit economics model", description: "CAC, LTV, payback period, contribution margin and cohort payback assumptions", dimension: "tre", required_for_stage: "seed" },
  { id: "cohort_revenue", category: "Financials", label: "Cohort revenue analysis", description: "Monthly revenue cohorts with retention, expansion, and net-revenue-retention curves", dimension: "tre", required_for_stage: "series_a" },
  { id: "aged_debtors", category: "Financials", label: "Aged debtors / receivables report", description: "Trade receivables aged 0-30 / 31-60 / 61-90 / 90+ days as at report date", dimension: "tre", required_for_stage: "series_a" },
  { id: "audited_financials_3y", category: "Financials", label: "Audited financial statements (3 years)", description: "Externally audited financial statements for the last three financial years (if available)", dimension: "tre", required_for_stage: "series_b_plus" },

  // Product & Tech (Technical) extras
  { id: "architecture_diagram", category: "Product & Tech", label: "System architecture diagram", description: "One-page system diagram showing services, data stores, third-party dependencies, and trust boundaries", dimension: "ptd", required_for_stage: "seed" },
  { id: "uptime_sla_history", category: "Product & Tech", label: "Uptime / SLA history (12 months)", description: "Monthly uptime percentage vs stated customer SLA, with any incident carve-outs listed", dimension: "ptd", required_for_stage: "series_a" },
  { id: "incident_register", category: "Product & Tech", label: "Security incident register", description: "Log of all security incidents, root cause, remediation, and OAIC notification decisions", dimension: "ptd", required_for_stage: "series_a" },
  { id: "dependency_inventory", category: "Product & Tech", label: "Third-party dependency inventory", description: "SaaS + open-source dependency inventory with vendor, purpose, data category, and contract expiry", dimension: "ptd", required_for_stage: "series_a" },
  { id: "pen_test_report", category: "Product & Tech", label: "Penetration test report", description: "Most recent third-party penetration test report and remediation status", dimension: "ptd", required_for_stage: "series_a" },

  // Market & Traction (Commercial) extras
  { id: "sample_customer_contract", category: "Market & Traction", label: "Sample customer contract", description: "Redacted standard-form customer MSA or subscription agreement used with new customers", dimension: "mpc", required_for_stage: "seed" },
  { id: "top20_concentration", category: "Market & Traction", label: "Top-20 customer revenue concentration", description: "Revenue contribution of top-20 customers as % of ARR with contract-end and renewal-risk flag", dimension: "mpc", required_for_stage: "series_a" },
  { id: "churn_cohort", category: "Market & Traction", label: "Churn cohort analysis", description: "Customer-count churn and revenue churn by monthly cohort with reason-for-churn tagging", dimension: "mpc", required_for_stage: "series_a" },
  { id: "pricing_history", category: "Market & Traction", label: "Pricing history", description: "Historical pricing schedule with dates of changes, discount policy, and grandfathering rules", dimension: "mpc", required_for_stage: "series_a" },
  { id: "competitive_matrix", category: "Market & Traction", label: "Competitive analysis matrix", description: "Competitor landscape with feature differentiation matrix", dimension: "mpc", required_for_stage: "seed" },

  // Legal & Compliance extras
  { id: "material_contract_summary", category: "Legal & Compliance", label: "Material contract summary", description: "Schedule of material contracts (>A$50k / year or strategic) with counterparty, term, auto-renew, assignment and change-of-control clauses", dimension: "lco", required_for_stage: "series_a" },
  { id: "litigation_register", category: "Legal & Compliance", label: "Litigation & disputes register", description: "All current, pending or threatened litigation, disputes, regulator notices and debtor collection actions (or a signed 'nil' statement)", dimension: "lco", required_for_stage: "seed" },
  { id: "insurance_schedule", category: "Legal & Compliance", label: "Insurance schedule", description: "Current insurance schedule (public liability, PI, cyber, D&O, workers compensation) with insurer, sum insured and expiry", dimension: "lco", required_for_stage: "seed" },
  { id: "msa_template", category: "Legal & Compliance", label: "MSA template", description: "Standard master services agreement template used with enterprise customers", dimension: "lco", required_for_stage: "series_a" },
  { id: "partner_agreements", category: "Legal & Compliance", label: "Partner / reseller agreements", description: "Executed agreements with resellers, referral partners, and integration partners", dimension: "lco", required_for_stage: "series_a" },

  // IP extras
  { id: "trademark_register", category: "IP", label: "Trademark register", description: "All registered and pending trademarks with IP Australia application number, class, and status", dimension: "ptd", required_for_stage: "seed" },
  { id: "patent_register", category: "IP", label: "Patent register", description: "All granted, pending and provisional patents with jurisdiction, claim summary, and renewal date", dimension: "ptd", required_for_stage: "series_a" },
  { id: "source_code_assignment", category: "IP", label: "Source code assignment matrix", description: "Every contributor to the production codebase mapped to a signed IP-assignment or employment deed", dimension: "ptd", required_for_stage: "seed" },
  { id: "oss_license_inventory", category: "IP", label: "Open-source license inventory", description: "SBOM of all OSS dependencies with license (MIT / Apache / GPL / AGPL etc.) and distribution status", dimension: "ptd", required_for_stage: "seed" },
  { id: "domain_register", category: "IP", label: "Domain name register", description: "Owned domains, registrar, expiry date, and confirmation the company (not a founder personally) is registrant", dimension: "ptd", required_for_stage: "seed" },

  // HR / Team & Advisors (NEW category on runtime surface)
  { id: "org_chart", category: "HR", label: "Organisational chart", description: "Current org chart showing reporting lines, headcount by function, and open roles", dimension: "lco", required_for_stage: "seed" },
  { id: "founder_profiles", category: "HR", label: "Founder profiles", description: "Detailed bios of all founders with domain expertise evidence and LinkedIn links", dimension: "lco", required_for_stage: "seed" },
  { id: "employment_contract_template", category: "HR", label: "Employment contract template", description: "Standard Fair Work-compliant employment agreement template (permanent, part-time, casual)", dimension: "lco", required_for_stage: "seed" },
  { id: "esop_plan_doc", category: "HR", label: "ESOP plan document (team copy)", description: "Employee-facing ESOP plan summary, vesting rules, and exercise mechanics", dimension: "cgh", required_for_stage: "seed" },
  { id: "contractor_register", category: "HR", label: "Contractor register", description: "All active contractors with ABN, scope, monthly spend, and IP-assignment / confidentiality status", dimension: "lco", required_for_stage: "seed" },
  { id: "key_person_insurance", category: "HR", label: "Key-person insurance policy", description: "Key-person life / TPD policy schedule covering founders and critical technical staff (if held)", dimension: "lco", required_for_stage: "series_a" },

  // Tax (NEW category on runtime surface)
  { id: "ato_tax_residency", category: "Tax", label: "ATO tax residency letter", description: "Certificate of Australian tax residency issued by the ATO (or equivalent evidence the company is an Australian tax resident)", dimension: "lco", required_for_stage: "seed" },
  { id: "gst_registration", category: "Tax", label: "GST registration confirmation", description: "ABR extract confirming GST registration status and effective date", dimension: "lco", required_for_stage: "seed" },
  { id: "rd_tax_incentive", category: "Tax", label: "R&D tax incentive claims", description: "AusIndustry R&D activity registrations and ATO R&D tax offset schedules for each claimed year", dimension: "lco", required_for_stage: "seed" },
  { id: "payg_compliance", category: "Tax", label: "PAYG withholding compliance", description: "Evidence PAYG-withholding is registered and lodgements are up to date (STP finalisation and BAS/IAS history)", dimension: "lco", required_for_stage: "seed" },
  { id: "income_tax_returns_3y", category: "Tax", label: "Income tax returns (last 3 years)", description: "Lodged company income tax returns for the last three financial years with ATO acknowledgement", dimension: "lco", required_for_stage: "series_a" },
  { id: "esic_assessment", category: "Tax", label: "ESIC eligibility assessment", description: "Founder-signed assessment against the Early Stage Innovation Company tests in Division 360-40 ITAA 1997 (100-point test or principles-based test)", dimension: "lco", required_for_stage: "seed", founder_review_required: true },
  { id: "esvclp_assessment", category: "Tax", label: "ESVCLP fund eligibility note", description: "Note on whether the company would satisfy eligible-investee requirements of an Early Stage Venture Capital Limited Partnership under the Venture Capital Act 2002", dimension: "lco", required_for_stage: "series_a", founder_review_required: true },

  // AU Compliance (NEW category on runtime surface)
  { id: "afsl_exemption_note", category: "AU Compliance", label: "AFSL exemption note or licence", description: "Where the business handles money or financial products: a copy of the AFSL (or Authorised Representative arrangement) or a founder-signed note documenting the specific Corporations Act 2001 exemption relied on", dimension: "lco", required_for_stage: "seed", founder_review_required: true },
  { id: "privacy_act_statement", category: "AU Compliance", label: "Privacy Act 1988 compliance statement", description: "Statement of how the entity applies the 13 Australian Privacy Principles and whether it is an APP entity under s.6 of the Privacy Act 1988 (Cth)", dimension: "lco", required_for_stage: "seed" },
  { id: "app_breach_register", category: "AU Compliance", label: "APP / data breach register", description: "Register of privacy incidents assessed against the Notifiable Data Breaches scheme, including OAIC notification decisions and remediation actions", dimension: "lco", required_for_stage: "seed" },
  { id: "fair_work_entitlements", category: "AU Compliance", label: "Fair Work employee entitlements audit", description: "Audit of employee classifications, applicable modern awards, minimum-wage compliance, and superannuation guarantee payments under the Fair Work Act 2009 and SG (Administration) Act 1992", dimension: "lco", required_for_stage: "series_a" },
  { id: "wgea_report", category: "AU Compliance", label: "WGEA compliance report", description: "Workplace Gender Equality Agency public report (required for non-public sector employers with 100+ employees under the WGE Act 2012)", dimension: "lco", required_for_stage: "series_b_plus" },
  { id: "modern_slavery_statement", category: "AU Compliance", label: "Modern Slavery Act statement", description: "Modern slavery statement lodged with the Attorney-General's online register (required for entities with consolidated revenue ≥ AUD 100 million under the Modern Slavery Act 2018)", dimension: "lco", required_for_stage: "series_b_plus" },
  { id: "ndb_readiness", category: "AU Compliance", label: "Notifiable Data Breaches scheme readiness", description: "Documented process for assessing suspected data breaches within 30 days and notifying the OAIC and affected individuals as required by Part IIIC of the Privacy Act 1988", dimension: "lco", required_for_stage: "seed" },
];

// Diagnostic — logs the runtime data-room item count at module load.
// Used to verify the data room meets the ≥60-item Series-A acquirer standard.
// eslint-disable-next-line no-console
console.log(`data-room-templates.count: ${DATA_ROOM_ITEMS.length}`);

// Group items by category for the client
const CATEGORIES = Array.from(new Set(DATA_ROOM_ITEMS.map((i) => i.category)));

export default async function DataRoomPage() {
  await requireTierForPage({
    feature: "data_room.access",
    minTier: "growth",
    fromPath: "/workspace/data-room",
  });

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/data-room");

  const isSandbox = await getCurrentProjectIsSandbox();

  // Load existing evidence to determine item states
  const itemStates: DataRoomItemState[] = [];
  const supabase = getSupabaseAdmin();

  if (supabase) {
    const projectId = await getProjectIdFromRequest();
    const accountId = await findOrCreateSVIAccount(user.email, projectId);

    if (accountId) {
      const account = { id: accountId };
      // Find evidence rows matching data room items
      const { data: evidence } = await supabase
        .from("svi_evidence")
        .select("id, label, value_or_url, confidence_level, dimension")
        .eq("account_id", account.id)
        .eq("evidence_type", "document_uploaded")
        .order("created_at", { ascending: false });

      if (evidence) {
        // Map evidence back to data room items by matching label substrings
        for (const item of DATA_ROOM_ITEMS) {
          const match = evidence.find(
            (e: { label?: string; dimension?: string }) =>
              e.label?.toLowerCase().includes(item.id.replace(/_/g, " ")) ||
              e.label?.toLowerCase().includes(item.label.toLowerCase().slice(0, 20)),
          );
          if (match) {
            itemStates.push({
              id: item.id,
              status: match.confidence_level === "verified" ? "verified" : "uploaded",
              fileUrl: (match.value_or_url as string) ?? null,
              fileName: (match.label as string) ?? null,
              evidenceId: match.id,
            });
          }
        }
      }
    }
  }

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-4xl mx-auto">
        <DataRoomClient
          items={DATA_ROOM_ITEMS}
          categories={CATEGORIES}
          initialStates={itemStates}
          templateStructure={DATA_ROOM_STRUCTURE}
        />
      </div>
    </WorkspaceLayout>
  );
}
