import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, XCircle, ArrowRight, Download } from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";

const TITLE = "ESOP Checklist for Australian Startups 2026 — Legal & Tax Guide | BlockID";
const DESCRIPTION = "Free ESOP setup checklist for AU founders. Covers ESS Part 7A compliance, vesting schedule, legal documents, and investor requirements. Updated June 2026.";
const CANONICAL = "https://blockid.au/tools/esop-checklist";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "esop australia startup",
    "employee share option plan australia",
    "esop legal checklist",
    "ess part 7a",
    "startup equity australia 2026",
    "option pool australian startups",
    "esop vesting schedule australia",
    "antler esop requirements",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: CANONICAL,
  },
  alternates: { canonical: CANONICAL },
};

interface CheckItem {
  id: string;
  category: string;
  item: string;
  detail: string;
  priority: "critical" | "high" | "medium";
  sviImpact: string;
}

const CHECKLIST: CheckItem[] = [
  // Pool Structure
  { id: "pool-size", category: "Pool Structure", item: "Determine ESOP pool size (standard: 10–15%)", detail: "AU pre-seed standard is 12%. Too small limits hiring; too large dilutes founder control.", priority: "critical", sviImpact: "+8 SVI" },
  { id: "share-split", category: "Pool Structure", item: "Execute share split to create pool (e.g. 100 → 100,000 shares)", detail: "Create clean math for future rounds. Typical: 88,000 founder + 12,000 ESOP pool.", priority: "critical", sviImpact: "Required" },
  { id: "constitution", category: "Pool Structure", item: "Update Company Constitution to authorise new share class", detail: "ASIC notified if changing constitution. ~A$300 ASIC fee.", priority: "high", sviImpact: "Legal req." },

  // Legal Documents
  { id: "plan-deed", category: "Legal Documents", item: "Draft and sign ESOP Plan Deed", detail: "The master document governing all option grants. Must be signed before any grants are issued. Budget A$2–5K for lawyer review.", priority: "critical", sviImpact: "+5 SVI" },
  { id: "offer-letter", category: "Legal Documents", item: "Create Employee Option Offer Letter template", detail: "Grantee-specific document issued per grant. Includes: shares, strike price, vesting schedule, leaver provisions.", priority: "critical", sviImpact: "Required" },
  { id: "founder-vesting", category: "Legal Documents", item: "Sign Founder Vesting Confirmation Deed", detail: "Retroactive vesting from company founding date. Required by Antler, Blackbird, and most AU accelerators.", priority: "critical", sviImpact: "+4 SVI" },
  { id: "sha-update", category: "Legal Documents", item: "Update Shareholders Agreement with ESOP and vesting clauses", detail: "Add: vesting schedule references, good/bad leaver provisions, acceleration clauses, anti-dilution protections.", priority: "high", sviImpact: "+3 SVI" },

  // Vesting Schedule
  { id: "vesting-standard", category: "Vesting Schedule", item: "Set standard 4-year vesting, 1-year cliff", detail: "Industry best practice. Cliff ensures employees stay 12+ months. AU and US investors expect this.", priority: "critical", sviImpact: "Investor req." },
  { id: "strike-price", category: "Vesting Schedule", item: "Set strike price at Fair Market Value (FMV)", detail: "A$0.10/share FMV for pre-seed. Must reflect actual FMV to comply with ESS Part 7A. Too low = ATO risk.", priority: "critical", sviImpact: "Tax req." },
  { id: "good-bad-leaver", category: "Vesting Schedule", item: "Define Good Leaver vs Bad Leaver provisions", detail: "Good Leaver: 90 days to exercise. Bad Leaver: forfeit unvested + clawback. Protect the company.", priority: "high", sviImpact: "Legal req." },
  { id: "acceleration", category: "Vesting Schedule", item: "Add acceleration clauses (change of control)", detail: "Double-trigger acceleration: employee terminated within 12 months of acquisition. Standard AU practice.", priority: "medium", sviImpact: "Nice to have" },

  // Tax Compliance
  { id: "ess-concession", category: "Tax Compliance (ESS Part 7A)", item: "Confirm Startup Tax Concession eligibility", detail: "Company <10 years old, <$50M revenue, options at or below FMV, 3-year minimum employment plan. Enables tax deferral.", priority: "critical", sviImpact: "Tax benefit" },
  { id: "ato-notification", category: "Tax Compliance (ESS Part 7A)", item: "Set up ATO ESS annual reporting obligation", detail: "Lodge ESS Annual Report by 14 August each year. Notify employees of their ESS interests within 14 days of offer.", priority: "high", sviImpact: "ATO req." },
  { id: "tax-advisor", category: "Tax Compliance (ESS Part 7A)", item: "Engage tax advisor for ESOP review", detail: "Budget A$2–5K. BDO, Pitcher Partners, or Grant Thornton specialise in startup ESS. Worth the cost.", priority: "high", sviImpact: "Risk mgmt" },
  { id: "valuation", category: "Tax Compliance (ESS Part 7A)", item: "Get independent valuation (if issuing >$500K options)", detail: "ATO may challenge FMV without independent valuation for larger grants. Protects company and grantees.", priority: "medium", sviImpact: "ATO req." },

  // Investor Readiness
  { id: "cap-table", category: "Investor Readiness", item: "Update cap table to show fully diluted ownership with ESOP", detail: "All investors need fully diluted cap table. Show: founder %, ESOP %, pre-emption rights.", priority: "critical", sviImpact: "+6 SVI" },
  { id: "data-room-esop", category: "Investor Readiness", item: "Add ESOP documents to data room", detail: "Section 3: Equity & Cap Table. Include: Plan Deed, cap table, grant summary (anonymised), valuation.", priority: "high", sviImpact: "+2 SVI" },
  { id: "pitch-deck", category: "Investor Readiness", item: "Update pitch deck team slide with equity structure", detail: "Slide should show: Founder 88% + 12% ESOP pool. Signals governance maturity.", priority: "high", sviImpact: "Antler req." },
];

const CATEGORY_ORDER = ["Pool Structure", "Legal Documents", "Vesting Schedule", "Tax Compliance (ESS Part 7A)", "Investor Readiness"];

const PRIORITY_CONFIG = {
  critical: { label: "Critical", icon: XCircle, class: "text-red-600 bg-red-50 border-red-100" },
  high: { label: "High", icon: AlertTriangle, class: "text-amber-600 bg-amber-50 border-amber-100" },
  medium: { label: "Medium", icon: CheckCircle2, class: "text-blue-600 bg-blue-50 border-blue-100" },
};

export default function EsopChecklistPage() {
  const grouped = CATEGORY_ORDER.map(cat => ({
    category: cat,
    items: CHECKLIST.filter(i => i.category === cat),
  }));

  const criticalCount = CHECKLIST.filter(i => i.priority === "critical").length;

  return (
    <>
      <PageTracker page="esop-checklist" />
      <Navbar />
      <main className="min-h-screen bg-gradient-to-b from-surface-50 to-white">
        {/* Hero */}
        <section className="max-w-4xl mx-auto px-4 pt-16 pb-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700 mb-4">
              <CheckCircle2 className="h-4 w-4" />
              Free ESOP Checklist — Updated June 2026
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold text-ink-900 mb-4">
              ESOP Checklist for Australian Startups
            </h1>
            <p className="text-lg text-ink-600 max-w-2xl mx-auto">
              {CHECKLIST.length}-point checklist covering pool structure, legal documents, ESS Part 7A compliance, and investor requirements.
              Used by Antler and Blackbird portfolio founders.
            </p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-4 mb-8">
            <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
              <p className="text-xs text-ink-500 mt-0.5">Critical items</p>
            </div>
            <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-ink-900">{CHECKLIST.length}</p>
              <p className="text-xs text-ink-500 mt-0.5">Total checklist items</p>
            </div>
            <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
              <p className="text-2xl font-bold text-brand-600">+20</p>
              <p className="text-xs text-ink-500 mt-0.5">SVI points unlockable</p>
            </div>
          </div>

          {/* Alert */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-8 text-sm text-amber-800">
            <strong>Important:</strong> This checklist is for educational purposes. Engage a registered tax advisor
            (BDO, Pitcher Partners, Grant Thornton) for formal ESOP advice. Budget A$2–5K for legal + tax review.
          </div>
        </section>

        {/* Checklist */}
        <section className="max-w-4xl mx-auto px-4 pb-16">
          <div className="space-y-8">
            {grouped.map(({ category, items }) => (
              <div key={category} className="rounded-xl border border-surface-200 bg-white overflow-hidden">
                <div className="px-6 py-4 bg-surface-50 border-b border-surface-100">
                  <h2 className="font-semibold text-ink-900">{category}</h2>
                  <p className="text-xs text-ink-500 mt-0.5">{items.length} items</p>
                </div>
                <div className="divide-y divide-surface-50">
                  {items.map((item) => {
                    const cfg = PRIORITY_CONFIG[item.priority];
                    const Icon = cfg.icon;
                    return (
                      <div key={item.id} className="flex items-start gap-4 px-6 py-4 hover:bg-surface-50 transition-colors">
                        <div className="flex-shrink-0 mt-0.5">
                          <input type="checkbox" className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-400 cursor-pointer" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <p className="text-sm font-medium text-ink-900 flex-1">{item.item}</p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border font-medium ${cfg.class}`}>
                                <Icon className="h-3 w-3" />
                                {cfg.label}
                              </span>
                              <span className="text-xs font-medium text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
                                {item.sviImpact}
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-ink-500 mt-1">{item.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-10 rounded-xl border border-brand-200 bg-brand-50 p-6 text-center">
            <h3 className="font-bold text-ink-900 mb-2">Track your ESOP progress in BlockID</h3>
            <p className="text-sm text-ink-600 mb-4">
              Create your ESOP pool, issue grants, and automatically update your SVI score — all in BlockID.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link
                href="/dashboard/esop"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700"
              >
                Open ESOP Manager <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/founding-50"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50"
              >
                Get Founding 100 — A$1
              </Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
