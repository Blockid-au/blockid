/**
 * HowItWorksSection — 3-step numbered process.
 * Server component.
 */

import { cn } from "@/lib/utils";

const STEPS = [
  {
    number: "01",
    title: "Create your startup profile",
    description:
      "Add your idea, MVP status, team, traction and stage. Takes under 2 minutes — no signup required to preview.",
  },
  {
    number: "02",
    title: "Run AI analysis",
    description:
      "Our 50+ AI agents score your Startup Value Index, benchmark competitors and surface your strengths and gaps.",
  },
  {
    number: "03",
    title: "Follow your guided roadmap",
    description:
      "Get a personalised action plan — fundraising, GTM, cap table, accelerators — with real AU benchmarks at every step.",
  },
];

export function HowItWorksSection({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="how-heading"
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
            className="font-display text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: "#F8FAFC" }}
          >
            From idea to investor-ready in 3 steps
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
                    className="mb-2 font-display text-lg font-semibold"
                    style={{ color: "#F8FAFC" }}
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
