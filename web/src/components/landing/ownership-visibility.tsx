import { PieChart, Shield, TrendingUp } from "lucide-react";

const PIE_SEGMENTS = [
  { label: "Founder", pct: 60, color: "#3B7DD8" },
  { label: "Co-founder", pct: 25, color: "#5B9AEB" },
  { label: "ESOP", pct: 15, color: "#334155" },
];

export function OwnershipVisibility() {
  return (
    <section className="bg-surface-50 py-24 md:py-32">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Text */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gold-500">
              Ownership intelligence
            </p>
            <h2 className="mt-4 text-3xl font-semibold tracking-tight text-brand-900 md:text-4xl">
              See what you own. Watch it grow.
            </h2>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600">
              Every founder and co-founder sees their ownership percentage,
              share value and equity growth in real time. Not a spreadsheet
              buried in email&nbsp;&mdash; a living dashboard.
            </p>
          </div>

          {/* Visual mock */}
          <div className="rounded-2xl border border-surface-300 bg-surface-50 dark:bg-surface-100 p-8 shadow-sm">
            <div className="flex items-start gap-8">
              {/* Pie chart */}
              <div className="shrink-0">
                <svg viewBox="0 0 120 120" className="h-32 w-32">
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#334155"
                    strokeWidth="20"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#5B9AEB"
                    strokeWidth="20"
                    strokeDasharray={`${(60 + 25) * 3.14} ${(15) * 3.14}`}
                    strokeDashoffset="0"
                    transform="rotate(-90 60 60)"
                  />
                  <circle
                    cx="60"
                    cy="60"
                    r="50"
                    fill="none"
                    stroke="#3B7DD8"
                    strokeWidth="20"
                    strokeDasharray={`${60 * 3.14} ${40 * 3.14}`}
                    strokeDashoffset="0"
                    transform="rotate(-90 60 60)"
                  />
                </svg>
                <div className="mt-4 space-y-2">
                  {PIE_SEGMENTS.map((s) => (
                    <div key={s.label} className="flex items-center gap-2 text-xs">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: s.color }}
                      />
                      <span className="text-slate-600">{s.label}</span>
                      <span className="ml-auto font-mono font-semibold text-slate-700">
                        {s.pct}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="flex-1 space-y-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                    Estimated equity value
                  </p>
                  <p className="mt-1 font-mono text-4xl font-semibold text-brand-900">
                    $1.2M
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-600">
                    <TrendingUp strokeWidth={2} className="h-3 w-3" />
                    +18% this quarter
                  </span>
                </div>

                <div className="space-y-3 border-t border-surface-300 pt-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Your shares</span>
                    <span className="font-mono font-semibold text-brand-900">
                      600,000
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-600">Share price</span>
                    <span className="font-mono font-semibold text-brand-900">
                      $2.00
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature cards */}
        <div className="mt-16 grid gap-6 md:grid-cols-3">
          <FeatureCard
            icon={PieChart}
            title="Ownership clarity"
            body="See your % ownership, share count and estimated value at a glance."
          />
          <FeatureCard
            icon={TrendingUp}
            title="Growth tracking"
            body="Watch your equity value change as the company grows and raises."
          />
          <FeatureCard
            icon={Shield}
            title="Dilution visibility"
            body="Model any funding round and see the impact on your stake before it happens."
          />
        </div>
      </div>
    </section>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof PieChart;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-surface-300 bg-surface-50 dark:bg-surface-100 p-8 shadow-sm">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl border border-brand-200 bg-brand-50 text-brand-500">
        <Icon strokeWidth={1.75} className="h-6 w-6" />
      </span>
      <h3 className="mt-5 text-lg font-semibold text-brand-900">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{body}</p>
    </div>
  );
}
