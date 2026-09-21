"use client";

import type { Dispatch } from "react";
import { Rocket, TrendingUp, Building, Users, Layers } from "lucide-react";
import type { Segment, WizardAction } from "./wizard-types";

const SEGMENTS: {
  id: Segment;
  label: string;
  tagline: string;
  icon: typeof Rocket;
}[] = [
  {
    id: "founder",
    label: "Founder",
    tagline: "Validate your idea, score your startup, raise faster.",
    icon: Rocket,
  },
  {
    id: "investor_angel",
    label: "Angel Investor",
    tagline: "Screen deals and track your personal watchlist.",
    icon: TrendingUp,
  },
  {
    id: "investor_vc",
    label: "VC / Fund",
    tagline: "Run a deal-flow pipeline and monitor your portfolio.",
    icon: Building,
  },
  {
    id: "advisor",
    label: "Advisor",
    tagline: "Manage clients with white-label reports and digests.",
    icon: Users,
  },
  {
    id: "accelerator",
    label: "Accelerator",
    tagline: "Run a cohort with LP-ready reporting at scale.",
    icon: Layers,
  },
];

export function StepSegment({
  dispatch,
}: {
  dispatch: Dispatch<WizardAction>;
}) {
  function choose(segment: Segment) {
    dispatch({ type: "SET_SEGMENT", segment });
    dispatch({ type: "NEXT" });
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-primary sm:text-3xl">
        Who are you?
      </h1>
      <p className="mt-2 text-muted">
        We&apos;ll tailor your setup, goals and plan to match.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SEGMENTS.map(({ id, label, tagline, icon: Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => choose(id)}
            className="group flex flex-col items-start gap-3 rounded-2xl border border-line-subtle bg-surface p-6 text-left transition-all hover:border-line-strong hover:bg-surface-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
          >
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-action/10 text-action transition-colors group-hover:bg-action/15">
              <Icon aria-hidden="true" className="h-5 w-5" />
            </div>
            <div>
              <p className="font-semibold text-primary">{label}</p>
              <p className="mt-1 text-sm text-muted">{tagline}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
