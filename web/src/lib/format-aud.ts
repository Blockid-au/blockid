// S17-B — client-safe compact AUD formatter shared by the valuation band
// chart (Recharts tick / tooltip) and the connected-revenue bridge label.
// Lives apart from lib/valuation.ts so client components do not pull the
// valuation engine (and its AU comparables data) into the bundle.

export function formatAudCompact(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) return `${sign}A$${(abs / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `${sign}A$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}A$${(abs / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}K`;
  return `${sign}A$${Math.round(abs).toLocaleString("en-AU")}`;
}
