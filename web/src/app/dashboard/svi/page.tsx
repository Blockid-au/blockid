import type { Metadata } from "next";
import { SVIDashboard } from "@/components/svi/svi-dashboard";
import { Logo } from "@/components/brand/logo";
import { SVI_STAGE_LABELS, SVI_BENCHMARKS } from "@/lib/svi-analysis";

export const metadata: Metadata = {
  title: "SVI Dashboard | BlockID.au",
  description: "Your Startup Value Index dashboard — track, prove and grow startup value.",
};

// Demo data — replace with real account data once auth is wired
const DEMO_ANALYSIS = {
  version: "2.0.0",
  totalSVI: 118,
  baselineSVI: 100,
  netAdjustment: 18,
  stage: 2,
  stageLabel: "MVP / Prototype",
  stageBonus: 5,
  confidenceMultiplier: 0.35,
  weeklyDelta: +6,
  percentileRank: 65,
  summary: "Above Average Startup Value Index. 2 risk factors detected. 3 critical evidence gaps to address.",
  subs: [
    { label: "Founder & Team", key: "ftv", value: 62, adjustment: +4, rationale: "", evidence: ["First-time founder"], gaps: ["Add co-founder or advisor"] },
    { label: "Market & Problem", key: "mpc", value: 70, adjustment: +7, rationale: "", evidence: ["Clear problem statement"], gaps: ["Add customer interviews"] },
    { label: "Product & Technical", key: "ptd", value: 75, adjustment: +6, rationale: "", evidence: ["Demo available", "Website live"], gaps: ["Link GitHub repository"] },
    { label: "Traction & Revenue", key: "tre", value: 35, adjustment: -4, rationale: "", evidence: [], gaps: ["Get first paying customer", "Connect analytics"] },
    { label: "Cap Table & Governance", key: "cgh", value: 42, adjustment: -2, rationale: "", evidence: ["Cap table referenced"], gaps: ["Add vesting schedule", "Create SHA"] },
    { label: "Investor Readiness", key: "iri", value: 48, adjustment: -1, rationale: "", evidence: ["Pitch deck mentioned"], gaps: ["Upload financial model", "Build data room"] },
    { label: "Legal & Compliance", key: "lco", value: 50, adjustment: 0, rationale: "", evidence: [], gaps: ["Register ABN/ASIC", "Add legal docs"] },
    { label: "Strategic Vision & Moat", key: "svm", value: 60, adjustment: +2, rationale: "", evidence: ["Moat identified"], gaps: [] },
  ],
  riskPenalties: [
    { label: "Unverified Claims", points: 8, reason: "All info is self-declared. Upload docs or connect integrations." },
    { label: "Undefined Market Size", points: 10, reason: "No TAM/SAM defined. Add market research." },
  ],
  evidenceGaps: [
    { priority: "P0", label: "Add first revenue proof", action: "Connect Stripe or upload invoice", impact: 18, evidenceType: "transaction_data" },
    { priority: "P0", label: "Upgrade evidence level", action: "Upload pitch deck or connect GitHub", impact: 15, evidenceType: "document_uploaded" },
    { priority: "P1", label: "Link source code", action: "Connect GitHub OAuth", impact: 10, evidenceType: "connected_source" },
  ],
  nextActions: [
    { priority: "P0", title: "Add verifiable evidence", detail: "Upload docs or connect integrations to raise confidence from 35% to 50%+.", impact: "+15 SVI" },
    { priority: "P1", title: "Get first paying customer", detail: "Even $1 of revenue lifts TRE significantly.", impact: "+18 SVI" },
  ],
  signals: {} as any,
};

// Suppress unused import warnings — these are available for future use
void SVI_STAGE_LABELS;
void SVI_BENCHMARKS;

export default function SVIDashboardPage() {
  return (
    <div className="min-h-svh bg-ink-950 text-slate-50">
      <header className="max-w-5xl mx-auto px-6 py-5 flex items-center justify-between">
        <Logo variant="dark" />
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500">demo@startup.com</span>
          <a href="/" className="text-xs text-slate-400 hover:text-slate-200 transition-colors">← Home</a>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-6 pb-24">
        <SVIDashboard analysis={DEMO_ANALYSIS as any} startupName="My Startup" />
      </main>
    </div>
  );
}
