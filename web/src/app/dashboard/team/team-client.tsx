"use client";

import * as React from "react";
import {
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  DollarSign,
  FileText,
  Info,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

/* ─── AU Salary Benchmarks ───────────────────────────────────────────────── */

const AU_ROLES = [
  { role: "Software Engineer", levels: [
    { level: "Junior", p25: 70000, p50: 82000, p75: 95000 },
    { level: "Mid", p25: 95000, p50: 115000, p75: 135000 },
    { level: "Senior", p25: 130000, p50: 155000, p75: 180000 },
    { level: "Lead/Principal", p25: 160000, p50: 185000, p75: 220000 },
  ]},
  { role: "Product Manager", levels: [
    { level: "Mid", p25: 100000, p50: 120000, p75: 145000 },
    { level: "Senior", p25: 140000, p50: 165000, p75: 195000 },
    { level: "Head of Product", p25: 170000, p50: 200000, p75: 240000 },
  ]},
  { role: "Designer (UX/UI)", levels: [
    { level: "Junior", p25: 60000, p50: 72000, p75: 85000 },
    { level: "Mid", p25: 85000, p50: 100000, p75: 120000 },
    { level: "Senior", p25: 115000, p50: 135000, p75: 160000 },
  ]},
  { role: "Marketing", levels: [
    { level: "Junior", p25: 55000, p50: 65000, p75: 78000 },
    { level: "Mid", p25: 80000, p50: 95000, p75: 115000 },
    { level: "Senior/Head", p25: 110000, p50: 135000, p75: 165000 },
  ]},
  { role: "Data Scientist / ML Engineer", levels: [
    { level: "Mid", p25: 100000, p50: 120000, p75: 145000 },
    { level: "Senior", p25: 140000, p50: 170000, p75: 200000 },
    { level: "Lead", p25: 175000, p50: 210000, p75: 250000 },
  ]},
  { role: "Sales / BD", levels: [
    { level: "Junior BDR", p25: 60000, p50: 72000, p75: 85000 },
    { level: "Account Executive", p25: 100000, p50: 125000, p75: 155000 },
    { level: "VP Sales", p25: 160000, p50: 200000, p75: 250000 },
  ]},
  { role: "Finance / CFO", levels: [
    { level: "Finance Manager", p25: 110000, p50: 135000, p75: 160000 },
    { level: "CFO (Series A)", p25: 180000, p50: 220000, p75: 280000 },
  ]},
  { role: "CEO / Founder (funded)", levels: [
    { level: "Pre-seed (<A$1M)", p25: 80000, p50: 120000, p75: 160000 },
    { level: "Seed (A$1–5M)", p25: 130000, p50: 175000, p75: 220000 },
    { level: "Series A (A$5M+)", p25: 200000, p50: 260000, p75: 330000 },
  ]},
];

/* ─── Division 83A Guide ─────────────────────────────────────────────────── */

const DIV83A_GUIDE = [
  {
    title: "What is Division 83A?",
    body: "Australian tax law governing employee share schemes (ESS). Options or shares granted under a compliant ESS plan are taxed at exercise or disposal, not at grant — meaning no upfront tax hit for employees.",
  },
  {
    title: "Startup concession (s83A-C) — the key benefit",
    body: "If your startup meets the small company test (turnover < A$50M, < 10 years old, incorporated in AU), employees can defer tax on options until the earliest of: exercise, cessation of employment, or 15 years. This is the most valuable provision for early-stage startups.",
  },
  {
    title: "Strike price requirement",
    body: "Strike price must be set at ≥ Fair Market Value (FMV) at grant date. For unlisted companies, FMV is typically the last cap table share price or a valuation report. A$0.10 is common for pre-seed companies with 1,000,000 shares issued.",
  },
  {
    title: "Plan Deed requirement",
    body: "You must have a written ESS Plan Deed in place before granting any options. The deed must specify: vesting schedule, strike price, leaver provisions, and acceleration triggers. BlockID ESOP templates in your Data Room are compliant starting points.",
  },
  {
    title: "ATO annual reporting",
    body: "Lodge an ESS annual report with the ATO within 14 days of end of income year if options were granted. Done via the ATO's online portal. Non-compliance results in options becoming immediately taxable on grant.",
  },
  {
    title: "Vesting best practice (4yr/1yr cliff)",
    body: "Standard AU practice: 4-year vesting with 1-year cliff. No options vest in the first 12 months — protecting the company if an early hire leaves. After the cliff, the remaining 75% vests monthly over 3 years.",
  },
];

/* ─── Salary Row ─────────────────────────────────────────────────────────── */

function SalaryRow({ role, level, p25, p50, p75 }: {
  role: string; level: string; p25: number; p50: number; p75: number;
}) {
  const fmt = (v: number) => `A$${(v / 1000).toFixed(0)}K`;
  const barMax = 350000;

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="py-3 px-4 text-sm font-medium">{role}</td>
      <td className="py-3 pr-4 text-xs text-muted-foreground whitespace-nowrap">{level}</td>
      <td className="py-3 pr-4 text-sm font-mono text-muted-foreground">{fmt(p25)}</td>
      <td className="py-3 pr-6">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden min-w-16">
            <div
              className="h-full bg-blue-500 rounded-full"
              style={{ width: `${(p50 / barMax) * 100}%` }}
            />
          </div>
          <span className="text-sm font-mono font-semibold text-blue-600 w-12 text-right shrink-0">{fmt(p50)}</span>
        </div>
      </td>
      <td className="py-3 text-sm font-mono text-muted-foreground">{fmt(p75)}</td>
    </tr>
  );
}

/* ─── ESOP Grant Calculator ──────────────────────────────────────────────── */

function ESOPGrantCalc() {
  const [totalShares, setTotalShares] = React.useState(100000);
  const [optionsGrant, setOptionsGrant] = React.useState(5000);
  const [strikePrice, setStrikePrice] = React.useState(0.10);
  const [exitMultiple, setExitMultiple] = React.useState(5);

  const pctOwnership = totalShares > 0 ? (optionsGrant / totalShares) * 100 : 0;
  const costToExercise = optionsGrant * strikePrice;
  const exitValueShares = optionsGrant * strikePrice * exitMultiple;
  const gain = exitValueShares - costToExercise;

  const fmt = (v: number) => `A$${v.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

  return (
    <div className="rounded-xl border border-border bg-card p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-blue-500" />
        <h3 className="font-semibold text-sm">ESOP Grant Value Calculator (Division 83A)</h3>
      </div>

      <div className="grid grid-cols-2 gap-3">
        {[
          { label: "Total shares on issue", value: totalShares, set: setTotalShares, step: 10000, type: "number" },
          { label: "Options to grant", value: optionsGrant, set: setOptionsGrant, step: 500, type: "number" },
          { label: "Strike price (A$)", value: strikePrice, set: setStrikePrice, step: 0.01, type: "number" },
          { label: "Exit multiple (×)", value: exitMultiple, set: setExitMultiple, step: 0.5, type: "number" },
        ].map((f) => (
          <div key={f.label}>
            <label className="text-xs text-muted-foreground block mb-1">{f.label}</label>
            <input
              type={f.type}
              min="0"
              step={f.step}
              value={f.value}
              onChange={(e) => f.set(Number(e.target.value))}
              className="w-full text-sm border border-border rounded-lg px-3 py-2 bg-background"
            />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border text-center">
        <div>
          <p className="text-xl font-bold text-blue-600">{pctOwnership.toFixed(2)}%</p>
          <p className="text-xs text-muted-foreground">Ownership stake</p>
        </div>
        <div>
          <p className="text-xl font-bold text-amber-600">{fmt(costToExercise)}</p>
          <p className="text-xs text-muted-foreground">Cost to exercise</p>
        </div>
        <div>
          <p className="text-xl font-bold text-emerald-600">{fmt(gain)}</p>
          <p className="text-xs text-muted-foreground">Gain at {exitMultiple}× exit</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Under Div 83A startup concession: tax deferred until exercise/disposal. Employee pays income tax on the gain
        ({fmt(gain)}) at their marginal rate. Suggest employees consult a tax advisor before exercising options.
      </p>
    </div>
  );
}

/* ─── Main Client ────────────────────────────────────────────────────────── */

export function TeamClient() {
  const [openGuide, setOpenGuide] = React.useState<number | null>(null);

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Users className="h-6 w-6 text-blue-600" />
          Team & Salary Benchmarks
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          AU startup salaries 2026 · Division 83A ESOP guide · Grant calculator
        </p>
      </div>

      {/* Notice */}
      <div className="flex items-start gap-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-400">
          Salary ranges reflect AU startup market 2026. Sydney/Melbourne commands 10–15% premium. Figures include 11.5% superannuation. Always cross-reference with current Seek/LinkedIn job listings.
        </p>
      </div>

      {/* Salary Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">AU Startup Salary Benchmarks (base + super, AUD)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-muted/50 text-left">
                <th className="text-xs font-semibold text-muted-foreground py-3 px-4">Role</th>
                <th className="text-xs font-semibold text-muted-foreground py-3 pr-4">Level</th>
                <th className="text-xs font-semibold text-muted-foreground py-3 pr-4">P25</th>
                <th className="text-xs font-semibold text-muted-foreground py-3 pr-4">Median</th>
                <th className="text-xs font-semibold text-muted-foreground py-3 pr-4">P75</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {AU_ROLES.map((roleGroup) =>
                roleGroup.levels.map((level, i) => (
                  <SalaryRow
                    key={`${roleGroup.role}-${level.level}`}
                    role={i === 0 ? roleGroup.role : ""}
                    level={level.level}
                    p25={level.p25}
                    p50={level.p50}
                    p75={level.p75}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="px-5 py-3 border-t border-border text-xs text-muted-foreground">
          Source: Seek.com.au, LinkedIn Salary Insights, AVCAL 2025 survey, AngelList AU data
        </div>
      </div>

      {/* ESOP Calculator */}
      <ESOPGrantCalc />

      {/* Division 83A Guide */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border flex items-center gap-2">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm">Division 83A — Australian ESS Tax Guide</h2>
          <span className="ml-auto text-xs bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 px-2 py-0.5 rounded font-medium">
            General guidance only
          </span>
        </div>
        <div className="divide-y divide-border">
          {DIV83A_GUIDE.map((item, i) => (
            <div key={item.title}>
              <button
                onClick={() => setOpenGuide(openGuide === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-muted/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Info className="h-4 w-4 text-blue-500 shrink-0" />
                  <span className="text-sm font-medium">{item.title}</span>
                </div>
                <ChevronDown className={cn(
                  "h-4 w-4 text-muted-foreground transition-transform shrink-0",
                  openGuide === i && "rotate-180"
                )} />
              </button>
              {openGuide === i && (
                <div className="px-5 pb-4 pl-12">
                  <p className="text-sm text-muted-foreground leading-relaxed">{item.body}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[
          { label: "ESOP Manager", href: "/dashboard/esop", desc: "Manage pool & grants" },
          { label: "Cap Table", href: "/workspace/equity-esop", desc: "Full equity structure" },
          { label: "Finance P&L", href: "/dashboard/finance", desc: "Salary expense impact" },
          { label: "Accelerator Tracker", href: "/dashboard/accelerator", desc: "Show team in pitch binder" },
          { label: "ATO ESS Guide", href: "https://www.ato.gov.au/businesses-and-organisations/income-and-deductions-for-business/employee-share-schemes", desc: "Official ATO guidance" },
          { label: "BDO AU — ESS Advisors", href: "https://www.bdo.com.au", desc: "Tax advisory specialist" },
        ].map((link) => (
          <a
            key={link.label}
            href={link.href}
            target={link.href.startsWith("http") ? "_blank" : undefined}
            rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
            className="rounded-xl border border-border bg-card p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-colors group"
          >
            <p className="text-sm font-semibold group-hover:text-blue-600 transition-colors">{link.label}</p>
            <p className="text-xs text-muted-foreground mt-1">{link.desc}</p>
            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-blue-600 mt-2 transition-colors" />
          </a>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center pb-4">
        This page provides general educational information only. Consult a qualified tax advisor before implementing an ESS plan.
      </p>
    </div>
  );
}
