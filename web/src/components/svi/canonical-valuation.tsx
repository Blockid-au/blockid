import type { StreamValuation } from "@/lib/svi/stream-valuation";
import { formatAud } from "@/lib/svi/three-case-valuation";

export function CanonicalValuation({ valuation }: { valuation: StreamValuation }) {
  const { consensus: c, scenarios: s } = valuation;
  return <section className="mt-4 rounded-xl border border-line p-4" aria-label="Report valuation">
    <p className="text-xs font-semibold uppercase tracking-wide">Business value · report estimate</p>
    <p className="mt-2 text-xl font-bold tabular-nums">{formatAud(c.lowAud)} – {formatAud(c.highAud)}</p>
    <p className="text-sm text-secondary">Central estimate {formatAud(c.midAud)} · Confidence {Math.round(c.confidence * 100)}%</p>
    <div className="mt-3 grid grid-cols-3 gap-2">{([["Bear", s.bear], ["Base", s.base], ["Bull", s.bull]] as const).map(([label, value]) => <div key={label}><p className="text-xs text-secondary">{label}</p><p className="font-semibold tabular-nums">{formatAud(value)}</p></div>)}</div>
    <p className="mt-3 text-xs text-secondary">Calculated from the report financial inputs. An estimate, not an independently verified price.</p>
  </section>;
}
