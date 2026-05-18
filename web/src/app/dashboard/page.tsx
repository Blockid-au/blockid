import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
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
  searchParams: Promise<{ welcome?: string }>;
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
      <Navbar />
      <main className="min-h-screen bg-ink-950 pt-28 pb-24 text-slate-100">
        <div className="mx-auto max-w-6xl px-6">
          {sp.welcome === "1" && <WelcomeBanner />}

          <Header email={user.email} />

          <SummaryStrip summary={summary} />

          <PacksSection summary={summary} />

          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            <EvaluationsCard summary={summary} />
            <SplitsCard summary={summary} />
            <FundingCard summary={summary} />
          </div>

          <NextStepsCard />
        </div>
      </main>
      <Footer />
    </>
  );
}

function WelcomeBanner() {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-brand-400/40 bg-brand-400/5 p-4">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-300" />
      <div>
        <p className="font-semibold text-brand-200">
          Welcome to BlockID. Your account is live.
        </p>
        <p className="mt-1 text-sm text-slate-300">
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
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
          Dashboard
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">
          Your idea-phase workspace
        </h1>
        <p className="mt-2 text-sm text-slate-400">
          Signed in as{" "}
          <span className="font-medium text-slate-200">{email}</span>
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
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
          className="rounded-2xl border border-ink-700 bg-ink-900 p-5"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              {label}
            </p>
            <Icon className="h-4 w-4 text-brand-400" />
          </div>
          <p className="mt-3 text-3xl font-semibold text-slate-50">{value}</p>
        </div>
      ))}
    </div>
  );
}

function PacksSection({ summary }: { summary: DashboardSummary }) {
  return (
    <section className="mt-10 rounded-2xl border border-ink-700 bg-ink-900 p-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-50">
          Founder Packs
        </h2>
        <Link
          href="/tools/idea-valuation"
          className="text-sm font-medium text-brand-300 hover:text-brand-200"
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
        <ul className="mt-5 divide-y divide-ink-700/60">
          {summary.packs.map((p) => (
            <li
              key={p.id}
              className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="text-base font-semibold text-slate-100">
                  {p.ideaName || "Untitled idea"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
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
            className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-100">
                {e.ideaName || "Untitled"}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(e.createdAt).toLocaleDateString("en-AU")}
              </p>
            </div>
            <p className="text-sm font-semibold text-brand-300">
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
            className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3"
          >
            <p className="text-sm text-slate-200">
              {s.founderCount}{" "}
              {s.founderCount === 1 ? "founder" : "founders"}
            </p>
            <p className="text-xs text-slate-500">
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
            className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 bg-ink-800/40 px-4 py-3"
          >
            <div>
              <p className="text-sm font-semibold text-slate-100">
                Raise {formatAud(f.recommendedRaise ?? 0)}
              </p>
              <p className="text-xs text-slate-500">
                {new Date(f.createdAt).toLocaleDateString("en-AU")}
              </p>
            </div>
            <p className="text-xs text-slate-500">
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
    <section className="mt-10 rounded-2xl border border-brand-500/40 bg-gradient-to-br from-ink-900 to-ink-800 p-6">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gold-400">
        <BarChart3 className="h-4 w-4" />
        Already incorporated?
      </div>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight text-slate-50">
        Bridge to your Investor-Ready Score.
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-300">
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
    <div className="rounded-2xl border border-ink-700 bg-ink-900 p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
        <Icon className="h-4 w-4 text-brand-400" />
        {title}
      </div>
      <div className="mt-4">
        {empty ? (
          <Link
            href={emptyHref}
            className="block rounded-xl border border-dashed border-ink-700 px-4 py-6 text-center text-sm text-slate-400 transition-colors hover:border-brand-500/40 hover:text-slate-200"
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
    <div className="mt-5 rounded-xl border border-dashed border-ink-700 px-6 py-10 text-center">
      <p className="text-base font-semibold text-slate-100">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-slate-400">{body}</p>
      <Link href={href} className="mt-5 inline-block">
        <Button variant="primary" size="md" className="h-10">
          {ctaLabel}
        </Button>
      </Link>
    </div>
  );
}
