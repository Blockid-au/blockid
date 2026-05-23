import { Briefcase, BarChart3, Bell } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

const benefits = [
  {
    icon: Briefcase,
    title: "Aggregate portfolio dashboard",
    body: "Every BlockID company you have invested in, in one view.",
  },
  {
    icon: BarChart3,
    title: "Standardised quarterly reports",
    body: "Auto-generated. No more chasing founders for KPIs.",
  },
  {
    icon: Bell,
    title: "Live raise notifications",
    body: "Know the moment a portco starts a new round.",
  },
];

export function InvestorPack() {
  return (
    <section
      aria-labelledby="investor-pack-title"
      className="py-24 md:py-32"
    >
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              For VCs · Free
            </p>
            <h2
              id="investor-pack-title"
              className="mt-3 text-3xl md:text-5xl font-semibold tracking-tight text-ink-800"
            >
              Investor Welcome Pack
            </h2>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-400">
              Free for every Australian VC, family office and angel syndicate.
              Your portfolio companies get BlockID. You get standardised
              reporting, live raise signals, and a single place to see the data.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Link href="/founding-50">
                <Button variant="primary" size="lg" className="w-full sm:w-auto">
                  Claim free Welcome Pack
                </Button>
              </Link>
              <Link href="/contact">
                <Button variant="secondary" size="lg" className="w-full sm:w-auto">
                  Talk to our team
                </Button>
              </Link>
            </div>
          </div>
          <div className="grid sm:grid-cols-1 gap-4">
            {benefits.map((b) => {
              const Icon = b.icon;
              return (
                <div
                  key={b.title}
                  className="flex items-start gap-4 rounded-2xl border border-surface-200 bg-surface-50 dark:bg-surface-100 p-6"
                >
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-brand-500/15 text-brand-600 ring-1 ring-brand-500/30">
                    <Icon strokeWidth={1.75} className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold text-ink-800">
                      {b.title}
                    </h3>
                    <p className="mt-1 text-sm leading-relaxed text-ink-400">
                      {b.body}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
