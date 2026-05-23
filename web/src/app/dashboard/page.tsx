import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageTracker } from "@/components/analytics/page-tracker";
import {
  ArrowRight,
  BarChart3,
  CheckCircle,
  Eye,
  FileText,
  Lightbulb,
  PieChart,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/auth";
import {
  loadDashboardSummary,
  type DashboardSummary,
} from "@/lib/idea-phase/persist";
import { formatAud } from "@/lib/utils";
import { getPlan } from "@/lib/plans";
import { LivingReport } from "@/components/workspace/living-report";
import { ReferralCard } from "@/components/ui/referral-card";
import { DashboardValuationCard } from "@/components/dashboard/valuation-card";
import { CapTableWidget } from "@/components/dashboard/cap-table-widget";
import { ReportHistory } from "@/components/dashboard/report-history";
import { InsightsPanel } from "@/components/dashboard/insights-panel";
import { JourneyProgress } from "@/components/dashboard/journey-progress";
import { SVITrendChart } from "@/components/dashboard/svi-trend-chart";

// /dashboard — authed view of a founder's saved idea-phase artifacts.
// Lists Founder Packs, idea evaluations, equity splits and funding plans,
// each linking back to its share page or original tool.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Dashboard · BlockID",
  robots: { index: false, follow: false },
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ welcome?: string; checkout?: string; plan?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) {
    // Bounce to login. After verify the session is set and we land back here.
    redirect("/auth/login?next=/dashboard");
  }

  const sp = await searchParams;
  const summary = await loadDashboardSummary(user.id);

  return (
    <>
      <PageTracker page="dashboard" />
      <Navbar />
      <main className="min-h-screen bg-surface-100 pt-28 pb-24 text-ink-800">
        <div className="mx-auto max-w-6xl px-6">
          {sp.checkout === "success" && (
            <CheckoutSuccessBanner plan={sp.plan} />
          )}
          {sp.welcome === "1" && <WelcomeBanner />}

          <Header email={user.email} />

          <QuickActions hasSVI={!!summary.packs.length || !!summary.evaluations.length} hasEvidence={false} />

          <div className="mt-8">
            <LivingReport email={user.email} />
          </div>

          <SummaryStrip summary={summary} />

          <JourneyProgress email={user.email} />

          <SVITrendChart email={user.email} />

          <ReportHistory email={user.email} />

          <InsightsPanel />

          <DashboardValuationCard email={user.email} />

          <CapTableWidget email={user.email} />

          <PacksSection summary={summary} />

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <EvaluationsCard summary={summary} />
            <SplitsCard summary={summary} />
            <FundingCard summary={summary} />
          </div>

          <div className="mt-10">
            <ReferralCard />
          </div>

          <NextStepsCard />
        </div>
      </main>
      <Footer />
    </>
  );
}

function QuickActions({ hasSVI, hasEvidence }: { hasSVI: boolean; hasEvidence: boolean }) {
  const actions = [];

  if (!hasSVI) {
    actions.push({
      href: "/score",
      icon: Sparkles,
      label: "Get Your SVI Score",
      desc: "Free AI analysis in 60 seconds",
      color: "bg-brand-600 hover:bg-brand-700 text-white",
      priority: true,
    });
  }

  actions.push({
    href: "/workspace/evidence",
    icon: TrendingUp,
    label: hasSVI ? "Upload Evidence to Boost Score" : "Upload Evidence",
    desc: hasEvidence ? "Add more proof to grow your SVI" : "Connect GitHub, Stripe, or upload docs",
    color: "bg-white border border-brand-200 text-brand-700 hover:bg-brand-50",
  });

  if (hasSVI) {
    actions.push({
      href: "/workspace/cap-table",
      icon: PieChart,
      label: "Set Up Cap Table",
      desc: "Manage equity splits and vesting",
      color: "bg-white border border-surface-200 text-ink-700 hover:bg-surface-50",
    });
  }

  actions.push({
    href: "/workspace/projects",
    icon: Lightbulb,
    label: "Manage Projects",
    desc: "Track multiple startups",
    color: "bg-white border border-surface-200 text-ink-700 hover:bg-surface-50",
  });

  return (
    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
      {actions.slice(0, 4).map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className={`flex items-center gap-3 rounded-xl px-4 py-3 transition-all ${a.color} ${a.priority ? "shadow-md ring-2 ring-brand-200" : "shadow-sm"}`}
        >
          <a.icon strokeWidth={1.75} className="h-5 w-5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{a.label}</p>
            <p className={`text-[11px] truncate ${a.priority ? "text-brand-200" : "text-ink-500"}`}>{a.desc}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function CheckoutSuccessBanner({ plan }: { plan?: string }) {
  const planDef = plan ? getPlan(plan) : undefined;
  const planName = planDef?.name ?? plan ?? "your";
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
      <CheckCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      <div>
        <p className="font-semibold text-emerald-700">
          Your {planName} plan is now active!
        </p>
        <p className="mt-1 text-sm text-ink-600">
          Payment confirmed. All plan features are unlocked and ready to use.
        </p>
      </div>
    </div>
  );
}

function WelcomeBanner() {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-brand-200 bg-brand-50 p-4">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
      <div>
        <p className="font-semibold text-brand-700">
          Welcome to BlockID. Your account is live.
        </p>
        <p className="mt-1 text-sm text-ink-600">
          Anything you save from the free tools shows up here. Open a Founder
          Pack from the list below to share it.
        </p>
      </div>
    </div>
  );
}

function Header({ email }: { email: string }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800 sm:text-4xl">
          Your idea-phase workspace
        </h1>
        <p className="mt-2 text-sm text-ink-600">
          Signed in as{" "}
          <span className="font-medium text-ink-800">{email}</span>
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full sm:w-auto">
        <Link href="/tools/idea-valuation">
          <Button variant="primary" size="md" className="h-10">
            New idea valuation
          </Button>
        </Link>
        <form action="/api/auth/logout" method="post">
          <Button
            type="submit"
            variant="secondary"
            size="md"
            className="h-10"
          >
            Sign out
          </Button>
        </form>
      </div>
    </div>
  );
}

function SummaryStrip({ summary }: { summary: DashboardSummary }) {
  const totalViews = summary.packs.reduce((acc, p) => acc + p.viewCount, 0);
  const stats = [
    {
      label: "Founder Packs",
      value: summary.packs.length,
      icon: FileText,
    },
    {
      label: "Idea valuations",
      value: summary.evaluations.length,
      icon: Lightbulb,
    },
    {
      label: "Equity splits",
      value: summary.splits.length,
      icon: PieChart,
    },
    {
      label: "Pack views",
      value: totalViews,
      icon: Eye,
    },
  ];
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map(({ label, value, icon: Icon }) => (
        <div
          key={label}
          className="bg-white border border-surface-200 shadow-sm rounded-2xl p-5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-ink-700">
              {label}
            </p>
            <Icon className="h-4 w-4 text-brand-600" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-ink-800">{value}</p>
        </div>
      ))}
    </div>
  );
}

function PacksSection({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="mt-10 bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink-800">
          Founder Packs
        </h2>
        <Link
          href="/tools/idea-valuation"
          className="text-sm font-medium text-brand-600 hover:text-brand-700"
        >
          + Save a new pack
        </Link>
      </div>

      {summary.packs.length === 0 ? (
        <EmptyState
          title="No packs yet."
          body="Run any of the four free tools, then click 'Save my Founder Pack' to mint your first one."
          ctaLabel="Open Idea Valuation"
          href="/tools/idea-valuation"
        />
      ) : (
        <ul className="mt-5 divide-y divide-surface-200">
          {summary.packs.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-base font-semibold text-ink-800">
                  {p.ideaName || "Untitled idea"}
                </p>
                <p className="mt-1 text-xs text-ink-700">
                  {new Date(p.createdAt).toLocaleDateString("en-AU")} ·{" "}
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3 w-3" /> {p.viewCount}{" "}
                    {p.viewCount === 1 ? "view" : "views"}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href={`/s/p/${p.slug}`}>
                  <Button variant="secondary" size="sm" className="h-9">
                    Open share page
                  </Button>
                </Link>
                <Link href={`/s/p/${p.slug}/pdf`}>
                  <Button variant="primary" size="sm" className="h-9">
                    Download PDF
                  </Button>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function EvaluationsCard({ summary }: { summary: DashboardSummary }) {
  return (
    <SectionCard
      title="Idea valuations"
      icon={Lightbulb}
      empty={summary.evaluations.length === 0}
      emptyHref="/tools/idea-valuation"
      emptyLabel="Run idea valuation"
    >
      <ul className="space-y-3">
        {summary.evaluations.slice(0, 5).map((e) => (
          <li
            key={e.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-100 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-ink-800">
                {e.ideaName || "Untitled"}
              </p>
              <p className="text-xs text-ink-700">
                {new Date(e.createdAt).toLocaleDateString("en-AU")}
              </p>
            </div>
            <p className="text-sm font-semibold text-brand-600">
              {formatAud(e.valuationMidAud)}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function SplitsCard({ summary }: { summary: DashboardSummary }) {
  return (
    <SectionCard
      title="Equity splits"
      icon={PieChart}
      empty={summary.splits.length === 0}
      emptyHref="/tools/equity-split"
      emptyLabel="Run equity split"
    >
      <ul className="space-y-3">
        {summary.splits.slice(0, 5).map((s) => (
          <li
            key={s.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-100 px-4 py-3"
          >
            <p className="text-sm text-ink-800">
              {s.founderCount}{" "}
              {s.founderCount === 1 ? "founder" : "founders"}
            </p>
            <p className="text-xs text-ink-700">
              {new Date(s.createdAt).toLocaleDateString("en-AU")}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function FundingCard({ summary }: { summary: DashboardSummary }) {
  return (
    <SectionCard
      title="Funding plans"
      icon={TrendingUp}
      empty={summary.fundingPlans.length === 0}
      emptyHref="/tools/funding-plan"
      emptyLabel="Run funding plan"
    >
      <ul className="space-y-3">
        {summary.fundingPlans.slice(0, 5).map((f) => (
          <li
            key={f.id}
            className="flex items-center justify-between gap-3 rounded-xl border border-surface-200 bg-surface-100 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-ink-800">
                Raise {formatAud(f.recommendedRaise ?? 0)}
              </p>
              <p className="text-xs text-ink-700">
                {new Date(f.createdAt).toLocaleDateString("en-AU")}
              </p>
            </div>
            <p className="text-xs text-ink-700">
              Need {formatAud(f.totalNeedAud ?? 0)}
            </p>
          </li>
        ))}
      </ul>
    </SectionCard>
  );
}

function NextStepsCard() {
  return (
    <section className="mt-10 bg-white border border-brand-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-600">
        <BarChart3 className="h-4 w-4" />
        Already incorporated?
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-ink-800">
        Bridge to your Investor-Ready Score.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-600">
        When you incorporate, BlockID converts your saved valuations, splits
        and plans into your wedge product Score and dataroom. One click — no
        re-typing.
      </p>
      <div className="mt-5 flex flex-wrap gap-3">
        <Link href="/score">
          <Button variant="primary" size="md" className="h-11">
            Get Investor-Ready Score
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>
    </section>
  );
}

function SectionCard({
  title,
  icon: Icon,
  empty,
  emptyHref,
  emptyLabel,
  children,
}: {
  title: string;
  icon: typeof Lightbulb;
  empty: boolean;
  emptyHref: string;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white border border-surface-200 shadow-sm rounded-2xl p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-ink-800">
        <Icon className="h-4 w-4 text-brand-600" />
        {title}
      </div>
      <div className="mt-4">
        {empty ? (
          <Link
            href={emptyHref}
            className="block rounded-xl border border-dashed border-surface-200 px-4 py-6 text-center text-sm text-ink-600 transition-colors hover:border-brand-200 hover:text-ink-800"
          >
            {emptyLabel} →
          </Link>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function EmptyState({
  title,
  body,
  ctaLabel,
  href,
}: {
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
}) {
  return (
    <div className="mt-5 rounded-xl border border-dashed border-surface-200 px-6 py-10 text-center">
      <p className="text-base font-semibold text-ink-800">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">{body}</p>
      <Link href={href} className="mt-5 inline-block">
        <Button variant="primary" size="md" className="h-10">
          {ctaLabel}
        </Button>
      </Link>
    </div>
  );
}
