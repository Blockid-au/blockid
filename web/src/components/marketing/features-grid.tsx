/**
 * FeaturesGrid — 6 glassmorphism feature cards.
 * Server component.
 */

import {
  Telescope,
  MapPin,
  DollarSign,
  PieChart,
  Rocket,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ComponentType } from "react";

interface Feature {
  icon: ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>;
  iconColor: string;
  title: string;
  description: string;
}

const FEATURES: Feature[] = [
  {
    icon: Telescope,
    iconColor: "#00D4FF",
    title: "Competitor Intelligence",
    description:
      "Map your competitive landscape with AI-powered analysis across 2,400+ AU startups.",
  },
  {
    icon: MapPin,
    iconColor: "#0066FF",
    title: "GTM Strategy",
    description:
      "Generate a go-to-market playbook tailored to your segment, stage and target market.",
  },
  {
    icon: DollarSign,
    iconColor: "#00D4FF",
    title: "Valuation Engine",
    description:
      "Get an AUD valuation range grounded in real AU pre-seed, seed and Series A benchmarks.",
  },
  {
    icon: PieChart,
    iconColor: "#7B2FBE",
    title: "Cap Table",
    description:
      "ASIC-compliant cap tables, ESOP modelling and dilution forecasts — built for AU law.",
  },
  {
    icon: Rocket,
    iconColor: "#0066FF",
    title: "Accelerator Match",
    description:
      "Instantly surface the AU accelerators, grants and programs you qualify for right now.",
  },
  {
    icon: TrendingUp,
    iconColor: "#00D4FF",
    title: "Revenue Tracker",
    description:
      "Track MRR, churn, LTV and growth rate to benchmark yourself against AU sector peers.",
  },
];

export function FeaturesGrid({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="features-heading"
      className={cn("py-24", className)}
      style={{ backgroundColor: "#0A0F1E" }}
    >
      <div className="mx-auto max-w-6xl px-6">
        {/* Section header */}
        <div className="mb-14 text-center">
          <p
            className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em]"
            style={{ color: "#94A3B8" }}
          >
            Platform capabilities
          </p>
          <h2
            id="features-heading"
            className="font-display text-3xl font-bold tracking-tight sm:text-4xl"
            style={{ color: "#F8FAFC" }}
          >
            Everything a founder needs
          </h2>
        </div>

        {/* 6-card grid */}
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feat) => {
            const Icon = feat.icon;
            return (
              <article
                key={feat.title}
                className="group relative rounded-2xl p-6 transition-all duration-300 hover:scale-[1.02]"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backdropFilter: "blur(8px)",
                  WebkitBackdropFilter: "blur(8px)",
                }}
              >
                {/* Hover border brightening via overlay */}
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                  style={{ border: "1px solid rgba(0,212,255,0.3)" }}
                  aria-hidden
                />

                <div className="relative">
                  <div
                    className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-xl"
                    style={{
                      background: `${feat.iconColor}18`,
                      border: `1px solid ${feat.iconColor}30`,
                    }}
                  >
                    <Icon size={20} style={{ color: feat.iconColor }} />
                  </div>
                  <h3
                    className="mb-2 font-display text-base font-semibold"
                    style={{ color: "#F8FAFC" }}
                  >
                    {feat.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: "#94A3B8" }}>
                    {feat.description}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
