/**
 * HowItWorks — three-step explainer strip that sits directly under the
 * search hero. Server component (no interactivity, no client hooks) so it
 * renders zero JS. Copy is short by design: the hero above IS the CTA.
 */

import { Gauge, Search, Share2 } from "lucide-react";

type Step = {
  icon: typeof Search;
  title: string;
  body: string;
};

const STEPS: readonly Step[] = [
  {
    icon: Search,
    title: "Search",
    body:
      "Enter a company name, ABN, or URL. BlockID pulls public signals and structured filings, so you start with a real profile the first time you type — not a blank form.",
  },
  {
    icon: Gauge,
    title: "Score",
    body:
      "The Startup Value Index grades investor-readiness across 13 criteria in about thirty seconds. Every score cites its evidence, so founders know which specific gaps to close first.",
  },
  {
    icon: Share2,
    title: "Share",
    body:
      "Send a one-click link to co-founders, mentors, or investors. Export the same score as a PDF investor pack when a term sheet conversation is on the table.",
  },
];

export function HowItWorks() {
  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      <div className="mb-10 flex flex-col items-center gap-2 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-cyan">
          How it works
        </p>
        <h2 className="text-2xl font-semibold tracking-tight text-brand-ink sm:text-3xl">
          Search, score, share.
        </h2>
      </div>
      <ul className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6">
        {STEPS.map(({ icon: Icon, title, body }) => (
          <li
            key={title}
            className="flex h-full flex-col gap-4 rounded-2xl border border-brand-ink/10 bg-white/[0.03] p-6 transition-colors duration-200 hover:border-brand-cyan/40"
          >
            <div
              aria-hidden="true"
              className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-cyan/10 text-brand-cyan"
            >
              <Icon className="h-5 w-5" />
            </div>
            <h3 className="text-lg font-semibold text-brand-ink">{title}</h3>
            <p className="text-sm leading-relaxed text-brand-ink-muted">
              {body}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default HowItWorks;
