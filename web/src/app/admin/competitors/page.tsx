import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import {
  ArrowLeft,
  Check,
  Shield,
  Swords,
  Trophy,
  Zap,
} from "lucide-react";
import { CompetitorsTable, type Competitor } from "./competitors-table";

export const metadata: Metadata = {
  title: "Competitor Intelligence — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* ── Competitor data (hardcoded — move to DB later) ────────────────────── */

const COMPETITORS: Competitor[] = [
  { name: "Carta", url: "carta.com", focus: "Cap table + 409A + equity", pricing: "$280-2,800/yr", target: "Pre-seed to Series C+", geo: "US", freeTier: false, hasScoring: false, hasValuation: true, hasCapTable: true, hasFundraising: false, hasAI: false, hasTokenization: false, hasCompliance: false, weakness: "Expensive, poor bulk ops, inconsistent support" },
  { name: "Pulley", url: "pulley.com", focus: "Cap table + 409A", pricing: "$1,200/yr", target: "Pre-seed to Series B", geo: "US", freeTier: true, hasScoring: false, hasValuation: true, hasCapTable: true, hasFundraising: false, hasAI: false, hasTokenization: false, hasCompliance: false, weakness: "US-only, limited integrations" },
  { name: "Equidam", url: "equidam.com", focus: "One-shot valuation", pricing: "$350+/shot", target: "Pre-seed to Series A", geo: "Global", freeTier: false, hasScoring: false, hasValuation: true, hasCapTable: false, hasFundraising: false, hasAI: true, hasTokenization: false, hasCompliance: false, weakness: "One-shot only, no living score, no cap table" },
  { name: "Finta", url: "trustfinta.com", focus: "AI fundraising CRM", pricing: "$22-99/mo", target: "Pre-seed to Seed", geo: "Global", freeTier: true, hasScoring: false, hasValuation: false, hasCapTable: false, hasFundraising: true, hasAI: true, hasTokenization: false, hasCompliance: false, weakness: "No valuation, no cap table, no scoring" },
  { name: "Cake Equity", url: "cakeequity.com", focus: "AU cap table + ESOP", pricing: "$540/yr", target: "Seed to Growth", geo: "AU/US/UK", freeTier: true, hasScoring: false, hasValuation: false, hasCapTable: true, hasFundraising: false, hasAI: false, hasTokenization: false, hasCompliance: true, weakness: "No AI, no scoring, no fundraising tools" },
  { name: "SeedLegals", url: "seedlegals.com", focus: "Legal docs + funding rounds", pricing: "\u00A3999/yr", target: "Pre-seed to Series A", geo: "UK", freeTier: false, hasScoring: false, hasValuation: false, hasCapTable: false, hasFundraising: true, hasAI: false, hasTokenization: false, hasCompliance: true, weakness: "UK-only, clunky UX, credit expiry" },
  { name: "Foundersuite", url: "foundersuite.com", focus: "Fundraising CRM + investor DB", pricing: "$745/yr", target: "Pre-seed to Series A", geo: "Global", freeTier: true, hasScoring: false, hasValuation: false, hasCapTable: false, hasFundraising: true, hasAI: false, hasTokenization: false, hasCompliance: false, weakness: "No cap table, no equity, no legal docs" },
  { name: "Visible.vc", url: "visible.vc", focus: "Investor updates + metrics", pricing: "$59-199/mo", target: "Seed to Series B", geo: "Global", freeTier: true, hasScoring: false, hasValuation: false, hasCapTable: false, hasFundraising: true, hasAI: true, hasTokenization: false, hasCompliance: false, weakness: "No cap table, no equity management" },
  { name: "DocSend", url: "docsend.com", focus: "Data rooms + pitch tracking", pricing: "$45-250/mo", target: "Seed to Series B", geo: "Global", freeTier: false, hasScoring: false, hasValuation: false, hasCapTable: false, hasFundraising: true, hasAI: false, hasTokenization: false, hasCompliance: false, weakness: "Document-focused only, expensive" },
  { name: "Crunchbase", url: "crunchbase.com", focus: "Startup data + research", pricing: "$588/yr", target: "Investors/researchers", geo: "Global", freeTier: true, hasScoring: false, hasValuation: false, hasCapTable: false, hasFundraising: false, hasAI: true, hasTokenization: false, hasCompliance: false, weakness: "Data accuracy issues, no operational tools" },
  { name: "CB Insights", url: "cbinsights.com", focus: "Investor-facing Mosaic Score", pricing: "$50K+/yr", target: "VCs/Enterprise", geo: "Global", freeTier: false, hasScoring: true, hasValuation: true, hasCapTable: false, hasFundraising: false, hasAI: true, hasTokenization: false, hasCompliance: false, weakness: "Founders can\u2019t access own score, enterprise-only" },
  { name: "BlockID.au", url: "blockid.au", focus: "Full lifecycle: Score\u2192Value\u2192Equity\u2192Token\u2192Fundraise\u2192Exit", pricing: "A$0.50/analysis", target: "Day 0 to Scale", geo: "AU-first, Global", freeTier: true, hasScoring: true, hasValuation: true, hasCapTable: true, hasFundraising: true, hasAI: true, hasTokenization: true, hasCompliance: true, weakness: "Early stage, building brand awareness" },
];

const FEATURE_KEYS: (keyof Competitor)[] = [
  "hasScoring", "hasValuation", "hasCapTable", "hasFundraising", "hasAI", "hasTokenization", "hasCompliance",
];

const TOTAL_FEATURES = FEATURE_KEYS.length;

function countFeatures(c: Competitor): number {
  return FEATURE_KEYS.reduce((sum, k) => sum + (c[k] ? 1 : 0), 0);
}

const blockid = COMPETITORS.find((c) => c.name === "BlockID.au")!;
const blockidFeatureCount = countFeatures(blockid);

const competitorsOnly = COMPETITORS.filter((c) => c.name !== "BlockID.au");
const nearestCount = Math.max(...competitorsOnly.map(countFeatures));

const ADVANTAGES = [
  "Only platform with end-to-end lifecycle",
  "Only founder-facing living score (vs CB Insights investor-only)",
  "Only AU compliance automation (ESIC, R&D Tax)",
  "Only AI C-Level agent ecosystem",
  "Pricing starts at A$0.50 vs $280+ for competitors",
];

/* ── Page component ───────────────────────────────────────────────────── */

export default async function CompetitorsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/competitors");

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <p className="text-ink-600 text-sm mb-6">You don&apos;t have admin access to BlockID.</p>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">&larr; Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      {/* Header */}
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-purple-600 bg-purple-500/10 border border-purple-500/20 rounded px-2 py-0.5">
            COMPETITORS
          </span>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-ink-700">
            {new Date().toLocaleDateString("en-AU", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
          </span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8 space-y-8">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold text-ink-800 flex items-center gap-2">
            <Swords strokeWidth={1.75} className="h-6 w-6 text-brand-600" />
            Competitor Intelligence Dashboard
          </h1>
          <p className="text-sm text-ink-700 mt-1">
            Feature-by-feature comparison of {COMPETITORS.length} platforms in the startup infrastructure space.
          </p>
        </div>

        {/* Summary stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-brand-200 bg-brand-50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Trophy strokeWidth={1.75} className="h-4 w-4 text-brand-600" />
              <p className="text-xs uppercase tracking-[0.15em] text-brand-700 font-medium">BlockID Coverage</p>
            </div>
            <p className="text-3xl font-bold font-mono text-brand-700">
              {blockidFeatureCount}/{TOTAL_FEATURES}
            </p>
            <p className="text-xs text-brand-600 mt-1">capabilities covered</p>
          </div>
          <div className="rounded-xl border border-surface-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-2">
              <Swords strokeWidth={1.75} className="h-4 w-4 text-ink-600" />
              <p className="text-xs uppercase tracking-[0.15em] text-ink-600 font-medium">Nearest Competitor</p>
            </div>
            <p className="text-3xl font-bold font-mono text-ink-800">
              {nearestCount}/{TOTAL_FEATURES}
            </p>
            <p className="text-xs text-ink-600 mt-1">capabilities covered</p>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <div className="flex items-center gap-2 mb-2">
              <Zap strokeWidth={1.75} className="h-4 w-4 text-emerald-600" />
              <p className="text-xs uppercase tracking-[0.15em] text-emerald-700 font-medium">Advantage Gap</p>
            </div>
            <p className="text-3xl font-bold font-mono text-emerald-700">
              +{blockidFeatureCount - nearestCount}
            </p>
            <p className="text-xs text-emerald-600 mt-1">more capabilities than any competitor</p>
          </div>
        </div>

        {/* Feature Comparison Matrix (client component for expand/collapse) */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4">Feature Comparison Matrix</h2>
          <CompetitorsTable competitors={COMPETITORS} />
        </section>

        {/* BlockID Unique Advantages */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4 flex items-center gap-2">
            <Trophy strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            BlockID Unique Advantages
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {ADVANTAGES.map((adv, i) => (
              <div
                key={i}
                className="rounded-xl border border-brand-200 bg-gradient-to-br from-brand-50 to-white p-5 flex items-start gap-3"
              >
                <div className="mt-0.5 rounded-full bg-brand-100 p-1.5 shrink-0">
                  <Check strokeWidth={2.5} className="h-3.5 w-3.5 text-brand-700" />
                </div>
                <p className="text-sm font-medium text-ink-800 leading-relaxed">{adv}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Actions */}
        <section>
          <h2 className="text-lg font-semibold text-ink-800 mb-4">Quick Actions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <Link href="/admin" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">Admin Dashboard</p>
              <p className="text-xs text-ink-600 mt-0.5">Users, accounts, analyses</p>
            </Link>
            <Link href="/admin/growth" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">Growth Intelligence</p>
              <p className="text-xs text-ink-600 mt-0.5">Funnel, recommendations</p>
            </Link>
            <Link href="/admin/roadmap" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">Product Roadmap</p>
              <p className="text-xs text-ink-600 mt-0.5">Phases, milestones, progress</p>
            </Link>
            <Link href="/admin/users" className="block rounded-xl border border-surface-200 bg-white px-4 py-3 hover:border-brand-500/40 transition-colors">
              <p className="text-sm font-semibold text-ink-800">Manage Users</p>
              <p className="text-xs text-ink-600 mt-0.5">Plans, roles, activity</p>
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
