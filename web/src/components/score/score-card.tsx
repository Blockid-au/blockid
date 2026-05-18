import { ShieldCheck, Link as LinkIcon, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SubScore {
  label: string;
  value: number;
}

interface ScoreCardProps {
  score?: number;
  subScores?: SubScore[];
  className?: string;
  caption?: string;
}

const DEFAULT_SUBS: SubScore[] = [
  { label: "Financials", value: 88 },
  { label: "Cap Table Hygiene", value: 92 },
  { label: "Governance", value: 81 },
  { label: "Founder Background", value: 90 },
  { label: "Documentation", value: 84 },
];

export function ScoreCard({
  score = 87,
  subScores = DEFAULT_SUBS,
  className,
  caption = "Generated 2026-05-07 · Anchored on chain · Verified by BlockID",
}: ScoreCardProps) {
  return (
    <div
      className={cn(
        "relative w-full max-w-md rounded-2xl border border-ink-700 bg-ink-900 p-6 shadow-[0_1px_0_rgba(255,255,255,0.04)_inset,0_24px_64px_rgba(0,0,0,0.55)]",
        className,
      )}
      aria-label="Sample Investor-Ready Score card"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-br from-brand-500/10 via-transparent to-transparent"
      />
      <div className="relative">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand-500/15 text-brand-300 ring-1 ring-brand-500/30">
              <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />
            </span>
            <p className="text-xs uppercase tracking-[0.2em] text-gold-400 font-medium">
              Investor-Ready Score
            </p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-ink-700 bg-ink-800 px-2 py-0.5 text-[10px] uppercase tracking-wider text-slate-400">
            <Sparkles strokeWidth={1.75} className="h-3 w-3 text-brand-400" />
            v2
          </span>
        </div>

        <div className="mt-6 flex items-end gap-2">
          <span className="font-mono tabular-nums text-7xl font-semibold tracking-tight text-brand-400 leading-none">
            {score}
          </span>
          <span className="font-mono tabular-nums text-2xl text-slate-500 leading-none mb-2">
            /100
          </span>
        </div>
        <p className="mt-1 text-sm text-slate-400">
          Top quartile for AU seed-stage SaaS · Sector median 71
        </p>

        <div className="mt-6 space-y-3">
          {subScores.map((s) => (
            <div key={s.label}>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-300">{s.label}</span>
                <span className="font-mono tabular-nums text-slate-400">
                  {s.value}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 w-full rounded-full bg-ink-700 overflow-hidden">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.max(0, Math.min(100, s.value))}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-between border-t border-ink-700 pt-4 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <LinkIcon strokeWidth={1.75} className="h-3.5 w-3.5 text-slate-500" />
            blockid.au/p/acme-co
          </span>
          <span className="font-mono tabular-nums">{caption.split(" · ")[0]}</span>
        </div>
      </div>
    </div>
  );
}
