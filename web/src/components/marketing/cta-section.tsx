/**
 * CTASection — Bottom call-to-action with gradient border card.
 * Server component.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function CTASection({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="cta-heading"
      className={cn("border-t py-24", className)}
      style={{
        backgroundColor: "#0A0F1E",
        borderColor: "rgba(255,255,255,0.08)",
      }}
    >
      <div className="mx-auto max-w-3xl px-6 text-center">
        {/* Gradient-border card */}
        <div
          className="relative rounded-2xl p-[2px]"
          style={{
            background:
              "linear-gradient(135deg, #00D4FF 0%, #0066FF 50%, #7B2FBE 100%)",
          }}
        >
          <div
            className="relative rounded-2xl px-8 py-14 sm:px-14"
            style={{ backgroundColor: "#111827" }}
          >
            {/* Subtle inner glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 rounded-2xl"
              style={{
                background:
                  "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(0,212,255,0.08) 0%, transparent 70%)",
              }}
            />

            <p
              className="relative mb-4 font-mono text-[11px] uppercase tracking-[0.28em]"
              style={{ color: "#94A3B8" }}
            >
              Free to start · No credit card
            </p>

            <h2
              id="cta-heading"
              className="relative mb-4 font-display text-3xl font-bold tracking-tight sm:text-4xl"
              style={{ color: "#F8FAFC" }}
            >
              Know what your startup is worth — before you pitch
            </h2>

            <p
              className="relative mb-8 text-base leading-relaxed"
              style={{ color: "#94A3B8" }}
            >
              Join 2,400+ Australian founders who use BlockID to analyse, benchmark and grow their startup value.
            </p>

            <div className="relative flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Link
                href="/auth/login"
                className="inline-flex items-center gap-2 rounded-xl px-8 py-3.5 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00D4FF] focus-visible:ring-offset-2 active:translate-y-0"
                style={{
                  background:
                    "linear-gradient(135deg, #00D4FF 0%, #0066FF 100%)",
                  boxShadow: "0 4px 24px -4px rgba(0,212,255,0.4)",
                }}
              >
                Start Free
                <ArrowRight size={16} aria-hidden />
              </Link>

              <Link
                href="/index"
                className="inline-flex items-center gap-2 rounded-xl border px-8 py-3.5 text-sm font-semibold transition-all duration-200 hover:border-[rgba(0,212,255,0.4)] hover:text-white"
                style={{
                  borderColor: "rgba(255,255,255,0.12)",
                  color: "#94A3B8",
                }}
              >
                View Live Index
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
