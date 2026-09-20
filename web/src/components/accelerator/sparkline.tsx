// Sparkline — an inline SVG of the last N SVI totals (G21 P2-C, Program
// tab). Pure, server-safe: no client hooks. The trend is announced in text
// (`<title>` + aria-label) so it never relies on the line alone.

export interface SparklineProps {
  /** Oldest first. */
  values: number[];
  label: string;
  width?: number;
  height?: number;
}

export function sparklinePath(values: number[], width: number, height: number, pad = 2): string {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) return "";
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const span = max - min || 1;
  const stepX = xs.length === 1 ? 0 : (width - pad * 2) / (xs.length - 1);
  return xs
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = height - pad - ((v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Sparkline({ values, label, width = 96, height = 28 }: SparklineProps) {
  const xs = values.filter((v) => Number.isFinite(v));
  if (xs.length === 0) {
    return (
      <span className="text-xs text-tertiary" aria-label={`${label}: no history yet`}>
        no history
      </span>
    );
  }
  const first = xs[0];
  const last = xs[xs.length - 1];
  const delta = Math.round((last - first) * 10) / 10;
  const trend = xs.length < 2 ? "one score" : delta > 0 ? `up ${delta}` : delta < 0 ? `down ${Math.abs(delta)}` : "flat";
  const stroke = delta > 0 ? "var(--color-bull)" : delta < 0 ? "var(--color-bear)" : "var(--color-tertiary)";
  const d = sparklinePath(xs, width, height);
  const lastX = xs.length === 1 ? 2 : width - 2;
  const min = Math.min(...xs);
  const max = Math.max(...xs);
  const lastY = height - 2 - ((last - min) / (max - min || 1)) * (height - 4);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${xs.length} score${xs.length === 1 ? "" : "s"}, ${trend}`} className="shrink-0" data-testid="sparkline" data-trend={delta > 0 ? "up" : delta < 0 ? "down" : "flat"}>
      <title>{`${label}: ${trend}`}</title>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}
