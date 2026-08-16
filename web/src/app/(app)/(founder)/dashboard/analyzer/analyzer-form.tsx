"use client";

import { useState } from "react";
import { CheckCircle2, XCircle, Code2, Globe, TrendingUp, Zap } from "lucide-react";

interface ProjectOption {
  id: string;
  name: string;
}

interface RunResponse {
  ok: boolean;
  reason?: string;
  sub_score?: number;
  valuation_adjuster_pct?: number;
  rationale?: string[];
  breakdown?: { githubSide: number | null; websiteSide: number | null };
  persist_warning?: string | null;
}

/* ── Score colour helpers ──────────────────────────────────────────────── */

function scoreColor(n: number) {
  if (n >= 80) return { bar: "bg-emerald-500", text: "text-emerald-600", label: "Excellent" };
  if (n >= 65) return { bar: "bg-cyan-500",    text: "text-cyan-600",    label: "Good" };
  if (n >= 45) return { bar: "bg-amber-500",   text: "text-amber-600",   label: "Fair" };
  return          { bar: "bg-red-500",         text: "text-red-600",     label: "Needs work" };
}

function adjusterColor(pct: number) {
  if (pct > 0) return "text-emerald-600 bg-emerald-50 border-emerald-200";
  if (pct < 0) return "text-red-600 bg-red-50 border-red-200";
  return "text-ink-600 bg-surface-50 border-surface-200";
}

/* ── Score arc (SVG half-circle gauge) ────────────────────────────────── */

function ScoreArc({ score }: { score: number }) {
  const R = 52;
  const cx = 64, cy = 64;
  const circumference = Math.PI * R;
  const filled = (score / 100) * circumference;
  const c = scoreColor(score);

  const arcColor =
    score >= 80 ? "#10b981" :
    score >= 65 ? "#06b6d4" :
    score >= 45 ? "#f59e0b" : "#ef4444";

  return (
    <svg viewBox="0 0 128 80" className="w-40 mx-auto">
      {/* Background arc */}
      <path
        d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
        fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round"
      />
      {/* Filled arc */}
      <path
        d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
        fill="none" stroke={arcColor} strokeWidth="10" strokeLinecap="round"
        strokeDasharray={`${filled} ${circumference}`}
      />
      {/* Score text */}
      <text x={cx} y={cy - 4} textAnchor="middle" className="font-bold" fontSize="22" fontWeight="700" fill="#0f172a">
        {score}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fontSize="10" fill="#64748b">
        /100 PTD sub-score
      </text>
      <text x={cx} y={cy + 26} textAnchor="middle" fontSize="9" fontWeight="600" fill={arcColor}>
        {c.label}
      </text>
    </svg>
  );
}

/* ── Horizontal bar ───────────────────────────────────────────────────── */

function ScoreBar({ label, score, icon }: { label: string; score: number | null; icon: React.ReactNode }) {
  if (score == null) return null;
  const c = scoreColor(score);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-1.5 font-medium text-ink-700">{icon}{label}</span>
        <span className={`font-bold tabular-nums ${c.text}`}>{score}/100</span>
      </div>
      <div className="h-2.5 rounded-full bg-surface-200 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${c.bar}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

/* ── Rationale items ──────────────────────────────────────────────────── */

function RationaleItem({ text }: { text: string }) {
  const isStrong = text.startsWith("Strong:");
  return (
    <li className="flex items-start gap-2 text-sm">
      {isStrong
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        : <XCircle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />}
      <span className={isStrong ? "text-ink-700" : "text-red-700"}>{text.replace(/^(Strong|Gap): /, "")}</span>
    </li>
  );
}

/* ── Main form ────────────────────────────────────────────────────────── */

export function AnalyzerForm({ projects }: { projects: ProjectOption[] }) {
  const [startupId, setStartupId] = useState<string>(projects[0]?.id ?? "");
  const [githubUrl, setCode2Url] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<RunResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    if (!startupId) { setError("Pick a startup first."); return; }
    if (!githubUrl && !websiteUrl) { setError("Enter a GitHub URL or a website URL (at least one)."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/analyzer/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startup_id: startupId, github_url: githubUrl || null, website_url: websiteUrl || null }),
      });
      const data = (await res.json()) as RunResponse;
      if (!res.ok || !data.ok) setError(data.reason ?? `Request failed (${res.status})`);
      else setResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || projects.length === 0;
  const adj = result?.valuation_adjuster_pct ?? 0;

  return (
    <div className="space-y-6">
      {/* ── Input form ── */}
      <form onSubmit={submit} className="rounded-2xl border border-surface-200 bg-white p-6 shadow-sm space-y-5">
        {projects.length === 0 ? (
          <p className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
            No startups found. Create one from the dashboard first.
          </p>
        ) : (
          <label className="block">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1 block">Startup</span>
            <select
              className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm text-ink-800 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
              value={startupId}
              onChange={(e) => setStartupId(e.target.value)}
            >
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        )}

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1 flex items-center gap-1.5">
            <Code2 className="h-3.5 w-3.5" />GitHub repo URL <span className="normal-case text-ink-400 font-normal">(optional)</span>
          </span>
          <input
            type="url"
            placeholder="https://github.com/owner/repo"
            className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
            value={githubUrl}
            onChange={(e) => setCode2Url(e.target.value)}
          />
        </label>

        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink-500 mb-1 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" />Website URL <span className="normal-case text-ink-400 font-normal">(optional)</span>
          </span>
          <input
            type="url"
            placeholder="https://example.com"
            className="w-full rounded-xl border border-surface-300 bg-white px-3 py-2.5 text-sm text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
          />
        </label>

        <p className="text-[11px] text-ink-400">Requires at least one URL. No LLM calls — deterministic, fast, free.</p>

        <button
          type="submit"
          disabled={disabled}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer"
        >
          {busy ? (
            <><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Analysing…</>
          ) : (
            <><Zap className="h-4 w-4" />Run Analyzer</>
          )}
        </button>

        {error && (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        )}
      </form>

      {/* ── Results panel ── */}
      {result?.ok && result.sub_score != null && (
        <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-[#0B0F2A] to-[#1B2A5E] px-6 py-4 flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-semibold mb-0.5">Analysis complete</p>
              <h2 className="text-white font-semibold text-base">Code &amp; Website Score</h2>
            </div>
            <span className="text-xs font-medium text-white/60">PTD dimension</span>
          </div>

          <div className="p-6 space-y-6">
            {/* Score arc + adjuster */}
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="flex-1 flex flex-col items-center">
                <ScoreArc score={result.sub_score} />
              </div>
              <div className="flex-1 space-y-3 w-full">
                {/* Valuation adjuster badge */}
                <div className={`rounded-xl border px-4 py-3 flex items-center justify-between ${adjusterColor(adj)}`}>
                  <span className="text-sm font-medium flex items-center gap-1.5">
                    <TrendingUp className="h-4 w-4" />Valuation adjuster
                  </span>
                  <span className="text-lg font-bold tabular-nums">
                    {adj > 0 ? "+" : ""}{adj}%
                  </span>
                </div>
                <p className="text-xs text-ink-500 px-1">
                  {adj >= 12 ? "Strong tech signals — investors typically apply a positive premium." :
                   adj >= 5  ? "Solid signals — contributes positively to your SVI PTD dimension." :
                   adj === 0  ? "Baseline. Improving CI/CD, tests, and SEO will unlock a +5–12% uplift." :
                               "Tech gaps detected — addressing them can recover 10%+ on valuation."}
                </p>
              </div>
            </div>

            {/* Side-by-side bars */}
            {result.breakdown && (result.breakdown.githubSide != null || result.breakdown.websiteSide != null) && (
              <div className="space-y-3 border-t border-surface-100 pt-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Score breakdown</p>
                <ScoreBar
                  label="GitHub repo"
                  score={result.breakdown.githubSide}
                  icon={<Code2 className="h-3.5 w-3.5 text-ink-500" />}
                />
                <ScoreBar
                  label="Website"
                  score={result.breakdown.websiteSide}
                  icon={<Globe className="h-3.5 w-3.5 text-ink-500" />}
                />
              </div>
            )}

            {/* Rationale */}
            {result.rationale && result.rationale.length > 0 && (
              <div className="border-t border-surface-100 pt-5 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-ink-400">Strengths &amp; gaps</p>
                <ul className="space-y-2">
                  {result.rationale.map((r) => <RationaleItem key={r} text={r} />)}
                </ul>
              </div>
            )}

            {result.persist_warning && (
              <p className="text-xs text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
                DB warning: {result.persist_warning}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
