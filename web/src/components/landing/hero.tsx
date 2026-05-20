import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  FileText,
  FolderLock,
  Link2,
  PieChart,
  Play,
  QrCode,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const TRUSTED_BY = ["aws", "stripe", "xero", "Google Cloud", "HubSpot"];

const SCORE_ROWS = [
  ["Financial Traction", 85],
  ["Cap Table Hygiene", 90],
  ["Governance Readiness", 80],
  ["Documentation Quality", 88],
  ["Fundraising Clarity", 87],
];

const ACTIVITY = [
  ["Jane Smith", "Viewed score", "2h ago"],
  ["Michael Chen", "Viewed report", "5h ago"],
  ["Sarah Lee", "Downloaded report", "1d ago"],
];

const PILLARS: { icon: LucideIcon; title: string; sub: string }[] = [
  {
    icon: ShieldCheck,
    title: "Trusted Ownership",
    sub: "Build trust from the idea stage",
  },
  {
    icon: PieChart,
    title: "Cap Table & Equity Management",
    sub: "Manage shares, vesting and dilution",
  },
  {
    icon: FolderLock,
    title: "Investor-Ready Data Rooms",
    sub: "Be investor-ready, always",
  },
  {
    icon: BarChart3,
    title: "Valuation & Equity Intelligence",
    sub: "Track, understand and grow equity value",
  },
  {
    icon: FileText,
    title: "Fundraising Made Simple",
    sub: "From idea to raise in minutes",
  },
];

export function Hero() {
  return (
    <section className="relative max-w-[100vw] overflow-hidden gradient-hero pt-32 md:pt-36 pb-8 text-brand-900">
      <div className="relative mx-auto max-w-[1800px] px-6 lg:px-12">
        <div className="grid min-w-0 items-center gap-10 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="w-full min-w-0 max-w-[calc(100vw-3rem)] sm:max-w-[760px]">
            <p className="inline-flex items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-brand-600">
              <Sparkles strokeWidth={1.75} className="h-4 w-4" />
              Trusted Ownership &amp; Fundraising Platform
            </p>

            <h1 className="mt-8 font-semibold leading-[0.98] tracking-tight text-brand-800">
              <span className="block text-[clamp(2.5rem,10.5vw,3rem)] sm:hidden">
                OWN IT.
                <br />
                <span className="text-gold-500">PROVE IT.</span>
                <br />
                GROW IT.
              </span>
              <span className="hidden text-[clamp(3.6rem,8vw,7.25rem)] sm:block">
                OWN IT.
                <br />
                <span className="text-gold-500">PROVE IT.</span>
                <br />
                GROW IT.
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-ink-700 md:text-2xl">
              Trusted Ownership. Smarter Fundraising. Real Value.
            </p>

            <p className="mt-4 max-w-2xl text-base leading-relaxed text-ink-700 md:text-lg">
              BlockID.au is the all-in-one ownership and fundraising platform for
              startups and SMEs. We help founders, co-founders, and investors
              securely manage equity, simplify fundraising, and unlock the true
              value of ownership from day one.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link href="/score">
                <Button
                  variant="primary"
                  size="lg"
                  className="h-16 w-full rounded-xl bg-brand-600 px-4 text-sm text-white shadow-[0_18px_48px_rgba(59,125,216,0.28)] hover:bg-brand-700 sm:w-auto sm:px-9 sm:text-base"
                >
                  Get your Investor-Ready Score
                  <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/#product">
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-16 w-full rounded-xl border-surface-200 bg-surface-100 px-9 text-base text-brand-700 hover:bg-surface-200 sm:w-auto"
                >
                  <Play strokeWidth={1.75} className="h-5 w-5 fill-gold-500 text-gold-500" />
                  See how it works
                </Button>
              </Link>
            </div>

            <div className="mt-14 grid max-w-3xl gap-6 md:grid-cols-3">
              <HeroBenefit
                icon={Clock3}
                title="Investor-ready in minutes"
                body="From data to shareable investor pack."
              />
              <HeroBenefit
                icon={ShieldCheck}
                title="Proof you can trust"
                body="Tamper-evident reports and verified data."
              />
              <HeroBenefit
                icon={TrendingUp}
                title="Own something visible"
                body="Track ownership value and company growth."
              />
            </div>

            <div className="mt-14">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-ink-600">
                Trusted by founders, advisors & investors
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-5">
                {TRUSTED_BY.map((name) => (
                  <span
                    key={name}
                    className="text-3xl font-semibold tracking-tight text-ink-600"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Platform overview banner */}
          <div className="hidden xl:block relative">
            <div className="rounded-2xl border border-surface-200 bg-white shadow-lg overflow-hidden">
              <Image
                src="/images/blockid-hero-banner.png"
                alt="BlockID.au platform overview"
                width={1560}
                height={880}
                className="w-full h-auto"
                priority
              />
            </div>
            <p className="mt-2 text-center text-xs text-ink-500">Platform overview</p>
          </div>

          {/* Mobile banner */}
          <div className="xl:hidden">
            <div className="rounded-2xl border border-surface-200 bg-white shadow-lg overflow-hidden">
              <Image
                src="/images/blockid-hero-banner.png"
                alt="BlockID.au platform overview"
                width={1560}
                height={880}
                className="w-full h-auto"
                priority
              />
            </div>
            <p className="mt-2 text-center text-xs text-ink-500">Platform overview</p>
          </div>
        </div>

        {/* Five Pillars Strip */}
        <div className="mt-12 grid rounded-2xl border border-brand-200 bg-brand-50 backdrop-blur sm:grid-cols-2 md:grid-cols-5">
          {PILLARS.map((p, i) => {
            const Icon = p.icon;
            return (
              <div
                key={p.title}
                className={`flex items-center gap-4 p-6 md:flex-col md:items-center md:text-center md:p-7 ${
                  i < PILLARS.length - 1 ? "border-b sm:border-b-0 sm:border-r border-brand-200" : ""
                }`}
              >
                <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-brand-200 bg-white text-brand-600">
                  <Icon strokeWidth={1.75} className="h-6 w-6" />
                </span>
                <span className="md:mt-3">
                  <span className="block text-sm font-semibold text-brand-800">
                    {p.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-ink-700">
                    {p.sub}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HeroBenefit({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof Clock3;
  title: string;
  body: string;
}) {
  return (
    <div className="flex gap-4">
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-brand-200 bg-brand-50 text-brand-600">
        <Icon strokeWidth={1.75} className="h-6 w-6" />
      </span>
      <span>
        <span className="block text-base font-semibold text-brand-800">
          {title}
        </span>
        <span className="mt-2 block text-sm leading-relaxed text-ink-700">
          {body}
        </span>
      </span>
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="relative hidden min-h-[720px] min-w-0 overflow-hidden md:block xl:min-h-[860px]">
      <div className="absolute left-0 top-0 w-[min(980px,100%)] rounded-3xl border border-surface-200 bg-white shadow-lg">
        <div className="flex items-center justify-between border-b border-surface-200 px-7 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-brand-200 bg-brand-50 text-sm font-bold text-brand-600">
              B
            </span>
            <span className="text-lg font-semibold text-brand-800">
              BlockID<span className="text-gold-500">.au</span>
            </span>
          </div>
          <nav className="hidden items-center gap-8 text-xs font-medium text-ink-600 md:flex">
            <span className="border-b-4 border-brand-600 py-5 text-brand-700">
              Dashboard
            </span>
            <span>Score</span>
            <span>Data Room</span>
            <span>Ownership</span>
            <span>Cap Table</span>
            <span>Reports</span>
          </nav>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-surface-100 text-sm font-semibold text-ink-700">
            JS
          </span>
        </div>

        <div className="grid gap-6 p-6 lg:grid-cols-[1.1fr_0.95fr]">
          <ScorePanel />
          <BreakdownPanel />
          <InvestorPackPanel />
          <TermSheetPanel />
          <ProgressPanel />
          <ActivityPanel />
        </div>
      </div>

      <div className="absolute right-0 top-24 hidden w-[285px] rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-lg xl:block">
        <div className="flex gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <Check strokeWidth={2} className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-emerald-800">
              Proof Verified
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-ink-700">
              This report is tamper-evident and time-stamped.
            </span>
          </span>
        </div>
      </div>
    </div>
  );
}

function ScorePanel() {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm p-7">
      <h2 className="text-lg font-semibold text-brand-800">
        Investor-Ready Score
      </h2>
      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-center">
        <div className="relative h-44 w-44 shrink-0 rounded-full bg-[conic-gradient(#3B7DD8_0_86%,#e2e8f0_86%_100%)] p-3">
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
            <span className="font-mono text-5xl font-semibold text-brand-800">
              86
            </span>
            <span className="mt-1 text-lg text-ink-600">/100</span>
          </div>
        </div>
        <div>
          <p className="text-3xl font-semibold text-brand-800">Very Strong</p>
          <p className="mt-3 text-base text-ink-700">
            You&apos;re well-prepared to raise.
          </p>
          <Link
            href="/score"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-gold-500"
          >
            View score details
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="mt-8 flex items-center justify-between border-t border-surface-200 pt-5 text-xs text-ink-600">
        <span>Score Version 2.1</span>
        <span>Updated 2 hours ago</span>
        <span className="inline-flex items-center gap-1 text-brand-600">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          Verified
        </span>
      </div>
    </section>
  );
}

function BreakdownPanel() {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm p-7">
      <h2 className="text-lg font-semibold text-brand-800">
        Score Breakdown
      </h2>
      <div className="mt-7 space-y-5">
        {SCORE_ROWS.map(([label, value]) => (
          <div key={label as string}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-brand-700">{label}</span>
              <span className="font-mono text-ink-700">{value}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-surface-200">
              <div
                className="h-full rounded-full bg-brand-600"
                style={{ width: `${value}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function InvestorPackPanel() {
  const items = [
    [FileText, "Fundraising Report", "PDF"],
    [Link2, "Investor View Link", "Share"],
    [ShieldCheck, "Data Room Checklist", "24 items"],
    [QrCode, "Secure QR Code", "Share anywhere"],
  ];
  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm p-6">
      <h2 className="text-lg font-semibold text-brand-800">
        Investor Pack <span className="text-sm text-emerald-500">● Ready</span>
      </h2>
      <p className="mt-2 text-sm text-ink-700">
        Share your investor-ready link or download.
      </p>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {items.map(([Icon, label, sub]) => (
          <div
            key={label as string}
            className="rounded-xl border border-surface-200 bg-surface-100 p-4 text-center"
          >
            <Icon
              strokeWidth={1.75}
              className="mx-auto h-7 w-7 text-brand-600"
            />
            <p className="mt-3 text-xs font-semibold text-brand-700">
              {label as string}
            </p>
            <p className="mt-1 text-xs text-ink-600">{sub as string}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TermSheetPanel() {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-800">Term Sheet AI</h2>
        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-medium text-emerald-600">
          Low Risk
        </span>
      </div>
      <div className="mt-6 flex items-center gap-4">
        <FileText strokeWidth={1.75} className="h-8 w-8 text-brand-600" />
        <span className="text-sm font-semibold text-brand-700">
          SAFE (Post-money)
        </span>
      </div>
      <div className="mt-7 space-y-4 text-sm">
        <MetricLine label="Key terms extracted" value="12" />
        <MetricLine label="Red flags" value="2" />
      </div>
      <Link
        href="/tools/term-sheet"
        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-gold-500"
      >
        View analysis
        <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
      </Link>
    </section>
  );
}

function ProgressPanel() {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm p-7">
      <h2 className="text-lg font-semibold text-brand-800">
        Valuation Growth
      </h2>
      <div className="mt-8 h-36 rounded-xl bg-[linear-gradient(to_top,rgba(0,0,0,0.04)_1px,transparent_1px)] bg-[size:100%_25%]">
        <svg viewBox="0 0 420 140" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="heroChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3B7DD8" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#3B7DD8" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M10 118 L55 104 L95 88 L135 102 L175 82 L215 68 L255 72 L295 58 L335 36 L385 18"
            fill="none"
            stroke="#3B7DD8"
            strokeWidth="4"
            strokeLinecap="round"
          />
          <path
            d="M10 118 L55 104 L95 88 L135 102 L175 82 L215 68 L255 72 L295 58 L335 36 L385 18 L385 140 L10 140 Z"
            fill="url(#heroChartFill)"
          />
          {[10, 55, 95, 135, 175, 215, 255, 295, 335, 385].map((x, i) => (
            <circle
              key={x}
              cx={x}
              cy={[118, 104, 88, 102, 82, 68, 72, 58, 36, 18][i]}
              r="5"
              fill="#3B7DD8"
            />
          ))}
        </svg>
      </div>
    </section>
  );
}

function ActivityPanel() {
  return (
    <section className="rounded-2xl border border-surface-200 bg-white shadow-sm p-7">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-brand-800">
          Investor Activity
        </h2>
        <span className="text-sm font-semibold text-gold-500">View all</span>
      </div>
      <ul className="mt-6 space-y-5">
        {ACTIVITY.map(([name, action, time]) => (
          <li key={name} className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-emerald-100">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-brand-700">
                {name}
              </span>
              <span className="text-xs text-ink-600">{action}</span>
            </span>
            <span className="text-xs text-ink-600">{time}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-surface-200 pb-3">
      <span className="text-ink-700">{label}</span>
      <span className="font-mono font-semibold text-brand-700">{value}</span>
    </div>
  );
}
