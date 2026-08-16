/**
 * LogoBand — Platform stats strip.
 * Server component (no interactivity needed).
 */

import { cn } from "@/lib/utils";

const STATS = [
  { value: "200+", label: "AU startups analysed" },
  { value: "A$180M+", label: "value indexed" },
  { value: "50+", label: "investors active" },
  { value: "4.9★", label: "founder rating" },
];

export function LogoBand({ className }: { className?: string }) {
  return (
    <section
      aria-label="Platform statistics"
      className={cn("border-y py-10", className)}
      style={{
        backgroundColor: "#0A0F1E",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div className="mx-auto max-w-5xl px-6">
        <p
          className="mb-8 text-center text-xs uppercase tracking-[0.2em]"
          style={{ color: "#94A3B8" }}
        >
          Trusted by AU founders
        </p>
        <div className="flex flex-wrap items-center justify-center gap-8 sm:gap-16">
          {STATS.map((stat, i) => (
            <div key={stat.value} className="flex items-center gap-8 sm:gap-16">
              <div className="flex flex-col items-center gap-1 text-center">
                <span
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: "#F8FAFC" }}
                >
                  {stat.value}
                </span>
                <span
                  className="text-xs uppercase tracking-[0.12em]"
                  style={{ color: "#94A3B8" }}
                >
                  {stat.label}
                </span>
              </div>
              {i < STATS.length - 1 && (
                <span
                  aria-hidden
                  className="hidden sm:block text-xl select-none"
                  style={{ color: "rgba(255,255,255,0.12)" }}
                >
                  |
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
