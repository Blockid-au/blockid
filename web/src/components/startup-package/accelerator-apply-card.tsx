"use client";

/**
 * Startup Package — Accelerator applications card.
 *
 * Founder picks an accelerator from a dropdown, clicks "Draft application",
 * we hit /api/startup-package/deliverable/accelerator-apply and show the
 * generated download link inline. Uses the same paywall nudge as the
 * Phase deliverables.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Rocket, Sparkles, XCircle } from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePaywall } from "@/components/sales/paywall-nudge";
import { PACKAGE_FEATURE_COST_DEFAULTS as FEATURE_COSTS } from "@/lib/startup-package/deliverable-registry-types";

export interface AcceleratorOption {
  slug: string;
  name: string;
  region: string;
  cohort: string;
  url: string;
}

interface Props {
  projectId: string;
  creditBalance: number;
  currentPlan?: string;
  accelerators: AcceleratorOption[];
}

interface Result {
  ok: boolean;
  message: string;
  downloadUrl?: string;
  programName?: string;
  programUrl?: string;
}

export function AcceleratorApplyCard({
  projectId,
  creditBalance,
  currentPlan,
  accelerators,
}: Props) {
  const router = useRouter();
  const { openPaywall } = usePaywall();
  const [selected, setSelected] = React.useState<string>(
    accelerators[0]?.slug ?? "",
  );
  const [pending, setPending] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  const cost = FEATURE_COSTS.accelerator_apply ?? 1.0;
  const canAffordNow = creditBalance >= cost;

  async function handleClick() {
    if (!selected) return;

    if (!canAffordNow) {
      openPaywall({
        feature: "accelerator_apply",
        featureLabel: "Accelerator application draft",
        currentPlan,
        requiredPlan: "founder_growth",
        segment: "founder",
        benefit: `You need ${cost.toFixed(2)} credits to draft an accelerator application. Top up or upgrade to keep going.`,
      });
      try {
        (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
          "event",
          "accelerator_apply_nudge",
          { accelerator: selected, balance: creditBalance, cost },
        );
      } catch {
        /* ignore */
      }
      return;
    }

    setPending(true);
    setResult(null);
    try {
      const res = await fetch(
        "/api/startup-package/deliverable/accelerator-apply",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            project_id: projectId,
            accelerator_slug: selected,
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        downloadUrl?: string | null;
        program?: { name?: string; url?: string };
      };
      if (!res.ok || !json.ok) {
        setResult({
          ok: false,
          message: json.error ?? `Request failed (${res.status})`,
        });
        return;
      }
      setResult({
        ok: true,
        message: "Draft added to your dataroom.",
        downloadUrl: json.downloadUrl ?? undefined,
        programName: json.program?.name,
        programUrl: json.program?.url,
      });
      try {
        (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag?.(
          "event",
          "accelerator_apply_generated",
          { accelerator: selected },
        );
      } catch {
        /* ignore */
      }
      router.refresh();
    } catch (err) {
      setResult({
        ok: false,
        message: err instanceof Error ? err.message : "Network error",
      });
    } finally {
      setPending(false);
    }
  }

  const selectedProgram = accelerators.find((a) => a.slug === selected);

  return (
    <Card variant="elevated" className="p-5">
      <header className="mb-4 flex items-start gap-3">
        <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
          <Rocket aria-hidden="true" className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-bold text-ink-900">
            Accelerator applications
          </h3>
          <p className="mt-0.5 text-xs text-ink-500">
            Pick a program — the drafter turns your interview + SVI into
            per-question answers you can edit before submitting.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <label
            htmlFor="accelerator-select"
            className="mb-1 block text-xs font-semibold uppercase tracking-wider text-ink-500"
          >
            Program
          </label>
          <select
            id="accelerator-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="w-full rounded-lg border border-surface-200 bg-white px-3 py-2 text-sm text-ink-800 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
            disabled={pending || accelerators.length === 0}
          >
            {accelerators.map((a) => (
              <option key={a.slug} value={a.slug}>
                {a.name} — {a.cohort} ({a.region})
              </option>
            ))}
          </select>
          {selectedProgram?.url && (
            <a
              href={selectedProgram.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 inline-block text-[11px] text-ink-400 hover:underline"
            >
              Program site: {selectedProgram.url}
            </a>
          )}
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
            {cost.toFixed(2)} cr
          </span>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleClick}
            disabled={pending || !selected}
          >
            {pending ? (
              <>
                <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                Drafting…
              </>
            ) : (
              <>
                <Sparkles aria-hidden="true" className="h-3.5 w-3.5" />
                Draft application
              </>
            )}
          </Button>
        </div>
      </div>

      {result && (
        <div
          className={cn(
            "mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-xs",
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
                Download draft PDF
              </a>
            )}
            {result.ok && result.programUrl && (
              <p className="mt-1 text-[11px] opacity-80">
                Submit at{" "}
                <a
                  href={result.programUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline"
                >
                  {result.programUrl}
                </a>
              </p>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}
