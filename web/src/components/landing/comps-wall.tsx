import { TrendingUp } from "lucide-react";

interface CompRow {
  ref: string;
  sector: string;
  stage: string;
  arr: string;
  multiple: string;
  delta: string;
  positive: boolean;
}

const rows: CompRow[] = [
  {
    ref: "AU-SAAS-0142",
    sector: "Vertical SaaS · Construction",
    stage: "Seed",
    arr: "$1.4M",
    multiple: "5.1×",
    delta: "+0.8×",
    positive: true,
  },
  {
    ref: "AU-FINTECH-0098",
    sector: "Fintech · Lending",
    stage: "Series A",
    arr: "$3.6M",
    multiple: "6.4×",
    delta: "+1.2×",
    positive: true,
  },
  {
    ref: "AU-MARKET-0211",
    sector: "Marketplace · B2B",
    stage: "Seed",
    arr: "$0.9M",
    multiple: "3.9×",
    delta: "-0.3×",
    positive: false,
  },
  {
    ref: "AU-SAAS-0277",
    sector: "Vertical SaaS · Healthtech",
    stage: "Series A",
    arr: "$4.2M",
    multiple: "7.1×",
    delta: "+1.8×",
    positive: true,
  },
  {
    ref: "AU-DEVTOOL-0064",
    sector: "DevTools",
    stage: "Pre-seed",
    arr: "$0.2M",
    multiple: "8.5×",
    delta: "+2.4×",
    positive: true,
  },
];

export function CompsWall() {
  return (
    <section
      aria-labelledby="comps-title"
      className="py-24 md:py-32 border-y border-surface-300 bg-surface-100"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div className="max-w-2xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-500 font-medium">
              The data moat
            </p>
            <h2
              id="comps-title"
              className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-brand-900"
            >
              Comparable Companies Wall
            </h2>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-600">
              We have valuation data on 500+ Australian SMEs that no US competitor has.
              The credibility line in every pitch.
            </p>
          </div>
          <div className="text-sm text-slate-400">
            <span className="font-mono tabular-nums text-slate-700">5</span> of{" "}
            <span className="font-mono tabular-nums text-slate-700">523</span>{" "}
            anonymised records · sector medians refreshed weekly
          </div>
        </div>

        <div className="mt-10 overflow-x-auto rounded-2xl border border-surface-300 bg-surface-50 dark:bg-surface-100">
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.18em] text-slate-400 border-b border-surface-300">
              <tr>
                <th className="px-5 py-3 font-medium">Reference</th>
                <th className="px-5 py-3 font-medium">Sector</th>
                <th className="px-5 py-3 font-medium">Stage</th>
                <th className="px-5 py-3 font-medium text-right">ARR</th>
                <th className="px-5 py-3 font-medium text-right">Revenue ×</th>
                <th className="px-5 py-3 font-medium text-right">vs. median</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-300">
              {rows.map((r) => (
                <tr key={r.ref} className="hover:bg-surface-100 transition-colors">
                  <td className="px-5 py-4 font-mono tabular-nums text-slate-500 text-xs">
                    {r.ref}
                  </td>
                  <td className="px-5 py-4 text-slate-700">{r.sector}</td>
                  <td className="px-5 py-4 text-slate-600">{r.stage}</td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums text-brand-900">
                    {r.arr}
                  </td>
                  <td className="px-5 py-4 text-right font-mono tabular-nums text-brand-500">
                    {r.multiple}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span
                      className={`inline-flex items-center gap-1 font-mono tabular-nums text-xs ${
                        r.positive ? "text-green-600" : "text-amber-600"
                      }`}
                    >
                      <TrendingUp
                        strokeWidth={1.75}
                        className={`h-3.5 w-3.5 ${r.positive ? "" : "rotate-180"}`}
                      />
                      {r.delta}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
