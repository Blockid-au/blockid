import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  Check,
  Clock3,
  FileText,
  Link2,
  LockKeyhole,
  Play,
  QrCode,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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

export function Hero() {
  return (
    <section className="relative max-w-[100vw] overflow-hidden bg-[#f7f8ff] pt-32 md:pt-36 pb-8 text-[#07122f]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_16%,rgba(72,64,245,0.12),transparent_34%),linear-gradient(180deg,#ffffff_0%,#f7f8ff_72%,#eef2ff_100%)]"
      />
      <div className="relative mx-auto max-w-[1800px] px-6 lg:px-12">
        <div className="grid min-w-0 items-center gap-10 xl:grid-cols-[0.88fr_1.12fr]">
          <div className="w-full min-w-0 max-w-[calc(100vw-3rem)] sm:max-w-[760px]">
            <p className="inline-flex items-center gap-2 rounded-xl border border-[#dedcff] bg-white/75 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-[#3328e8] shadow-[0_10px_30px_rgba(50,40,220,0.08)]">
              <Sparkles strokeWidth={1.75} className="h-4 w-4" />
              AI-powered fundraising intelligence
            </p>

            <h1 className="mt-8 font-semibold leading-[0.98] tracking-tight text-[#07122f]">
              <span className="block text-[clamp(2.5rem,10.5vw,3rem)] sm:hidden">
                The trust layer
                <br />
                for
                <br />
                <span className="bg-gradient-to-r from-[#4a35f5] via-[#3527ee] to-[#6058ff] bg-clip-text text-transparent">
                  fundraising.
                </span>
              </span>
              <span className="hidden text-[clamp(3.6rem,8vw,7.25rem)] sm:block">
                The trust layer
                <br />
                for{" "}
                <span className="bg-gradient-to-r from-[#4a35f5] via-[#3527ee] to-[#6058ff] bg-clip-text text-transparent">
                  fundraising.
                </span>
              </span>
            </h1>

            <p className="mt-7 max-w-2xl text-xl leading-relaxed text-[#4a5572] md:text-2xl">
              AI-powered investor readiness, proof-backed diligence, and
              fundraising intelligence for Australian startups.
            </p>

            <div className="mt-10 flex flex-col gap-4 sm:flex-row">
              <Link href="/score">
                <Button
                  variant="primary"
                  size="lg"
                  className="h-16 w-full rounded-xl bg-[#3b2ff4] px-4 text-sm text-white shadow-[0_18px_48px_rgba(59,47,244,0.28)] hover:bg-[#2f25d7] sm:w-auto sm:px-9 sm:text-base"
                >
                  Get your Investor-Ready Score
                  <ArrowRight strokeWidth={1.75} className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="/tools/data-room">
                <Button
                  variant="secondary"
                  size="lg"
                  className="h-16 w-full rounded-xl border-[#dfe4f2] bg-white px-9 text-base text-[#07122f] shadow-[0_12px_32px_rgba(15,23,42,0.06)] hover:bg-[#f7f8ff] sm:w-auto"
                >
                  <Play strokeWidth={1.75} className="h-5 w-5 fill-[#3b2ff4] text-[#3b2ff4]" />
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
                icon={BarChart3}
                title="Raise with confidence"
                body="Know what investors care about before they ask."
              />
            </div>

            <div className="mt-14">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#4f5a76]">
                Trusted by founders, advisors & investors
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-x-10 gap-y-5">
                {TRUSTED_BY.map((name) => (
                  <span
                    key={name}
                    className="text-3xl font-semibold tracking-tight text-[#26314f]"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <DashboardMock />
        </div>

        <div className="mt-12 grid rounded-2xl border border-[#dfe4f2] bg-white/75 shadow-[0_18px_48px_rgba(15,23,42,0.06)] backdrop-blur md:grid-cols-4">
          <BottomTrust
            icon={LockKeyhole}
            title="Secure by design"
            body="Enterprise-grade security and privacy."
          />
          <BottomTrust
            icon={TrendingUp}
            title="Built for Australia"
            body="Local compliance, local support."
          />
          <BottomTrust
            icon={FileText}
            title="Investor trusted"
            body="Used by founders, advisors and investors."
          />
          <BottomTrust
            icon={ShieldCheck}
            title="Tamper-evident"
            body="Immutable records. Always verifiable."
          />
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
      <span className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-[#3b2ff4]/30 bg-white text-[#3b2ff4]">
        <Icon strokeWidth={1.75} className="h-6 w-6" />
      </span>
      <span>
        <span className="block text-base font-semibold text-[#07122f]">
          {title}
        </span>
        <span className="mt-2 block text-sm leading-relaxed text-[#4f5a76]">
          {body}
        </span>
      </span>
    </div>
  );
}

function DashboardMock() {
  return (
    <div className="relative hidden min-h-[720px] min-w-0 overflow-hidden md:block xl:min-h-[860px]">
      <div className="absolute left-0 top-0 w-[min(980px,100%)] rounded-3xl border border-[#dfe4f2] bg-white shadow-[0_30px_90px_rgba(30,41,80,0.14)]">
        <div className="flex items-center justify-between border-b border-[#edf0f7] px-7 py-5">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#3b2ff4]/25 bg-[#f3f2ff] text-sm font-bold text-[#3b2ff4]">
              B
            </span>
            <span className="text-lg font-semibold text-[#07122f]">
              BlockID.au
            </span>
          </div>
          <nav className="hidden items-center gap-8 text-xs font-medium text-[#394260] md:flex">
            <span className="border-b-4 border-[#3b2ff4] py-5 text-[#07122f]">
              Dashboard
            </span>
            <span>Score</span>
            <span>Data Room</span>
            <span>Term Sheet AI</span>
            <span>Cap Table</span>
            <span>Reports</span>
          </nav>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[#f0f2f8] text-sm font-semibold text-[#1e2743]">
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

      <div className="absolute right-0 top-24 hidden w-[285px] rounded-2xl border border-[#dff4e8] bg-[#f5fff9] p-6 shadow-[0_24px_64px_rgba(22,163,74,0.12)] xl:block">
        <div className="flex gap-4">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-[#dffbea] text-[#16a34a]">
            <Check strokeWidth={2} className="h-6 w-6" />
          </span>
          <span>
            <span className="block text-sm font-semibold text-[#07122f]">
              Proof Verified
            </span>
            <span className="mt-2 block text-sm leading-relaxed text-[#42506d]">
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
    <section className="rounded-2xl border border-[#edf0f7] bg-white p-7 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <h2 className="text-lg font-semibold text-[#07122f]">
        Investor-Ready Score™
      </h2>
      <div className="mt-8 flex flex-col gap-8 md:flex-row md:items-center">
        <div className="relative h-44 w-44 shrink-0 rounded-full bg-[conic-gradient(#3b2ff4_0_86%,#e4e7f2_86%_100%)] p-3">
          <div className="flex h-full w-full flex-col items-center justify-center rounded-full bg-white">
            <span className="font-mono text-5xl font-semibold text-[#07122f]">
              86
            </span>
            <span className="mt-1 text-lg text-[#4f5a76]">/100</span>
          </div>
        </div>
        <div>
          <p className="text-3xl font-semibold text-[#07122f]">Very Strong</p>
          <p className="mt-3 text-base text-[#4f5a76]">
            You&apos;re well-prepared to raise.
          </p>
          <Link
            href="/score"
            className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[#3b2ff4]"
          >
            View score details
            <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
          </Link>
        </div>
      </div>
      <div className="mt-8 flex items-center justify-between border-t border-[#edf0f7] pt-5 text-xs text-[#4f5a76]">
        <span>Score Version 2.1</span>
        <span>Updated 2 hours ago</span>
        <span className="inline-flex items-center gap-1 text-[#3b2ff4]">
          <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
          Verified
        </span>
      </div>
    </section>
  );
}

function BreakdownPanel() {
  return (
    <section className="rounded-2xl border border-[#edf0f7] bg-white p-7 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <h2 className="text-lg font-semibold text-[#07122f]">
        Score Breakdown
      </h2>
      <div className="mt-7 space-y-5">
        {SCORE_ROWS.map(([label, value]) => (
          <div key={label as string}>
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-[#07122f]">{label}</span>
              <span className="font-mono text-[#26314f]">{value}%</span>
            </div>
            <div className="mt-2 h-1.5 rounded-full bg-[#e4e7f2]">
              <div
                className="h-full rounded-full bg-[#3b2ff4]"
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
    <section className="rounded-2xl border border-[#edf0f7] bg-white p-6 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <h2 className="text-lg font-semibold text-[#07122f]">
        Investor Pack <span className="text-sm text-[#16a34a]">● Ready</span>
      </h2>
      <p className="mt-2 text-sm text-[#4f5a76]">
        Share your investor-ready link or download.
      </p>
      <div className="mt-5 grid grid-cols-4 gap-3">
        {items.map(([Icon, label, sub]) => (
          <div
            key={label as string}
            className="rounded-xl border border-[#edf0f7] bg-[#fbfcff] p-4 text-center"
          >
            <Icon
              strokeWidth={1.75}
              className="mx-auto h-7 w-7 text-[#3b2ff4]"
            />
            <p className="mt-3 text-xs font-semibold text-[#07122f]">
              {label as string}
            </p>
            <p className="mt-1 text-xs text-[#4f5a76]">{sub as string}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function TermSheetPanel() {
  return (
    <section className="rounded-2xl border border-[#edf0f7] bg-white p-7 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#07122f]">Term Sheet AI</h2>
        <span className="rounded-full bg-[#e9fff1] px-3 py-1 text-xs font-medium text-[#16a34a]">
          Low Risk
        </span>
      </div>
      <div className="mt-6 flex items-center gap-4">
        <FileText strokeWidth={1.75} className="h-8 w-8 text-[#3b2ff4]" />
        <span className="text-sm font-semibold text-[#07122f]">
          SAFE (Post-money)
        </span>
      </div>
      <div className="mt-7 space-y-4 text-sm">
        <MetricLine label="Key terms extracted" value="12" />
        <MetricLine label="Red flags" value="2" />
      </div>
      <Link
        href="/tools/term-sheet"
        className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[#3b2ff4]"
      >
        View analysis
        <ArrowRight strokeWidth={1.75} className="h-4 w-4" />
      </Link>
    </section>
  );
}

function ProgressPanel() {
  return (
    <section className="rounded-2xl border border-[#edf0f7] bg-white p-7 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <h2 className="text-lg font-semibold text-[#07122f]">
        Fundraising Progress
      </h2>
      <div className="mt-8 h-36 rounded-xl bg-[linear-gradient(to_top,#eef0ff_1px,transparent_1px)] bg-[size:100%_25%]">
        <svg viewBox="0 0 420 140" className="h-full w-full overflow-visible">
          <defs>
            <linearGradient id="heroChartFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b2ff4" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#3b2ff4" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d="M10 118 L55 104 L95 88 L135 102 L175 82 L215 68 L255 72 L295 58 L335 36 L385 18"
            fill="none"
            stroke="#3b2ff4"
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
              fill="#3b2ff4"
            />
          ))}
        </svg>
      </div>
    </section>
  );
}

function ActivityPanel() {
  return (
    <section className="rounded-2xl border border-[#edf0f7] bg-white p-7 shadow-[0_12px_36px_rgba(15,23,42,0.05)]">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#07122f]">
          Investor Activity
        </h2>
        <span className="text-sm font-semibold text-[#3b2ff4]">View all</span>
      </div>
      <ul className="mt-6 space-y-5">
        {ACTIVITY.map(([name, action, time]) => (
          <li key={name} className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-[#edfdf3]">
              <span className="h-2.5 w-2.5 rounded-full bg-[#22c55e]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-[#07122f]">
                {name}
              </span>
              <span className="text-xs text-[#4f5a76]">{action}</span>
            </span>
            <span className="text-xs text-[#4f5a76]">{time}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function MetricLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#edf0f7] pb-3">
      <span className="text-[#4f5a76]">{label}</span>
      <span className="font-mono font-semibold text-[#07122f]">{value}</span>
    </div>
  );
}

function BottomTrust({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof LockKeyhole;
  title: string;
  body: string;
}) {
  return (
    <div className="flex items-center gap-5 border-[#dfe4f2] p-7 md:border-r last:border-r-0">
      <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#3b2ff4]/25 bg-white text-[#3b2ff4]">
        <Icon strokeWidth={1.75} className="h-6 w-6" />
      </span>
      <span>
        <span className="block font-semibold text-[#07122f]">{title}</span>
        <span className="mt-1 block text-sm leading-relaxed text-[#4f5a76]">
          {body}
        </span>
      </span>
    </div>
  );
}
