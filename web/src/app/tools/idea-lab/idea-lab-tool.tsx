"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  Compass,
  Loader2,
  Lightbulb,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

// ── Types (mirror server response) ─────────────────────────────────────

type Audience = "consumer" | "smb" | "enterprise" | "any";

interface StartupAngle {
  title: string;
  oneLiner: string;
  targetCustomer: string;
  monetisation: string;
  effortLevel: "low" | "medium" | "high";
}

interface NonObviousOpportunity {
  title: string;
  whyOverlooked: string;
  hookForFounder: string;
}

interface CompetitorNote {
  name: string;
  whatTheyDo: string;
  angle: string;
}

interface IdeaLabResponse {
  ok: true;
  sector: string;
  sectorLabel: string;
  angles: StartupAngle[];
  nonObvious: NonObviousOpportunity[];
  competitors: CompetitorNote[];
  generatedAt: string;
  source: "ai" | "seed";
  disclaimer: string;
  creditsCharged?: number;
}

interface ErrorResponse {
  ok: false;
  error: string;
  creditsRequired?: number;
  balance?: number;
  retryInSeconds?: number;
}

// Sector list — mirrors SECTOR_LABELS from svi-analysis.ts. Kept in sync
// manually because we can't import server-only modules into a client component.
const SECTORS: Array<{ key: string; label: string }> = [
  { key: "saas", label: "SaaS / Software" },
  { key: "fintech", label: "FinTech" },
  { key: "healthtech", label: "HealthTech / MedTech" },
  { key: "edtech", label: "EdTech / Learning" },
  { key: "deeptech", label: "DeepTech / Hardware" },
  { key: "marketplace", label: "Marketplace / Platform" },
  { key: "ecommerce", label: "eCommerce / D2C" },
  { key: "legaltech", label: "LegalTech" },
  { key: "proptech", label: "PropTech / Real Estate" },
  { key: "hrtech", label: "HRTech / Future of Work" },
  { key: "insurtech", label: "InsurTech" },
  { key: "agtech", label: "AgTech / FoodTech" },
  { key: "cleantech", label: "CleanTech / ClimateTech" },
  { key: "logisticstech", label: "LogisticsTech / Supply Chain" },
  { key: "retailtech", label: "RetailTech / POS" },
  { key: "govtech", label: "GovTech / CivicTech" },
  { key: "sportstech", label: "SportsTech / FitnessTech" },
  { key: "traveltech", label: "TravelTech / HospitalityTech" },
  { key: "mediatech", label: "MediaTech / CreatorTech" },
  { key: "cybertech", label: "CyberSecurity" },
  { key: "biotech", label: "BioTech / LifeSciences" },
  { key: "spacetech", label: "SpaceTech" },
  { key: "constructiontech", label: "ConstructionTech" },
  { key: "wealthtech", label: "WealthTech / InvestTech" },
  { key: "gaming", label: "Gaming / Interactive" },
];

const AUDIENCES: Array<{ key: Audience; label: string }> = [
  { key: "any", label: "Any" },
  { key: "consumer", label: "Consumer" },
  { key: "smb", label: "SMB" },
  { key: "enterprise", label: "Enterprise" },
];

const EFFORT_STYLE: Record<StartupAngle["effortLevel"], string> = {
  low: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  high: "bg-rose-100 text-rose-800",
};

export function IdeaLabTool() {
  const [sector, setSector] = React.useState<string>("saas");
  const [problemArea, setProblemArea] = React.useState<string>("");
  const [audience, setAudience] = React.useState<Audience>("any");
  const [loading, setLoading] = React.useState<boolean>(false);
  const [result, setResult] = React.useState<IdeaLabResponse | null>(null);
  const [error, setError] = React.useState<string>("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sector) {
      setError("Please pick a sector.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/idea-lab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sector,
          problemArea: problemArea.trim(),
          audience,
        }),
      });
      const data = (await res.json()) as IdeaLabResponse | ErrorResponse;
      if (!res.ok || data.ok !== true) {
        const errData = data as ErrorResponse;
        setError(errData.error ?? "Something went wrong — please retry.");
        return;
      }
      setResult(data);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-5 md:grid-cols-[2fr_1fr]">
          <div>
            <label
              htmlFor="sector"
              className="flex items-center gap-2 text-sm font-medium text-ink-900"
            >
              <Compass className="h-4 w-4 text-gold-600" />
              Sector
            </label>
            <select
              id="sector"
              value={sector}
              onChange={(e) => setSector(e.target.value)}
              className="mt-2 h-11 w-full rounded-lg border border-surface-300 bg-white px-3 text-sm text-ink-800 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
            >
              {SECTORS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium text-ink-900">Audience</label>
            <div
              role="radiogroup"
              aria-label="Audience preference"
              className="mt-2 grid grid-cols-4 gap-1 rounded-lg border border-surface-300 bg-surface-50 p-1"
            >
              {AUDIENCES.map((a) => {
                const active = audience === a.key;
                return (
                  <button
                    key={a.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => setAudience(a.key)}
                    className={`h-9 rounded-md text-xs font-semibold transition-colors ${
                      active
                        ? "bg-white text-brand-700 shadow-sm"
                        : "text-ink-600 hover:text-ink-900"
                    }`}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div>
          <label
            htmlFor="problem"
            className="flex items-center gap-2 text-sm font-medium text-ink-900"
          >
            <Lightbulb className="h-4 w-4 text-gold-600" />
            Problem area you&apos;re curious about
          </label>
          <p className="mt-1 text-xs text-ink-500">
            Optional — describe a broad problem or theme. Leave blank to get the
            sector&apos;s highest-signal angles.
          </p>
          <textarea
            id="problem"
            value={problemArea}
            onChange={(e) => setProblemArea(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="e.g. Aged-care providers struggle with staff rostering under new AN-ACC funding rules..."
            className="mt-2 w-full rounded-lg border border-surface-300 bg-white px-3 py-3 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-right text-[11px] text-ink-400">
            {problemArea.length} / 500
          </p>
        </div>

        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating ideas...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate angles
              </>
            )}
          </button>
          <p className="text-xs text-ink-500">
            Free tier: 1 run per sector per day. Sign in for unlimited
            (credit-gated).
          </p>
        </div>
      </form>

      {result && <IdeaLabResults data={result} />}
    </div>
  );
}

// ── Result renderer ────────────────────────────────────────────────────

function IdeaLabResults({ data }: { data: IdeaLabResponse }) {
  return (
    <div className="space-y-10 border-t border-surface-200 pt-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.16em] text-brand-600 font-medium">
            {data.sectorLabel}
          </p>
          <h2 className="mt-1 text-2xl font-semibold text-ink-900">
            Startup angles &amp; opportunities
          </h2>
        </div>
        <p className="text-[11px] text-ink-500">
          {data.source === "ai" ? "AI-generated" : "Curated fallback"} ·{" "}
          {new Date(data.generatedAt).toLocaleString("en-AU", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      </div>

      {/* ── 10 concrete angles ─────────────────────────────────────── */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-700">
          <Target className="h-4 w-4 text-brand-600" />
          10 startup angles
        </h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-surface-200 text-left text-[11px] uppercase tracking-wider text-ink-500">
                <th className="pb-2 pr-4 font-medium">Idea</th>
                <th className="pb-2 pr-4 font-medium">Target customer</th>
                <th className="pb-2 pr-4 font-medium">Monetisation</th>
                <th className="pb-2 pr-4 font-medium">Effort</th>
                <th className="pb-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.angles.map((a) => (
                <tr
                  key={a.title}
                  className="border-b border-surface-100 align-top"
                >
                  <td className="py-3 pr-4">
                    <p className="font-semibold text-ink-900">{a.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-ink-600">
                      {a.oneLiner}
                    </p>
                  </td>
                  <td className="py-3 pr-4 text-xs leading-relaxed text-ink-700">
                    {a.targetCustomer}
                  </td>
                  <td className="py-3 pr-4 text-xs leading-relaxed text-ink-700">
                    {a.monetisation}
                  </td>
                  <td className="py-3 pr-4">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${EFFORT_STYLE[a.effortLevel]}`}
                    >
                      {a.effortLevel}
                    </span>
                  </td>
                  <td className="py-3">
                    <Link
                      href={`/svi?query=${encodeURIComponent(a.oneLiner)}`}
                      className="inline-flex h-9 items-center gap-1 rounded-lg bg-brand-600 px-3 text-[11px] font-semibold text-white hover:bg-brand-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2"
                    >
                      Score this idea
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ── 5 non-obvious opportunities ─────────────────────────────── */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-700">
          <Sparkles className="h-4 w-4 text-gold-600" />
          5 non-obvious opportunities
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          {data.nonObvious.map((n) => (
            <article
              key={n.title}
              className="rounded-xl border border-surface-200 bg-surface-50 p-4"
            >
              <h4 className="text-sm font-semibold text-ink-900">{n.title}</h4>
              <p className="mt-2 text-xs leading-relaxed text-ink-600">
                <span className="font-semibold text-ink-700">Why overlooked: </span>
                {n.whyOverlooked}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-ink-600">
                <span className="font-semibold text-ink-700">Founder hook: </span>
                {n.hookForFounder}
              </p>
              <Link
                href={`/svi?query=${encodeURIComponent(`${n.title} — ${n.hookForFounder}`)}`}
                className="mt-3 inline-flex h-8 items-center gap-1 rounded-lg border border-brand-200 bg-white px-3 text-[11px] font-semibold text-brand-700 hover:border-brand-400 hover:bg-brand-50 transition-colors"
              >
                Score this idea
                <ArrowRight className="h-3 w-3" />
              </Link>
            </article>
          ))}
        </div>
      </section>

      {/* ── 3 competitors ───────────────────────────────────────────── */}
      <section>
        <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-ink-700">
          <Users className="h-4 w-4 text-brand-600" />
          3 competitors to know
        </h3>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {data.competitors.map((c) => (
            <article
              key={c.name}
              className="rounded-xl border border-surface-200 bg-white p-4"
            >
              <h4 className="text-sm font-semibold text-ink-900">{c.name}</h4>
              <p className="mt-2 text-xs leading-relaxed text-ink-600">
                {c.whatTheyDo}
              </p>
              <p className="mt-2 text-xs italic leading-relaxed text-ink-500">
                {c.angle}
              </p>
            </article>
          ))}
        </div>
      </section>

      <p className="text-[11px] leading-relaxed text-ink-500">
        {data.disclaimer}
      </p>
    </div>
  );
}
