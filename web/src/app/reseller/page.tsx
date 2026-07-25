// Reseller dashboard (`/reseller`) — KPI cards + portfolio aggregates.
//
// Per docs/plans/reseller-module-plan.md § C.1.1 + § U.15.3. Reads via the
// typed resellerSupabase() wrapper (D3-CISO-01) and passes rows to the pure
// portfolio-aggregates helpers so k>=5 anonymity + ISO-week quantisation are
// enforced in one place. Signup timeline and SVI-band charts here never
// expose day-precision or sub-K bucket counts.

import { getCurrentUser } from "@/lib/auth";
import { scopedReseller, ResellerScopeError } from "@/lib/reseller/scope";
import { resellerSupabase } from "@/lib/reseller/supabase";
import {
  applyComplementarySuppression,
  buildPortfolioSummary,
  buildSignupWeekly,
  buildSviBands,
  type KAnonBucket,
} from "@/lib/reseller/portfolio-aggregates";
import { buildPhaseDistribution } from "@/lib/reseller/portfolio-phase-distribution";
import { buildReviewsSummary } from "@/lib/reseller/reviews";
import { RoleLandingIntro } from "@/components/role/role-landing-intro";

export const dynamic = "force-dynamic";

interface Kpi {
  label: string;
  value: string;
  hint?: string;
}

function formatKAnon(b: KAnonBucket): string {
  return b.suppressed ? "<5" : String(b.count);
}

export default async function ResellerDashboardPage() {
  const user = await getCurrentUser();
  if (!user) {
    return <p className="text-sm text-red-600">Not signed in.</p>;
  }

  let scope;
  try {
    scope = await scopedReseller(user);
  } catch (err) {
    if (err instanceof ResellerScopeError) {
      return (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4 text-sm text-yellow-900">
          <p className="font-medium">No reseller membership</p>
          <p>Your account is not linked to any reseller organisation.</p>
        </div>
      );
    }
    throw err;
  }

  const db = resellerSupabase(scope);
  const [reseller, customers, promoCodes, sviRaw, reviewRows] = await Promise.all([
    db.selfReseller(),
    db.attributedCustomers(),
    db.promotionCodes(),
    db.portfolioSviRaw(),
    db.showcaseReviewsAggregate(),
  ]);

  const activeCodes = promoCodes.filter((c) => c.active).length;
  const summary = buildPortfolioSummary({ customers, now: new Date() });
  const weekly = applyComplementarySuppression(buildSignupWeekly(customers));
  const bands = applyComplementarySuppression(buildSviBands(sviRaw));
  const phaseDist = buildPhaseDistribution({
    customers: customers.map((c) => ({ user_id: c.user_id })),
    svi: sviRaw,
  });
  const reviewsSummary = buildReviewsSummary(reviewRows);
  const weeklyMax = Math.max(1, ...weekly.map((w) => w.count ?? 0));
  const bandsMax = Math.max(1, ...bands.map((b) => b.count ?? 0));
  const phaseMax = Math.max(1, ...phaseDist.map((p) => p.count ?? 0));

  const kpis: Kpi[] = [
    {
      label: "Attributed customers",
      value: formatKAnon(summary.attributed_total),
      hint: "k>=5 anonymity applied",
    },
    {
      label: "Active last 7 days",
      value: formatKAnon(summary.active_last_week),
      hint: "By last login timestamp",
    },
    {
      label: "Active promotion codes",
      value: `${activeCodes} / ${promoCodes.length}`,
      hint: "See /reseller/codes",
    },
    {
      label: "Billing model",
      value: reseller?.billing_model ?? "—",
      hint: reseller?.billing_model === "wholesale"
        ? "You subscribe on behalf of each startup"
        : "Startups pay; you earn commission",
    },
  ];

  return (
    <>
      <div className="mb-6">
        <RoleLandingIntro role="reseller" />
      </div>

      <section className="mb-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((k) => (
            <div
              key={k.label}
              className="rounded-lg border border-surface-200 bg-white p-4 shadow-sm"
            >
              <p className="text-xs font-medium uppercase tracking-wide text-ink-500">
                {k.label}
              </p>
              <p className="mt-1 text-2xl font-semibold text-ink-900">{k.value}</p>
              {k.hint && <p className="mt-1 text-xs text-ink-500">{k.hint}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="mb-6 rounded-lg border border-surface-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Signups by ISO week</h2>
          <p className="text-xs text-ink-500">
            Buckets under 5 shown as <span className="font-mono">&lt;5</span>; day precision never rendered.
          </p>
        </div>
        {weekly.length === 0 ? (
          <p className="mt-3 text-sm text-ink-600">No attributed signups yet.</p>
        ) : (
          <ul className="mt-3 space-y-1 text-sm text-ink-700">
            {weekly.map((w) => (
              <li key={w.iso_week} className="flex items-center gap-3">
                <span className="w-24 font-mono text-xs text-ink-500">{w.iso_week}</span>
                <span className="w-10 text-right tabular-nums">
                  {w.suppressed ? "<5" : w.count}
                </span>
                <span
                  aria-hidden="true"
                  className={`h-2 rounded ${w.suppressed ? "bg-surface-300" : "bg-brand-500"}`}
                  style={{
                    width: `${Math.max(4, Math.round(((w.count ?? 0) / weeklyMax) * 240))}px`,
                  }}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-6 rounded-lg border border-surface-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-900">SVI score distribution</h2>
          <p className="text-xs text-ink-500">Latest score per project</p>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-700">
          {bands.map((b) => (
            <li key={b.band} className="flex items-center gap-3">
              <span className="w-16 font-mono text-xs text-ink-500">{b.band}</span>
              <span className="w-10 text-right tabular-nums">
                {b.suppressed ? "<5" : b.count}
              </span>
              <span
                aria-hidden="true"
                className={`h-2 rounded ${b.suppressed ? "bg-surface-300" : "bg-brand-500"}`}
                style={{
                  width: `${Math.max(4, Math.round(((b.count ?? 0) / bandsMax) * 240))}px`,
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6 rounded-lg border border-surface-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Phase distribution</h2>
          <p className="text-xs text-ink-500">
            12-phase startup journey — same taxonomy as{" "}
            <a href="/guide/01-vision" className="text-brand-700 underline">guide chapters</a>
          </p>
        </div>
        <ul className="mt-3 space-y-1 text-sm text-ink-700">
          {phaseDist.map((p) => (
            <li key={p.phase} className="flex items-center gap-3">
              <span className="w-8 font-mono text-xs text-ink-500">P{p.phase}</span>
              <span className="w-40 truncate text-xs text-ink-700">{p.label.en}</span>
              <span className="w-10 text-right tabular-nums">
                {p.suppressed ? "<5" : p.count}
              </span>
              <span
                aria-hidden="true"
                className={`h-2 rounded ${p.suppressed ? "bg-surface-300" : "bg-brand-500"}`}
                style={{
                  width: `${Math.max(4, Math.round(((p.count ?? 0) / phaseMax) * 200))}px`,
                }}
              />
            </li>
          ))}
        </ul>
      </section>

      <section className="mb-6 rounded-lg border border-surface-200 bg-white p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-ink-900">Investor reviews</h2>
          <p className="text-xs text-ink-500">
            Aggregate only — review content stays inside the founder&apos;s workspace (U.9 §5)
          </p>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Reviews received
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-ink-900">
              {formatKAnon(reviewsSummary.total_reviews)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Projects with reviews
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-ink-900">
              {formatKAnon(reviewsSummary.projects_with_reviews)}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-ink-500">
              Average rating (1-5)
            </dt>
            <dd className="mt-1 text-2xl font-semibold text-ink-900">
              {reviewsSummary.avg_rating == null ? "—" : reviewsSummary.avg_rating.toFixed(1)}
            </dd>
          </div>
        </dl>
      </section>

      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <h2 className="text-lg font-semibold text-ink-900">Portfolio detail</h2>
        <p className="mt-2 text-sm text-ink-600">
          Use{" "}
          <a href="/reseller/customers" className="text-brand-700 underline">
            /reseller/customers
          </a>{" "}
          to open the per-customer drawer (Overview / Progression / Reports).
          Aggregates on this page follow the U.15.3 k&gt;=5 anonymity + ISO-week
          quantisation rules; per-customer detail is gated by the reveal-email
          chokepoint (P4.1) and audit-logged on every read.
        </p>
      </section>
    </>
  );
}
