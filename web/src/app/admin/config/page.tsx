import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { Logo } from "@/components/brand/logo";
import {
  ArrowLeft,
  Shield,
  Settings,
  Clock,
  AlertTriangle,
  BarChart3,
  Bot,
  Layers,
} from "lucide-react";

export const metadata: Metadata = {
  title: "System Config — Admin | BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const SVI_WEIGHTS = [
  { key: "ftv", label: "Founder-Team Viability", weight: 15 },
  { key: "mpc", label: "Market & Problem Clarity", weight: 18 },
  { key: "ptd", label: "Product & Tech Depth", weight: 12 },
  { key: "tre", label: "Traction & Revenue Evidence", weight: 20 },
  { key: "cgh", label: "Capital & Growth Health", weight: 12 },
  { key: "iri", label: "IP, Risk & Industry", weight: 10 },
  { key: "lco", label: "Legal & Compliance", weight: 8 },
  { key: "svm", label: "SVI Momentum", weight: 5 },
];

const RISK_PENALTIES = [
  { factor: "No revenue after 12 months", penalty: "-5 pts" },
  { factor: "Single founder, no team", penalty: "-3 pts" },
  { factor: "No IP protection filed", penalty: "-2 pts" },
  { factor: "Burn rate > 18 months runway", penalty: "-4 pts" },
  { factor: "Regulatory non-compliance", penalty: "-6 pts" },
];

const STAGE_THRESHOLDS = [
  { range: "0 - 20", stage: "Pre-Idea", color: "bg-gray-200 text-gray-700" },
  { range: "20 - 40", stage: "Idea", color: "bg-red-100 text-red-700" },
  { range: "40 - 60", stage: "Validation", color: "bg-amber-100 text-amber-700" },
  { range: "60 - 75", stage: "Early Traction", color: "bg-yellow-100 text-yellow-700" },
  { range: "75 - 90", stage: "Growth", color: "bg-emerald-100 text-emerald-700" },
  { range: "90 - 100", stage: "Scale", color: "bg-brand-100 text-brand-700" },
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

  const isAdmin = user.email === "admin@blockid.au" || user.role === "admin";
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
        {/* SVI Weights */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="h-5 w-5 text-brand-600" />
            <h2 className="text-lg font-semibold">SVI Dimension Weights</h2>
          </div>
          <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-surface-50 border-b border-surface-200">
                  <th className="text-left px-4 py-2.5 font-medium text-ink-600">Key</th>
                  <th className="text-left px-4 py-2.5 font-medium text-ink-600">Dimension</th>
                  <th className="text-right px-4 py-2.5 font-medium text-ink-600">Weight</th>
                </tr>
              </thead>
              <tbody>
                {SVI_WEIGHTS.map((d) => (
                  <tr key={d.key} className="border-b border-surface-100 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs text-ink-500">{d.key}</td>
                    <td className="px-4 py-2.5">{d.label}</td>
                    <td className="px-4 py-2.5 text-right font-medium">{d.weight}%</td>
                  </tr>
                ))}
                <tr className="bg-surface-50 border-t border-surface-200">
                  <td className="px-4 py-2.5" />
                  <td className="px-4 py-2.5 font-medium">Total</td>
                  <td className="px-4 py-2.5 text-right font-bold">
                    {SVI_WEIGHTS.reduce((s, d) => s + d.weight, 0)}%
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Risk Penalties */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
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

        {/* Stage Thresholds */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Layers className="h-5 w-5 text-emerald-600" />
            <h2 className="text-lg font-semibold">Stage Thresholds</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {STAGE_THRESHOLDS.map((s) => (
              <div key={s.stage} className="bg-white border border-surface-200 rounded-lg p-4 text-center">
                <p className="text-xs text-ink-500 mb-1 font-mono">{s.range}</p>
                <span className={`inline-block text-xs font-medium rounded-full px-3 py-1 ${s.color}`}>
                  {s.stage}
                </span>
              </div>
            ))}
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
