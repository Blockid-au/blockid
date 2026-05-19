import Link from "next/link";
import {
  ArrowRight,
  Calculator,
  Lightbulb,
  PieChart,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

type Tool = {
  href: string;
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  body: string;
  cta: string;
};

const tools: Tool[] = [
  {
    href: "/tools/idea-valuation",
    icon: Lightbulb,
    eyebrow: "Step 1",
    title: "Idea Valuation",
    body: "Berkus + Scorecard methods. AUD valuation band in under 5 minutes.",
    cta: "Value my idea",
  },
  {
    href: "/tools/equity-split",
    icon: PieChart,
    eyebrow: "Step 2",
    title: "Equity Split",
    body: "Weighted-points calculator for up to 5 co-founders with vesting schedules.",
    cta: "Split equity fairly",
  },
  {
    href: "/tools/cofounder-match",
    icon: Users,
    eyebrow: "Step 3",
    title: "Co-founder Match",
    body: "Find a complementary co-founder in the Australian builder network.",
    cta: "Find a co-founder",
  },
  {
    href: "/tools/funding-plan",
    icon: TrendingUp,
    eyebrow: "Step 4",
    title: "Funding Plan",
    body: "Burn rate, runway, capital stack and dilution preview before you raise.",
    cta: "Plan my raise",
  },
];

export function IdeaTools() {
  return (
    <section id="idea-tools" className="bg-surface-50 py-20 text-brand-900 sm:py-24">
      <div className="mx-auto max-w-[1500px] px-4 sm:px-6 lg:px-9">
        <div className="grid gap-7 md:grid-cols-[1fr_auto] md:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-gold-600">
              Free for every founder
            </p>
            <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-tight sm:text-5xl">
              Four free tools. No account needed.
            </h2>
            <p className="mt-4 max-w-2xl text-base font-medium leading-relaxed text-ink-700 sm:text-lg">
              Pre-incorporation builders start here. Value your idea, split
              equity fairly, find a co-founder and plan your raise. Save
              everything as your{" "}
              <span className="font-semibold text-gold-600">Founder Pack</span>{" "}
              when you&apos;re ready.
            </p>
          </div>
          <Link
            href="/tools/idea-valuation"
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-brand-600 px-6 text-sm font-semibold text-white shadow-[0_18px_48px_rgba(59,125,216,0.28)] transition-colors hover:bg-brand-700 sm:text-base"
          >
            Start free now
            <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
          </Link>
        </div>

        <div className="mt-10 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
          {tools.map((tool) => (
            <ToolCard key={tool.href} tool={tool} />
          ))}
        </div>

        <div className="mt-10 flex flex-wrap items-center gap-3 rounded-2xl border border-surface-200 bg-surface-100 px-5 py-4">
          <Calculator
            strokeWidth={1.75}
            className="h-6 w-6 shrink-0 text-brand-500"
          />
          <p className="text-sm font-medium leading-relaxed text-ink-700 sm:text-base">
            Already raising?{" "}
            <Link
              href="/score"
              className="font-semibold text-gold-600 underline underline-offset-4 hover:text-gold-600"
            >
              Skip ahead and get your Investor-Ready Score
            </Link>
            &nbsp;&mdash; it takes 5 minutes.
          </p>
        </div>
      </div>
    </section>
  );
}

function ToolCard({ tool }: { tool: Tool }) {
  const Icon = tool.icon;
  return (
    <Link
      href={tool.href}
      className="group flex flex-col rounded-2xl border border-surface-200 bg-white p-6 shadow-sm card-hover"
    >
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-500">
        <Icon strokeWidth={1.75} className="h-7 w-7" />
      </span>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.18em] text-gold-600">
        {tool.eyebrow}
      </p>
      <h3 className="mt-2 text-xl font-semibold leading-tight text-brand-900">
        {tool.title}
      </h3>
      <p className="mt-2 flex-1 text-sm font-medium leading-relaxed text-ink-700">
        {tool.body}
      </p>
      <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-600 transition-transform group-hover:translate-x-0.5">
        {tool.cta}
        <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
      </span>
    </Link>
  );
}
