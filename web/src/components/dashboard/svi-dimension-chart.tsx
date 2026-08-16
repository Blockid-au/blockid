"use client";

// SviDimensionChart — Horizontal bar chart showing 8 SVI dimension scores.
//
// Each bar is colour-coded:
//   ≥70 → emerald (strong)
//   40–69 → amber  (developing)
//   <40  → red    (weak / needs work)
//
// A subtle vertical dashed line marks the AU benchmark at score 55.
// Pure Tailwind + inline SVG — no external chart libraries.

interface SviDimensionChartProps {
  dimensionScores: Record<string, number>;
  className?: string;
}

// ── Dimension key normalisation ──────────────────────────────────────────────

const DIMENSION_LABELS: Record<string, string> = {
  // snake_case keys (from SVI engine)
  market_opportunity: "Market Opportunity",
  product_diff:       "Product & Differentiation",
  team_strength:      "Team Strength",
  traction:           "Traction & Revenue",
  financial_health:   "Financial Health",
  ip_moat:            "IP & Moat",
  legal_compliance:   "Legal & Compliance",
  investor_readiness: "Investor Readiness",
  // camelCase variants
  marketOpportunity:  "Market Opportunity",
  productDiff:        "Product & Differentiation",
  teamStrength:       "Team Strength",
  financialHealth:    "Financial Health",
  ipMoat:             "IP & Moat",
  legalCompliance:    "Legal & Compliance",
  investorReadiness:  "Investor Readiness",
};

// Preferred display order (snake_case canonical keys)
const DISPLAY_ORDER = [
  "market_opportunity",
  "product_diff",
  "team_strength",
  "traction",
  "financial_health",
  "ip_moat",
  "legal_compliance",
  "investor_readiness",
];

// Normalise a raw key to its canonical snake_case form so ordering works.
function normalise(key: string): string {
  const camelToSnake: Record<string, string> = {
    marketOpportunity: "market_opportunity",
    productDiff:       "product_diff",
    teamStrength:      "team_strength",
    financialHealth:   "financial_health",
    ipMoat:            "ip_moat",
    legalCompliance:   "legal_compliance",
    investorReadiness: "investor_readiness",
  };
  return camelToSnake[key] ?? key;
}

// ── Colour helpers ───────────────────────────────────────────────────────────

function barColor(score: number): string {
  if (score >= 70) return "#10b981"; // emerald-500
  if (score >= 40) return "#f59e0b"; // amber-400
  return "#ef4444";                  // red-400
}

function barTrackStyle(): React.CSSProperties {
  return { background: "rgba(255,255,255,0.06)" };
}

// AU benchmark line position as a percentage of the bar width (55/100 = 55%)
const BENCHMARK = 55;

// ── Bar row ──────────────────────────────────────────────────────────────────

function DimensionBar({ label, score }: { label: string; score: number }) {
  const pct = Math.min(Math.max(score, 0), 100);
  const color = barColor(pct);
  const benchmarkLeft = `${BENCHMARK}%`;

  return (
    <div className="flex items-center gap-3 group">
      {/* Label — fixed width, right-aligned */}
      <span
        className="text-xs text-[#94A3B8] text-right shrink-0 truncate"
        style={{ width: "160px", minWidth: "120px" }}
        title={label}
      >
        {label}
      </span>

      {/* Bar track — relative so we can position the benchmark line */}
      <div className="relative flex-1 h-5 rounded-full overflow-hidden" style={barTrackStyle()}>
        {/* Filled bar */}
        <div
          className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: color,
            opacity: 0.85,
            boxShadow: `0 0 8px ${color}66`,
          }}
        />

        {/* AU benchmark dashed line overlay — rendered as a thin absolute element */}
        <div
          className="absolute inset-y-0"
          style={{
            left: benchmarkLeft,
            width: "1px",
            borderLeft: "1.5px dashed rgba(255,255,255,0.30)",
            zIndex: 10,
          }}
        />
      </div>

      {/* Score on right */}
      <span
        className="text-xs font-bold tabular-nums shrink-0"
        style={{ color, width: "30px", textAlign: "right" }}
      >
        {Math.round(pct)}
      </span>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function SviDimensionChart({ dimensionScores, className = "" }: SviDimensionChartProps) {
  // Normalise input keys and build ordered list
  const normalised: Record<string, number> = {};
  for (const [key, val] of Object.entries(dimensionScores)) {
    if (typeof val === "number") {
      normalised[normalise(key)] = val;
    }
  }

  // Build rows: preferred order first, then any remaining keys not in the order list
  const rows: Array<{ key: string; label: string; score: number }> = [];
  const seen = new Set<string>();

  for (const key of DISPLAY_ORDER) {
    if (key in normalised) {
      rows.push({
        key,
        label: DIMENSION_LABELS[key] ?? key,
        score: normalised[key],
      });
      seen.add(key);
    }
  }
  // Append any extra keys not in the canonical order
  for (const [key, score] of Object.entries(normalised)) {
    if (!seen.has(key)) {
      rows.push({
        key,
        label: DIMENSION_LABELS[key] ?? key,
        score,
      });
    }
  }

  if (rows.length === 0) return null;

  // Summary stats
  const avg = Math.round(rows.reduce((s, r) => s + r.score, 0) / rows.length);
  const strongest = rows.reduce((a, b) => (a.score >= b.score ? a : b));
  const weakest   = rows.reduce((a, b) => (a.score <= b.score ? a : b));

  return (
    <div
      className={`rounded-2xl border border-[rgba(255,255,255,0.08)] backdrop-blur-sm overflow-hidden hover:border-[rgba(0,212,255,0.3)] transition-all duration-300 ${className}`}
      style={{ background: "rgba(255,255,255,0.04)" }}
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wider font-semibold text-[#00D4FF]">
            SVI Dimension Breakdown
          </p>
          <p className="text-xs text-[#64748B] mt-0.5">
            8 scoring dimensions · AU benchmark at 55
          </p>
        </div>

        {/* Summary pills */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-[rgba(255,255,255,0.06)] text-[#94A3B8]">
            Avg&nbsp;
            <span style={{ color: barColor(avg) }}>{avg}</span>
          </span>
          <span className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-emerald-500/10 text-emerald-400">
            ↑ {strongest.label.split(" ")[0]}
          </span>
          <span className="rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-wider bg-red-500/10 text-red-400">
            ↓ {weakest.label.split(" ")[0]}
          </span>
        </div>
      </div>

      {/* Legend */}
      <div className="px-6 pt-4 pb-1 flex items-center gap-5 flex-wrap">
        <LegendDot color="#10b981" label="Strong (≥70)" />
        <LegendDot color="#f59e0b" label="Developing (40–69)" />
        <LegendDot color="#ef4444" label="Needs work (<40)" />
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Benchmark icon */}
          <svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true">
            <line x1="8" y1="0" x2="8" y2="10" stroke="rgba(255,255,255,0.40)" strokeWidth="1.5" strokeDasharray="2 2" />
          </svg>
          <span className="text-[10px] text-[#64748B]">AU Benchmark (55)</span>
        </div>
      </div>

      {/* Bars */}
      <div className="px-6 pb-5 pt-3 space-y-3">
        {rows.map((row) => (
          <DimensionBar key={row.key} label={row.label} score={row.score} />
        ))}
      </div>

      {/* Footer nudge — highlight the weakest dimension */}
      {weakest.score < 40 && (
        <div className="mx-6 mb-5 rounded-xl border border-red-500/20 bg-red-500/08 px-4 py-3">
          <p className="text-xs text-red-300 leading-relaxed">
            <span className="font-semibold">Priority gap:</span> Your{" "}
            <span className="font-semibold">{weakest.label}</span> score ({Math.round(weakest.score)}) is
            below the AU benchmark. Strengthening this dimension will have the highest impact on your
            overall SVI.
          </p>
        </div>
      )}
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="text-[10px] text-[#64748B]">{label}</span>
    </div>
  );
}
