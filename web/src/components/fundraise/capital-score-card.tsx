"use client";

import { useState } from "react";
import {
  TrendingUp, AlertTriangle, CheckCircle2, ChevronRight,
  Users, BarChart2, Shield, FolderOpen, Presentation, Crosshair, Zap,
} from "lucide-react";

/* ── Types (mirror cro-funding-readiness.ts) ──────────────────────────── */

type FundingStage = "pre-seed" | "seed" | "series-a" | "series-b";
type Verdict = "investor-ready" | "near-ready" | "warming-up" | "not-ready";
type PillarKey = "traction" | "team" | "governance" | "data_room" | "investor_materials" | "stage_fit";

interface PillarScore {
  key: PillarKey;
  label: string;
  score: number;
  verdict: Verdict;
  reasoning: string;
}

interface FundingAction {
  priority: 1 | 2 | 3;
  pillar: PillarKey;
  action: string;
  effort: "low" | "medium" | "high";
  impactPoints: number;
}

interface CapitalResult {
  stage: FundingStage;
  overall: number;
  verdict: Verdict;
  pillars: PillarScore[];
  topGaps: PillarScore[];
  actions: FundingAction[];
  summary: string;
}

/* ── Visual helpers ──────────────────────────────────────────────────────── */

const PILLAR_ICONS: Record<PillarKey, React.ElementType> = {
  traction:           BarChart2,
  team:               Users,
  governance:         Shield,
  data_room:          FolderOpen,
  investor_materials: Presentation,
  stage_fit:          Crosshair,
};

const VERDICT_STYLE: Record<Verdict, { bar: string; badge: string; label: string; arc: string }> = {
  "investor-ready": { bar: "bg-emerald-500", badge: "text-emerald-700 bg-emerald-50 border-emerald-200", label: "Investor Ready",  arc: "#10b981" },
  "near-ready":     { bar: "bg-cyan-500",    badge: "text-cyan-700 bg-cyan-50 border-cyan-200",         label: "Near Ready",      arc: "#06b6d4" },
  "warming-up":     { bar: "bg-amber-500",   badge: "text-amber-700 bg-amber-50 border-amber-200",      label: "Warming Up",      arc: "#f59e0b" },
  "not-ready":      { bar: "bg-red-500",     badge: "text-red-700 bg-red-50 border-red-200",            label: "Not Ready",       arc: "#ef4444" },
};

const EFFORT_COLOR: Record<string, string> = {
  low: "text-emerald-600", medium: "text-amber-600", high: "text-red-600",
};

/* ── Arc gauge ───────────────────────────────────────────────────────────── */

function ScoreArc({ score, verdict }: { score: number; verdict: Verdict }) {
  const R = 52, cx = 64, cy = 68;
  const circ = Math.PI * R;
  const filled = (score / 100) * circ;
  const { arc, badge, label } = VERDICT_STYLE[verdict];
  return (
    <div className="flex flex-col items-center gap-3">
      <svg viewBox="0 0 128 88" className="w-44">
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke="#e5e7eb" strokeWidth="10" strokeLinecap="round" />
        <path d={`M ${cx - R} ${cy} A ${R} ${R} 0 0 1 ${cx + R} ${cy}`}
          fill="none" stroke={arc} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ}`}
          style={{ filter: `drop-shadow(0 0 6px ${arc}88)` }} />
        <text x={cx} y={cy - 5} textAnchor="middle" fontSize="24" fontWeight="700" fill="#0f172a">{score}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize="10" fill="#64748b">/100 CAPITAL score</text>
      </svg>
      <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge}`}>{label}</span>
    </div>
  );
}

/* ── Pillar bar ───────────────────────────────────────────────────────────── */

function PillarBar({ p }: { p: PillarScore }) {
  const Icon = PILLAR_ICONS[p.key];
  const { bar } = VERDICT_STYLE[p.verdict];
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="flex items-center gap-1.5 font-medium text-ink-700">
          <Icon className="h-3.5 w-3.5 text-ink-400" />{p.label}
        </span>
        <span className="font-bold tabular-nums text-ink-600">{p.score}/100</span>
      </div>
      <div className="h-2 rounded-full bg-surface-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${bar}`} style={{ width: `${p.score}%` }} />
      </div>
      <p className="text-[10px] text-ink-400 leading-snug">{p.reasoning}</p>
    </div>
  );
}

/* ── Input form ───────────────────────────────────────────────────────────── */

const STAGES: { value: FundingStage; label: string }[] = [
  { value: "pre-seed", label: "Pre-Seed" },
  { value: "seed",     label: "Seed" },
  { value: "series-a", label: "Series A" },
  { value: "series-b", label: "Series B" },
];

interface FormState {
  stage: FundingStage;
  mrrAud: string; users: string; monthlyGrowthPct: string;
  teamSignal: string;
  hasTechnicalFounder: boolean; hasFounderVesting: boolean;
  hasShareholdersAgreement: boolean; esopPoolPct: string;
  dataRoomPct: string;
  hasPitchDeck: boolean; hasFinancialModel: boolean;
  hasUseOfFunds: boolean; hasWarmIntros: boolean;
  targetRaiseAud: string;
}

const DEFAULT: FormState = {
  stage: "pre-seed", mrrAud: "", users: "", monthlyGrowthPct: "",
  teamSignal: "60", hasTechnicalFounder: false, hasFounderVesting: false,
  hasShareholdersAgreement: false, esopPoolPct: "", dataRoomPct: "",
  hasPitchDeck: false, hasFinancialModel: false, hasUseOfFunds: false,
  hasWarmIntros: false, targetRaiseAud: "",
};

function num(s: string): number | undefined {
  const n = parseFloat(s); return isNaN(n) ? undefined : n;
}

/* ── Main component ───────────────────────────────────────────────────────── */

export function CapitalScoreCard() {
  const [form, setForm] = useState<FormState>(DEFAULT);
  const [result, setResult] = useState<CapitalResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(true);

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm(f => ({ ...f, [k]: v }));
  }

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/funding-readiness", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stage: form.stage,
          mrrAud: num(form.mrrAud),
          users: num(form.users),
          monthlyGrowthPct: num(form.monthlyGrowthPct),
          teamSignal: num(form.teamSignal),
          hasTechnicalFounder: form.hasTechnicalFounder,
          hasFounderVesting: form.hasFounderVesting,
          hasShareholdersAgreement: form.hasShareholdersAgreement,
          esopPoolPct: num(form.esopPoolPct),
          dataRoomPct: num(form.dataRoomPct),
          hasPitchDeck: form.hasPitchDeck,
          hasFinancialModel: form.hasFinancialModel,
          hasUseOfFunds: form.hasUseOfFunds,
          hasWarmIntros: form.hasWarmIntros,
          targetRaiseAud: num(form.targetRaiseAud),
        }),
      });
      const data = await res.json() as { ok: boolean; result?: CapitalResult; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Error ${res.status}`);
      setResult(data.result!);
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to score");
    } finally {
      setBusy(false);
    }
  }

  const inp = "w-full rounded-xl border border-surface-300 bg-white px-3 py-1.5 text-xs text-ink-800 placeholder:text-ink-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none";

  function chk(label: string, key: keyof FormState) {
    return (
      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input type="checkbox" checked={!!form[key]}
          onChange={e => set(key, e.target.checked as FormState[typeof key])}
          className="h-4 w-4 rounded border-surface-300 text-brand-600 focus:ring-brand-400" />
        <span className="text-xs text-ink-700">{label}</span>
      </label>
    );
  }

  return (
    <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0B0F2A] to-[#1B2A5E] px-6 py-4 flex items-center justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-cyan-400 font-semibold mb-0.5">CAPITAL Framework · 6 pillars</p>
          <h2 className="text-white font-semibold">Investor Readiness Score</h2>
        </div>
        {result && (
          <button type="button" onClick={() => setShowForm(f => !f)}
            className="text-xs text-white/60 hover:text-white transition-colors cursor-pointer">
            {showForm ? "Hide inputs" : "Edit inputs"}
          </button>
        )}
      </div>

      <div className="p-6">
        {/* ── Form ── */}
        {showForm && (
          <form onSubmit={run} className="space-y-5">
            {/* Stage selector */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Funding stage</p>
              <div className="flex gap-2 flex-wrap">
                {STAGES.map(s => (
                  <button key={s.value} type="button" onClick={() => set("stage", s.value)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      form.stage === s.value
                        ? "bg-brand-600 text-white border-brand-600"
                        : "bg-white text-ink-600 border-surface-300 hover:border-brand-400"
                    }`}>{s.label}</button>
                ))}
              </div>
            </div>

            {/* Traction */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Traction</p>
              <div className="grid grid-cols-3 gap-3">
                <label className="block"><span className="text-[10px] text-ink-500 block mb-1">MRR (A$)</span>
                  <input type="number" min="0" placeholder="0" value={form.mrrAud} onChange={e => set("mrrAud", e.target.value)} className={inp} /></label>
                <label className="block"><span className="text-[10px] text-ink-500 block mb-1">Active users</span>
                  <input type="number" min="0" placeholder="0" value={form.users} onChange={e => set("users", e.target.value)} className={inp} /></label>
                <label className="block"><span className="text-[10px] text-ink-500 block mb-1">MoM growth %</span>
                  <input type="number" min="0" placeholder="0" value={form.monthlyGrowthPct} onChange={e => set("monthlyGrowthPct", e.target.value)} className={inp} /></label>
              </div>
            </div>

            {/* Team */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Team</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-[10px] text-ink-500 block mb-1">Team strength (0–100)</span>
                  <input type="number" min="0" max="100" placeholder="60" value={form.teamSignal} onChange={e => set("teamSignal", e.target.value)} className={inp} /></label>
                <div className="flex flex-col gap-2 pt-4">
                  {chk("Technical co-founder", "hasTechnicalFounder")}
                  {chk("Founder vesting (4yr/1yr cliff)", "hasFounderVesting")}
                </div>
              </div>
            </div>

            {/* Governance */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Governance</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-[10px] text-ink-500 block mb-1">ESOP pool %</span>
                  <input type="number" min="0" max="30" placeholder="12" value={form.esopPoolPct} onChange={e => set("esopPoolPct", e.target.value)} className={inp} /></label>
                <div className="flex flex-col gap-2 pt-4">
                  {chk("Shareholders agreement in place", "hasShareholdersAgreement")}
                </div>
              </div>
            </div>

            {/* Data room + materials */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Data room &amp; investor materials</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-[10px] text-ink-500 block mb-1">Data room complete %</span>
                  <input type="number" min="0" max="100" placeholder="0" value={form.dataRoomPct} onChange={e => set("dataRoomPct", e.target.value)} className={inp} /></label>
                <div className="flex flex-col gap-1.5 pt-3">
                  {chk("Pitch deck (≤6 months old)", "hasPitchDeck")}
                  {chk("36-month financial model", "hasFinancialModel")}
                  {chk("Use of funds breakdown", "hasUseOfFunds")}
                </div>
              </div>
            </div>

            {/* Stage fit / pipeline */}
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400 mb-2">Investor pipeline</p>
              <div className="grid grid-cols-2 gap-3">
                <label className="block"><span className="text-[10px] text-ink-500 block mb-1">Target raise (A$)</span>
                  <input type="number" min="0" placeholder="500000" value={form.targetRaiseAud} onChange={e => set("targetRaiseAud", e.target.value)} className={inp} /></label>
                <div className="flex flex-col gap-2 pt-4">
                  {chk("Warm investor intros confirmed", "hasWarmIntros")}
                </div>
              </div>
            </div>

            {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

            <button type="submit" disabled={busy}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors cursor-pointer">
              {busy
                ? <><span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />Scoring…</>
                : <><Zap className="h-4 w-4" />Score Investor Readiness</>}
            </button>
            <p className="text-[10px] text-ink-400 text-center">
              General information only — not financial advice. AU CAPITAL framework, stage-benchmarked.
            </p>
          </form>
        )}

        {/* ── Results ── */}
        {result && !showForm && (
          <div className="space-y-6">
            {/* Arc + top 3 priority actions */}
            <div className="flex flex-col sm:flex-row items-center gap-6">
              <ScoreArc score={result.overall} verdict={result.verdict} />
              <div className="flex-1 space-y-2 w-full">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">Top priority actions</p>
                {result.actions.slice(0, 3).map((a, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl bg-surface-50 border border-surface-200 px-3 py-2.5">
                    <span className={`shrink-0 text-[10px] font-bold mt-0.5 w-5 h-5 flex items-center justify-center rounded-full
                      ${a.priority === 1 ? "bg-red-100 text-red-700" : a.priority === 2 ? "bg-amber-100 text-amber-700" : "bg-surface-200 text-ink-500"}`}>
                      P{a.priority}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-ink-800 leading-snug">{a.action}</p>
                      <p className="text-[10px] text-ink-400 mt-0.5">
                        {a.impactPoints > 0 && <span className="text-emerald-600 font-semibold">+{a.impactPoints} pts · </span>}
                        Effort: <span className={EFFORT_COLOR[a.effort]}>{a.effort}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 6-pillar breakdown */}
            <div className="border-t border-surface-100 pt-5 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-400">6-pillar breakdown</p>
              {result.pillars.map(p => <PillarBar key={p.key} p={p} />)}
            </div>

            {/* Weakest pillars callout */}
            {result.topGaps.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
                <p className="text-xs font-semibold text-amber-800 flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5" />Weakest pillars — highest leverage
                </p>
                {result.topGaps.map(g => (
                  <div key={g.key} className="flex items-start gap-2 text-xs text-amber-900">
                    <CheckCircle2 className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                    <span><strong>{g.label}</strong> — {g.score}/100 · {g.reasoning}</span>
                  </div>
                ))}
              </div>
            )}

            <button type="button" onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-surface-300 px-4 py-2.5 text-sm text-ink-600 hover:bg-surface-50 transition-colors cursor-pointer">
              <ChevronRight className="h-4 w-4" />Update inputs to re-score
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
