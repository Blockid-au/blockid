"use client";

// Startup Package — phase-card (center column).
//
// Shows a single growth-phase in detail:
//   - keyQuestions checklist
//   - deliverables list, each with a credit-priced "Auto-fill" button
//   - inline reservation form for the `legal_equity` phase (subgoal 8)
//   - Unicorn Playbook collapsible (subgoal 13's data source — stubbed if
//     the module isn't merged yet)
//
// On "Auto-fill" click:
//   1. Check credits via prop `canAfford()`. If false, open the paywall
//      via `usePaywall().openPaywall(...)` and bail.
//   2. Otherwise POST to `/api/startup-package/deliverable/[slug]`.
//   3. Show inline success / error state. Refresh the router on success so
//      the RSC page re-fetches dataroom + SVI.
//
// SUBGOAL 6 + 8 (spawn-agent-v-d-ng-cosmic-aho plan).

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckSquare, Download, Loader2, Sparkles, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePaywall } from "@/components/sales/paywall-nudge";
import { PACKAGE_FEATURE_COST_DEFAULTS as FEATURE_COSTS } from "@/lib/startup-package/deliverable-registry-types";
import type { GrowthPhase } from "@/lib/startup-growth-phases";
import type { DeliverableEntry } from "@/lib/startup-package/deliverable-registry";
import { ReservedAllocationForm } from "./reserved-allocation-form";
import { UnicornPlaybookCollapsible } from "./unicorn-playbook-collapsible";

interface Props {
  phase: GrowthPhase;
  deliverables: DeliverableEntry[];
  projectId: string;
  creditBalance: number;
  answeredStepKeys: string[];
  reservedAllocation: {
    id: string;
    pct_reserved: number;
    ticker_hint: string | null;
  } | null;
  currentPlan?: string;
}

interface DeliverableResult {
  ok: boolean;
  message: string;
  downloadUrl?: string;
}

export function PhaseCard({
  phase,
  deliverables,
  projectId,
  creditBalance,
  answeredStepKeys,
  reservedAllocation,
  currentPlan,
}: Props) {
  const router = useRouter();
  const { openPaywall } = usePaywall();
  const [pending, setPending] = React.useState<string | null>(null);
  const [results, setResults] = React.useState<Record<string, DeliverableResult>>({});

  async function handleClick(entry: DeliverableEntry) {
    const cost = FEATURE_COSTS[entry.featureKey] ?? 0;

    if (creditBalance < cost) {
      openPaywall({
        feature: "startup_package_deliverable",
        featureLabel: entry.label,
        currentPlan,
        requiredPlan: "founder_growth",
        segment: "founder",
        benefit: `You need ${cost.toFixed(2)} credits to auto-fill ${entry.label}. Top up or upgrade to keep going.`,
      });
      // GA4 signal for the nudge (window.gtag guarded).
      try {
        (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
          "event",
          "package_deliverable_nudge",
          { deliverable: entry.key, phase: phase.id, balance: creditBalance, cost },
        );
      } catch {
        /* ignore */
      }
      return;
    }

    setPending(entry.key);
    try {
      const res = await fetch(
        `/api/startup-package/deliverable/${encodeURIComponent(entry.key)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            phaseId: phase.id,
            deliverableKey: entry.key,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        downloadUrl?: string | null;
      };
      if (!res.ok || !json.ok) {
        setResults((r) => ({
          ...r,
          [entry.key]: {
            ok: false,
            message: json.error ?? `Request failed (${res.status})`,
          },
        }));
        return;
      }
      setResults((r) => ({
        ...r,
        [entry.key]: {
          ok: true,
          message: "Added to your dataroom.",
          downloadUrl: json.downloadUrl ?? undefined,
        },
      }));
      try {
        (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
          "event",
          "package_deliverable_generated",
          { deliverable: entry.key, phase: phase.id },
        );
      } catch {
        /* ignore */
      }
      // Re-fetch RSC data (SVI + dataroom + progress).
      router.refresh();
    } catch (err) {
      setResults((r) => ({
        ...r,
        [entry.key]: {
          ok: false,
          message: err instanceof Error ? err.message : "Network error",
        },
      }));
    } finally {
      setPending(null);
    }
  }

  return (
    <Card
      id={`phase-${phase.id}`}
      variant="elevated"
      className="scroll-mt-24 p-6"
    >
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Phase {phase.order} · {phase.leadAgent.toUpperCase()} lead
        </p>
        <h2 className="mt-1 text-xl font-bold text-ink-900">{phase.title}</h2>
        <p className="mt-1 text-sm text-ink-500">{phase.subtitle}</p>
      </header>

      {/* Key questions */}
      {phase.keyQuestions.length > 0 && (
        <section className="mb-5">
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">
            Key questions to answer
          </h3>
          <ul className="space-y-2">
            {phase.keyQuestions.map((q, i) => {
              const answered = answeredStepKeys.some((k) =>
                k.startsWith(`${phase.id}_q${i + 1}`),
              );
              return (
                <li key={q} className="flex items-start gap-2">
                  <CheckSquare
                    aria-hidden="true"
                    className={cn(
                      "mt-0.5 h-4 w-4 shrink-0",
                      answered ? "text-emerald-500" : "text-ink-300",
                    )}
                  />
                  <span className={cn(
                    "text-sm",
                    answered ? "text-ink-700" : "text-ink-600",
                  )}>
                    {q}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Deliverables */}
      <section className="mb-5">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-500">
          Deliverables
        </h3>
        {deliverables.length === 0 ? (
          <p className="text-sm text-ink-500">
            No auto-fill deliverables yet for this phase — the interview
            wizard writes into your dataroom as answers come in.
          </p>
        ) : (
          <ul className="space-y-3">
            {deliverables.map((d) => {
              const cost = FEATURE_COSTS[d.featureKey] ?? 0;
              const isPending = pending === d.key;
              const result = results[d.key];
              const canAffordNow = creditBalance >= cost;
              return (
                <li
                  key={d.key}
                  className="rounded-2xl border border-surface-200 bg-white p-4"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink-800">{d.label}</p>
                      <p className="mt-0.5 text-xs text-ink-500">{d.blurb}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "rounded-full px-2 py-1 text-[10px] font-semibold uppercase tracking-wider",
                          canAffordNow
                            ? "bg-brand-50 text-brand-700"
                            : "bg-amber-50 text-amber-700",
                        )}
                      >
                        {cost === 0 ? "Free" : `${cost.toFixed(2)} cr`}
                      </span>
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => handleClick(d)}
                        disabled={isPending}
                      >
                        {isPending ? (
                          <>
                            <Loader2
                              aria-hidden="true"
                              className="h-3.5 w-3.5 animate-spin"
                            />
                            Working…
                          </>
                        ) : (
                          <>
                            <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                            Auto-fill
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                  {result && (
                    <div
                      className={cn(
                        "mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
                        result.ok
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-red-50 text-red-700",
                      )}
                      role="status"
                    >
                      {result.ok ? (
                        <Sparkles aria-hidden="true" className="mt-0.5 h-3.5 w-3.5" />
                      ) : (
                        <XCircle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5" />
                      )}
                      <div className="flex-1">
                        <p>{result.message}</p>
                        {result.ok && result.downloadUrl && (
                          <a
                            href={result.downloadUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-1 inline-flex items-center gap-1 font-semibold underline"
                          >
                            <Download aria-hidden="true" className="h-3 w-3" />
                            Download PDF
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Cap-table reservation — legal_equity only (subgoal 8) */}
      {phase.id === "legal_equity" && (
        <section className="mb-5 rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-indigo-700">
            Reserve your equity allocation
          </h3>
          <ReservedAllocationForm
            projectId={projectId}
            initialPct={reservedAllocation?.pct_reserved ?? 20}
            initialTicker={reservedAllocation?.ticker_hint ?? ""}
          />
        </section>
      )}

      {/* Unicorn Playbook — subgoal 13 (stubbed if module missing) */}
      <UnicornPlaybookCollapsible phaseId={phase.id} />
    </Card>
  );
}
