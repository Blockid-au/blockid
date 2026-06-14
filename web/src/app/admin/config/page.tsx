import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import { getPlatformConfig, CONFIG_DEFAULTS } from "@/lib/platform-config";
import { PricingConfig } from "./pricing-config";
import { SviConfig } from "./svi-config";
import {
  ArrowLeft,
  Shield,
  Settings,
  Clock,
  BarChart3,
  Bot,
  DollarSign,
} from "lucide-react";

export const metadata: Metadata = {
  title: "System Config — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const RISK_PENALTIES = [
  { factor: "No revenue after 12 months", penalty: "-5 pts" },
  { factor: "Single founder, no team", penalty: "-3 pts" },
  { factor: "No IP protection filed", penalty: "-2 pts" },
  { factor: "Burn rate > 18 months runway", penalty: "-4 pts" },
  { factor: "Regulatory non-compliance", penalty: "-6 pts" },
];

const CRON_JOBS = [
  { name: "svi-snapshot", endpoint: "/api/cron/svi-snapshot", schedule: "Sunday 14:00 UTC", description: "Weekly SVI snapshot for all enrolled accounts" },
  { name: "svi-notify", endpoint: "/api/cron/svi-notify", schedule: "Daily 22:00 UTC", description: "Send SVI notification emails" },
  { name: "growth-insights", endpoint: "/api/cron/growth-insights", schedule: "Daily 20:00 UTC", description: "Generate AI growth insights" },
  { name: "publish-insight", endpoint: "/api/cron/publish-insight", schedule: "Daily 21:00 UTC", description: "Publish queued insights" },
];

export default async function ConfigPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/config");
  const platformConfig = await getPlatformConfig();

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) {
    return (
      <div className="min-h-svh bg-surface-100 flex items-center justify-center">
        <div className="text-center">
          <Shield className="mx-auto h-12 w-12 text-red-400 mb-4" />
          <h1 className="text-2xl font-bold text-ink-800 mb-2">Access Denied</h1>
          <Link href="/" className="text-brand-600 hover:text-brand-700 text-sm">&larr; Back to home</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-surface-100 text-ink-800">
      <header className="border-b border-surface-200 px-6 py-4 flex items-center justify-between max-w-4xl mx-auto">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="text-ink-600 hover:text-ink-800 transition-colors">
            <ArrowLeft strokeWidth={1.75} className="h-4 w-4" />
          </Link>
          <Logo variant="light" />
          <span className="text-xs font-medium text-amber-600 bg-amber-500/10 border border-amber-500/20 rounded px-2 py-0.5">
            CONFIG
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* Pricing & Platform Config */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <DollarSign className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold">Pricing & Platform Config</h2>
            <span className="text-xs text-ink-400 ml-auto">Changes live within 60s · no redeploy needed</span>
          </div>
          <PricingConfig initial={platformConfig} defaults={CONFIG_DEFAULTS} />
        </section>

        {/* SVI Engine Config — editable weights, credit costs, referrals */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold">SVI Engine & Credits</h2>
            <span className="text-xs text-ink-400 ml-auto">Changes live within 60s · no redeploy needed</span>
          </div>
          <SviConfig initial={{
            svi_weights: platformConfig.svi_weights,
            credit_cost_svi_analysis: platformConfig.credit_cost_svi_analysis,
            credit_cost_term_sheet: platformConfig.credit_cost_term_sheet,
            credit_cost_rnd_report: platformConfig.credit_cost_rnd_report,
            credit_cost_evidence_analyze: platformConfig.credit_cost_evidence_analyze,
            growth_plan_credits_monthly: platformConfig.growth_plan_credits_monthly,
            referral_credits: platformConfig.referral_credits,
            linkedin_post_enabled: platformConfig.linkedin_post_enabled,
          }} />
        </section>

        {/* Stage Thresholds — read-only display, driven from platformConfig */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Stage Thresholds</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {platformConfig.stage_thresholds.map((s) => (
              <div key={s.stage} className="bg-white border border-surface-200 rounded-lg p-4 text-center">
                <p className="text-xs text-ink-500 mb-1 font-mono">{s.min} – {s.max}</p>
                <span className={`inline-block text-xs font-medium rounded-full px-3 py-1 ${s.color}`}>
                  {s.stage}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Risk Penalties */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-amber-500" />
            <h2 className="text-lg font-semibold">Risk Penalties</h2>
          </div>
          <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="text-left px-4 py-2.5 font-medium text-ink-600">Risk Factor</th>
                  <th className="text-right px-4 py-2.5 font-medium text-ink-600">Penalty</th>
                </tr>
              </thead>
              <tbody>
                {RISK_PENALTIES.map((r) => (
                  <tr key={r.factor} className="border-b border-surface-100 last:border-0">
                    <td className="px-4 py-2.5">{r.factor}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-red-600 text-xs">{r.penalty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* AI Provider Config */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Bot className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold">AI Provider Config</h2>
          </div>
          <div className="bg-white border border-surface-200 rounded-lg p-4">
            <p className="text-sm text-ink-600 mb-3">
              Manage API keys and AI provider settings for SVI analysis and growth insights.
            </p>
            <Link
              href="/admin/ai-keys"
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700 transition-colors"
            >
              <Settings className="h-4 w-4" />
              Manage AI Keys &rarr;
            </Link>
          </div>
        </section>

        {/* Cron Jobs */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Cron Jobs</h2>
          </div>
          <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="text-left px-4 py-2.5 font-medium text-ink-600">Job</th>
                  <th className="text-left px-4 py-2.5 font-medium text-ink-600">Endpoint</th>
                  <th className="text-left px-4 py-2.5 font-medium text-ink-600">Schedule</th>
                </tr>
              </thead>
              <tbody>
                {CRON_JOBS.map((job) => (
                  <tr key={job.name} className="border-b border-surface-100 last:border-0">
                    <td className="px-4 py-2.5">
                      <p className="font-medium">{job.name}</p>
                      <p className="text-xs text-ink-500">{job.description}</p>
                    </td>
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-500">{job.endpoint}</td>
                    <td className="px-4 py-2.5 text-xs whitespace-nowrap">{job.schedule}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
