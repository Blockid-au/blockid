"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  ArrowRight,
  RotateCcw,
  CalendarCheck,
  FileText,
  Shield,
  Users,
  Bell,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

interface CheckItem {
  id: string;
  category: string;
  item: string;
  detail: string;
  priority: "critical" | "high" | "medium";
  sviImpact: string;
}

// ─── Checklist Data ───────────────────────────────────────────────────────────

const CHECKLIST: CheckItem[] = [
  // Pre-implementation
  {
    id: "pre-company-structure",
    category: "Pre-implementation",
    item: "Verify company structure is suitable for ESOP",
    detail:
      "ESOP works best with a Pty Ltd company structure. Confirm you have not more than 50 non-employee shareholders and the company is not a foreign-controlled entity. Trusts require separate deed.",
    priority: "critical",
    sviImpact: "Required",
  },
  {
    id: "pre-legal-advice",
    category: "Pre-implementation",
    item: "Engage a startup lawyer for ESOP advice",
    detail:
      "Budget A$3–8K for a startup-specialist law firm (Sparke Helmore, Cornwalls, LegalVision). They will draft the Plan Deed, Offer Letters, and advise on ESS Part 7A compliance.",
    priority: "critical",
    sviImpact: "Risk mgmt",
  },
  {
    id: "pre-board-approval",
    category: "Pre-implementation",
    item: "Pass Board resolution to adopt ESOP",
    detail:
      "Directors must formally resolve to adopt the ESOP Plan. Record in the company's minute book. Required before any grants can be made.",
    priority: "critical",
    sviImpact: "Legal req.",
  },
  {
    id: "pre-pool-size",
    category: "Pre-implementation",
    item: "Determine ESOP pool size (standard: 10–15%)",
    detail:
      "AU pre-seed standard is 12%. Too small limits future hiring; too large dilutes founder control. Antler and Blackbird typically expect 10–15% post-money ESOP pool.",
    priority: "critical",
    sviImpact: "+8 SVI",
  },
  {
    id: "pre-share-split",
    category: "Pre-implementation",
    item: "Execute share split to create pool headroom",
    detail:
      "Create clean math for future rounds. Example: 100 shares → 100,000 shares, allocate 12,000 to ESOP pool. Notify ASIC within 28 days of any changes to share structure.",
    priority: "high",
    sviImpact: "Required",
  },
  {
    id: "pre-constitution",
    category: "Pre-implementation",
    item: "Update Company Constitution to authorise new share class",
    detail:
      "If issuing options over a new share class, amend the constitution by special resolution (75% shareholder vote). Lodge Form 205 with ASIC (~A$300 fee).",
    priority: "high",
    sviImpact: "ASIC req.",
  },

  // Plan Documentation
  {
    id: "doc-plan-deed",
    category: "Plan Documentation",
    item: "Draft and execute the ESOP Plan Deed",
    detail:
      "The master document governing all option grants. Must be signed by directors before any grants are issued. Covers: eligibility, grant mechanics, exercise conditions, vesting, leaver provisions.",
    priority: "critical",
    sviImpact: "+5 SVI",
  },
  {
    id: "doc-trust-deed",
    category: "Plan Documentation",
    item: "Establish Employee Share Trust (if trust-based plan)",
    detail:
      "Trust-based plans require a Trust Deed and appointment of a trustee. More complex but preferred for tax concession plans. Trustee holds shares on behalf of employees until options vest and exercise.",
    priority: "medium",
    sviImpact: "Optional",
  },
  {
    id: "doc-offer-letter",
    category: "Plan Documentation",
    item: "Create Employee Option Offer Letter template",
    detail:
      "Per-grantee document issued for each grant. Must include: number of options, exercise price, vesting schedule, expiry date, leaver provisions, and ESS tax disclosure statement.",
    priority: "critical",
    sviImpact: "Required",
  },
  {
    id: "doc-vesting-schedule",
    category: "Plan Documentation",
    item: "Define vesting schedules (standard: 4 years, 1-year cliff)",
    detail:
      "Industry standard is 4-year total vesting with a 12-month cliff (25% vests at Month 12, then monthly). Accelerated vesting on M&A is standard. Custom schedules for advisors (1–2 years, quarterly).",
    priority: "critical",
    sviImpact: "Investor req.",
  },
  {
    id: "doc-founder-vesting",
    category: "Plan Documentation",
    item: "Sign Founder Vesting Confirmation Deed",
    detail:
      "Retroactive vesting from company founding date. Required by Antler, Blackbird, Square Peg, and most AU accelerators and investors. Protects the company if a founder departs early.",
    priority: "critical",
    sviImpact: "+4 SVI",
  },
  {
    id: "doc-sha-update",
    category: "Plan Documentation",
    item: "Update Shareholders Agreement with ESOP and vesting clauses",
    detail:
      "Add: vesting schedule references, good/bad leaver provisions, acceleration clauses, drag-along rights for option holders, anti-dilution protections, and pre-emption rights carve-outs for ESOP.",
    priority: "high",
    sviImpact: "+3 SVI",
  },

  // Tax Compliance
  {
    id: "tax-ess-eligibility",
    category: "Tax Compliance (ESS Rules)",
    item: "Confirm Startup Tax Concession eligibility (ESS Division 83A-B)",
    detail:
      "To qualify: company <10 years old, aggregated turnover <$50M, options at or above FMV, employee employed ≥3 years plan duration. If eligible, employees defer tax until sale of shares.",
    priority: "critical",
    sviImpact: "Tax benefit",
  },
  {
    id: "tax-1000-threshold",
    category: "Tax Compliance (ESS Rules)",
    item: "Understand $1,000 tax-free threshold for non-concessional ESS",
    detail:
      "Under the non-concessional scheme, each employee may receive up to A$1,000 of ESS interests tax-free per year. Options above this are subject to upfront tax at grant. Most startups prefer concessional (deferred tax) scheme.",
    priority: "high",
    sviImpact: "ATO req.",
  },
  {
    id: "tax-deferred-taxation",
    category: "Tax Compliance (ESS Rules)",
    item: "Structure options for deferred taxation (no upfront tax at grant)",
    detail:
      "Under deferred tax scheme: employees pay no tax at grant. Tax deferred until earliest of: (a) sale, (b) cessation of employment, (c) 15 years. Strike price must be at or above FMV at grant date.",
    priority: "critical",
    sviImpact: "Tax benefit",
  },
  {
    id: "tax-fmv-valuation",
    category: "Tax Compliance (ESS Rules)",
    item: "Set strike price at Fair Market Value (FMV)",
    detail:
      "Pre-seed FMV typically A$0.001–A$0.10/share. ATO may challenge FMV without an independent valuation. For grants >A$500K, engage an independent valuer. Document FMV methodology in grant records.",
    priority: "critical",
    sviImpact: "ATO req.",
  },
  {
    id: "tax-ato-annual-report",
    category: "Tax Compliance (ESS Rules)",
    item: "Set up ATO ESS Annual Reporting obligation",
    detail:
      "Lodge ESS Annual Report by 14 August each year (for the prior FY July–June). Report all ESS interests issued and/or taxed during the year. Notify each employee within 14 days of an ESS interest being granted.",
    priority: "high",
    sviImpact: "ATO req.",
  },
  {
    id: "tax-advisor",
    category: "Tax Compliance (ESS Rules)",
    item: "Engage a tax advisor specialising in startup ESS",
    detail:
      "BDO, Pitcher Partners, and Grant Thornton all have dedicated startup ESS practices. Budget A$2–5K for an ESS review. They can also assist with ATO ruling requests if you have complex structures.",
    priority: "high",
    sviImpact: "Risk mgmt",
  },

  // Regulatory
  {
    id: "reg-asic-disclosure",
    category: "Regulatory Compliance",
    item: "Confirm ASIC disclosure exemption applies (Class Order 14/1000)",
    detail:
      "Startups with <20 employees or <20 shareholders in a 12-month period can issue options without a formal prospectus under ASIC Class Order 14/1000. Confirm eligibility before issuing offers.",
    priority: "critical",
    sviImpact: "ASIC req.",
  },
  {
    id: "reg-foreign-employees",
    category: "Regulatory Compliance",
    item: "Review rules for foreign employees (US, UK, Singapore)",
    detail:
      "Different jurisdictions have different rules. US employees may trigger US securities law (Rule 701). UK employees need EMI scheme compliance. Obtain local counsel opinion before issuing offshore.",
    priority: "medium",
    sviImpact: "Legal req.",
  },
  {
    id: "reg-asx-rules",
    category: "Regulatory Compliance",
    item: "Review ASX Listing Rules if listed (or planning IPO within 3 years)",
    detail:
      "ASX-listed companies must comply with ASX Listing Rules Chapter 10 (related party transactions) and Chapter 6 (securities restrictions). ESOP must be approved by shareholders at AGM if issuing >15% of capital.",
    priority: "medium",
    sviImpact: "ASX req.",
  },

  // Employee Communication
  {
    id: "comm-offer-letters",
    category: "Employee Communication",
    item: "Issue written Option Offer Letters to each grantee",
    detail:
      "Each employee must receive a written offer. Must include: number of options, exercise price, vesting schedule, expiry, leaver provisions, ESS disclosure statement, and acceptance instructions.",
    priority: "critical",
    sviImpact: "Required",
  },
  {
    id: "comm-explanatory-memo",
    category: "Employee Communication",
    item: "Prepare an Explanatory Memorandum for employees",
    detail:
      "Plain-English document explaining: what options are, how vesting works, tax implications, what happens when they leave. Reduces confusion and legal disputes. Highly recommended even if not legally required.",
    priority: "high",
    sviImpact: "Best practice",
  },
  {
    id: "comm-cooling-off",
    category: "Employee Communication",
    item: "Provide 14-day cooling-off period for option acceptance",
    detail:
      "Best practice (and required under some state employment laws) to give employees 14 days to consider and accept their option offer. Do not pressure employees to accept immediately.",
    priority: "medium",
    sviImpact: "Best practice",
  },
  {
    id: "comm-tax-warning",
    category: "Employee Communication",
    item: "Include written tax warning with each offer",
    detail:
      "ATO requires ESS tax disclosure in the offer document. Warn employees to seek independent tax advice. Cover: when tax is triggered, what taxable amount is, and annual ATO reporting obligations.",
    priority: "high",
    sviImpact: "ATO req.",
  },

  // Ongoing Obligations
  {
    id: "ongoing-annual-valuation",
    category: "Ongoing Obligations",
    item: "Conduct annual independent valuation for FMV",
    detail:
      "If you issue new grants each year, you need an updated FMV. For pre-revenue, use net assets or discounted cash flow. Engage your accountant or a certified valuer annually.",
    priority: "high",
    sviImpact: "ATO req.",
  },
  {
    id: "ongoing-grant-records",
    category: "Ongoing Obligations",
    item: "Maintain a Grant Register with all option grants",
    detail:
      "Track: grantee name, date of grant, number of options, exercise price, vesting start date, vesting milestones, expiry date, and status (unvested/vested/exercised/forfeited). Audit trail for ATO and future investors.",
    priority: "critical",
    sviImpact: "+2 SVI",
  },
  {
    id: "ongoing-leaver-provisions",
    category: "Ongoing Obligations",
    item: "Enforce Good Leaver vs Bad Leaver provisions on departure",
    detail:
      "Good Leaver (redundancy, serious illness): retains vested options, 90-day exercise window. Bad Leaver (resignation before cliff, misconduct): forfeits all unvested options, may forfeit vested. Document each departure formally.",
    priority: "high",
    sviImpact: "Legal req.",
  },
  {
    id: "ongoing-cap-table",
    category: "Ongoing Obligations",
    item: "Update cap table after each grant, exercise, or forfeiture",
    detail:
      "Fully diluted cap table must always be current. Show: founder %, ESOP pool %, issued options, exercised shares, unissued options remaining. Investors expect to see this in the data room.",
    priority: "critical",
    sviImpact: "+6 SVI",
  },
  {
    id: "ongoing-data-room",
    category: "Ongoing Obligations",
    item: "Keep ESOP documents current in investor data room",
    detail:
      "Data room Section 3 (Equity & Cap Table) should always have: current Plan Deed, cap table (fully diluted), anonymised grant summary, latest valuation, and Shareholders Agreement.",
    priority: "high",
    sviImpact: "+2 SVI",
  },
];

// ─── Category Config ──────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "Pre-implementation", label: "Pre-implementation", icon: CalendarCheck, color: "text-violet-600" },
  { id: "Plan Documentation", label: "Plan Documentation", icon: FileText, color: "text-blue-600" },
  { id: "Tax Compliance (ESS Rules)", label: "Tax Compliance (ESS Rules)", icon: Shield, color: "text-red-600" },
  { id: "Regulatory Compliance", label: "Regulatory Compliance", icon: AlertTriangle, color: "text-amber-600" },
  { id: "Employee Communication", label: "Employee Communication", icon: Users, color: "text-green-600" },
  { id: "Ongoing Obligations", label: "Ongoing Obligations", icon: RefreshCw, color: "text-brand-600" },
];

const PRIORITY_CONFIG = {
  critical: { label: "Critical", icon: XCircle, class: "text-red-600 bg-red-50 border-red-100" },
  high: { label: "High", icon: AlertTriangle, class: "text-amber-600 bg-amber-50 border-amber-100" },
  medium: { label: "Medium", icon: CheckCircle2, class: "text-blue-600 bg-blue-50 border-blue-100" },
};

const STORAGE_KEY = "blockid_esop_checklist_v1";

// ─── Component ────────────────────────────────────────────────────────────────

export function EsopChecklistClient() {
  const [checked, setChecked] = React.useState<Set<string>>(new Set());
  const [mounted, setMounted] = React.useState(false);

  // Hydrate from localStorage on mount
  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const ids: string[] = JSON.parse(raw);
        setChecked(new Set(ids));
      }
    } catch {}
    setMounted(true);
  }, []);

  const toggle = (id: string) => {
    setChecked(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
      } catch {}
      return next;
    });
  };

  const resetAll = () => {
    setChecked(new Set());
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
  };

  const completedCount = checked.size;
  const totalCount = CHECKLIST.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);
  const criticalCount = CHECKLIST.filter(i => i.priority === "critical").length;
  const criticalDone = CHECKLIST.filter(i => i.priority === "critical" && checked.has(i.id)).length;

  return (
    <>
      {/* Hero */}
      <section className="max-w-4xl mx-auto px-4 pt-16 pb-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 rounded-full bg-brand-50 border border-brand-100 px-4 py-1.5 text-sm font-medium text-brand-700 mb-4">
            <CheckCircle2 className="h-4 w-4" />
            Free Interactive ESOP Checklist — Updated June 2026
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-ink-900 mb-4">
            ESOP Legal Checklist for Australian Startups
          </h1>
          <p className="text-lg text-ink-600 max-w-2xl mx-auto">
            {totalCount}-item interactive checklist covering pre-implementation, plan documentation, ESS tax rules,
            ASIC compliance, employee communication, and ongoing obligations.
            Progress saves automatically to your browser.
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{mounted ? completedCount : 0}</p>
            <p className="text-xs text-ink-500 mt-0.5">Completed</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-ink-900">{totalCount}</p>
            <p className="text-xs text-ink-500 mt-0.5">Total items</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-red-600">{criticalCount}</p>
            <p className="text-xs text-ink-500 mt-0.5">Critical items</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-4 text-center">
            <p className="text-2xl font-bold text-brand-600">+28</p>
            <p className="text-xs text-ink-500 mt-0.5">SVI pts unlockable</p>
          </div>
        </div>

        {/* Progress bar */}
        <div className="rounded-xl border border-surface-200 bg-white p-4 mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-ink-800">
              Overall progress — {mounted ? progressPct : 0}%
            </span>
            <div className="flex items-center gap-3">
              <span className="text-xs text-ink-500">{criticalDone}/{criticalCount} critical done</span>
              {mounted && completedCount > 0 && (
                <button
                  type="button"
                  onClick={resetAll}
                  className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-red-500 transition-colors cursor-pointer"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset
                </button>
              )}
            </div>
          </div>
          <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-300"
              style={{ width: `${mounted ? progressPct : 0}%` }}
            />
          </div>
        </div>

        {/* Alert */}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 mb-4 text-sm text-amber-800">
          <strong>Important:</strong> This checklist is for educational purposes only. Engage a registered
          tax advisor (BDO, Pitcher Partners, Grant Thornton) and a startup lawyer for formal ESOP advice.
          Budget A$5–13K for legal + tax review. This is not legal advice.
        </div>
      </section>

      {/* Category navigation */}
      <section className="max-w-4xl mx-auto px-4 mb-4">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => {
            const catItems = CHECKLIST.filter(i => i.category === cat.id);
            const catDone = catItems.filter(i => checked.has(i.id)).length;
            const Icon = cat.icon;
            return (
              <a
                key={cat.id}
                href={`#cat-${cat.id.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`}
                className="inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 border border-surface-200 bg-white hover:bg-surface-50 text-ink-600 transition-colors"
              >
                <Icon className={cn("h-3.5 w-3.5", cat.color)} />
                {cat.label}
                <span className="ml-0.5 text-ink-400">({mounted ? catDone : 0}/{catItems.length})</span>
              </a>
            );
          })}
        </div>
      </section>

      {/* Checklist */}
      <section className="max-w-4xl mx-auto px-4 pb-16">
        <div className="space-y-8">
          {CATEGORIES.map(cat => {
            const catItems = CHECKLIST.filter(i => i.category === cat.id);
            const catDone = catItems.filter(i => checked.has(i.id)).length;
            const Icon = cat.icon;
            const anchorId = `cat-${cat.id.replace(/[^a-z0-9]/gi, "-").toLowerCase()}`;
            return (
              <div
                key={cat.id}
                id={anchorId}
                className="rounded-xl border border-surface-200 bg-white overflow-hidden scroll-mt-6"
              >
                <div className="px-6 py-4 bg-surface-50 border-b border-surface-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Icon className={cn("h-4 w-4", cat.color)} />
                    <h2 className="font-semibold text-ink-900">{cat.label}</h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-ink-500">
                      {mounted ? catDone : 0}/{catItems.length} complete
                    </span>
                    {mounted && catDone === catItems.length && catItems.length > 0 && (
                      <span className="text-xs font-medium text-green-600 bg-green-50 rounded-full px-2 py-0.5 border border-green-100">
                        Done
                      </span>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-surface-50">
                  {catItems.map(item => {
                    const cfg = PRIORITY_CONFIG[item.priority];
                    const PriorityIcon = cfg.icon;
                    const isChecked = mounted && checked.has(item.id);
                    return (
                      <label
                        key={item.id}
                        htmlFor={`check-${item.id}`}
                        className={cn(
                          "flex items-start gap-4 px-6 py-4 cursor-pointer transition-colors",
                          isChecked ? "bg-green-50/50" : "hover:bg-surface-50"
                        )}
                      >
                        <div className="flex-shrink-0 mt-0.5">
                          <input
                            id={`check-${item.id}`}
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => toggle(item.id)}
                            className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-400 cursor-pointer"
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start gap-2 flex-wrap">
                            <p
                              className={cn(
                                "text-sm font-medium flex-1",
                                isChecked ? "line-through text-ink-400" : "text-ink-900"
                              )}
                            >
                              {item.item}
                            </p>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span
                                className={`inline-flex items-center gap-1 text-xs rounded-full px-2 py-0.5 border font-medium ${cfg.class}`}
                              >
                                <PriorityIcon className="h-3 w-3" />
                                {cfg.label}
                              </span>
                              <span className="text-xs font-medium text-brand-600 bg-brand-50 rounded-full px-2 py-0.5">
                                {item.sviImpact}
                              </span>
                            </div>
                          </div>
                          <p className={cn("text-sm mt-1", isChecked ? "text-ink-400" : "text-ink-500")}>
                            {item.detail}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="mt-10 rounded-xl border border-brand-200 bg-brand-50 p-6 text-center">
          <h3 className="font-bold text-ink-900 mb-2">Track your ESOP progress automatically in BlockID</h3>
          <p className="text-sm text-ink-600 mb-4">
            Create your ESOP pool, issue grants, and automatically update your SVI score — all in BlockID.
            Authenticated users get a live ESOP governance score and investor-ready cap table.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              href="/dashboard/esop"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-700 transition-colors"
            >
              Open ESOP Manager <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-brand-200 bg-white px-5 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50 transition-colors"
            >
              <Bell className="h-4 w-4" />
              Create free account
            </Link>
          </div>
          <p className="text-xs text-ink-400 mt-3">
            Already have an account?{" "}
            <Link href="/dashboard/esop" className="text-brand-600 hover:underline">
              Go to ESOP Manager →
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}
