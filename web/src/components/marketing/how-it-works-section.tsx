/**
 * HowItWorksSection — 3-step numbered process.
 * Server component.
 */

import { cn } from "@/lib/utils";

// Fintech v2 (2026-09-08): 4 steps, weighted 3:1 AI:blockchain to match
// the homepage's 70/30 story. Steps 01-03 are all about analysis; step 04
// is where the platform's paid layer (tokenized equity on subscription)
// enters. Copy is short — the depth lives on /how-it-works and /tokenize.
const STEPS = [
  {
    number: "01",
    title: "Paste",
    description:
      "Pitch deck, URL, or free-text idea — the omnibox classifies the input and routes it to the right analyzer.",
  },
  {
    number: "02",
    title: "AI analyses",
    description:
      "13 evaluation criteria across the 8 SVI dimensions (FTV, MPC, PTD, TRE, CGH, IRI, LCO, SVM).",
  },
  {
    number: "03",
    title: "Get score + valuation",
    description:
      "Berkus, VC, DCF and comparable-company methods — one AUD range plus an evidence-linked SVI score.",
  },
  {
    number: "04",
    title: "Subscribe → tokenize equity",
    description:
      "On a paid plan, issue on-chain shares on the private EVM. MetaMask-ready, ESOP + vesting enforced by contract.",
  },
];

export function HowItWorksSection({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="how-heading"
      data-theme="dark"
      className={cn("border-t py-24", className)}
      style={{
        backgroundColor: "#0A0F1E",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div className="mx-auto max-w-5xl px-6">
        {/* Section header */}
        <div className="mb-14 text-center">
          <p
            className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em]"
            style={{ color: "#94A3B8" }}
          >
            How it works
          </p>
          <h2
            id="how-heading"
            className="font-display text-3xl font-bold tracking-tight sm:text-4xl text-primary"
          >
            From input to on-chain equity in 4 steps
          </h2>
        </div>

        {/* Steps */}
        <ol className="flex flex-col gap-10 md:flex-row md:gap-8">
          {STEPS.map((step, i) => (
            <li key={step.number} className="flex-1">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start md:flex-col">
                {/* Number badge */}
                <div
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full font-display text-sm font-bold"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(0,212,255,0.15) 0%, rgba(0,102,255,0.15) 100%)",
                    border: "1px solid rgba(0,212,255,0.25)",
                    color: "#00D4FF",
                  }}
                  aria-label={`Step ${i + 1}`}
                >
                  {step.number}
                </div>

                {/* Connector line (hidden on md flex-col) */}
                {i < STEPS.length - 1 && (
                  <div
                    className="hidden md:block md:mt-6 md:h-px md:flex-1"
                    aria-hidden
                    style={{
                      background:
                        "linear-gradient(90deg, rgba(0,212,255,0.3) 0%, rgba(0,102,255,0.1) 100%)",
                    }}
                  />
                )}

                <div>
                  <h3
                    className="mb-2 font-display text-lg font-semibold text-primary"
                  >
                    {step.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
                    {step.description}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
