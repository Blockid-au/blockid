import { Building2, Sparkles, FlaskConical, ScrollText } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface ComplianceItem {
  icon: LucideIcon;
  code: string;
  title: string;
  body: string;
}

const items: ComplianceItem[] = [
  {
    icon: Building2,
    code: "ASIC",
    title: "ABR & ASIC sync",
    body: "Auto-pull company registration, directors and share structure straight from the Australian Business Register.",
  },
  {
    icon: Sparkles,
    code: "ESIC",
    title: "ESIC eligibility",
    body: "Flag whether your company qualifies for early-stage investor tax incentives — worth $200k–$500k to an angel.",
  },
  {
    icon: FlaskConical,
    code: "R&D",
    title: "R&D tax incentive",
    body: "Surface eligible R&D spend across your accounting feed so your accountant can lodge with confidence.",
  },
  {
    icon: ScrollText,
    code: "AUSTRAC",
    title: "AUSTRAC alignment",
    body: "Built for the future marketplace — KYC and AML controls that will pass institutional capital tests.",
  },
];

export function Compliance() {
  return (
    <section
      aria-labelledby="compliance-title"
      className="py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="max-w-3xl">
          <p className="text-xs uppercase tracking-[0.2em] text-teal-400 font-medium">
            The Australian moat
          </p>
          <h2
            id="compliance-title"
            className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-slate-50"
          >
            Compliance modules no US competitor ships
          </h2>
          <p className="mt-4 text-base md:text-lg leading-relaxed text-slate-400">
            Carta is US-centric. Pulley is US-centric. BlockID is built around
            the four AU regimes that decide whether a raise actually closes.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.code}
                className="group rounded-2xl border border-ink-700 bg-ink-800 p-6 transition-colors duration-200 hover:border-teal-500/40 tile-glow"
              >
                <div className="flex items-center gap-3">
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-teal-500/15 text-teal-300 ring-1 ring-teal-500/30">
                    <Icon strokeWidth={1.75} className="h-5 w-5" />
                  </span>
                  <span className="font-mono tabular-nums text-sm text-slate-300">
                    {item.code}
                  </span>
                </div>
                <h3 className="mt-4 text-lg font-semibold text-slate-50">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">
                  {item.body}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
