"use client";

// Client cell for the "Pipeline" column on the reseller customers table.
//
// Shows the persisted channel-partner stage (reseller_customers.stage,
// migration 0333) with an auto/manual marker. Owners and admins of the
// reseller get a <select> that POSTs /api/reseller/customers/[id]/stage —
// the route re-checks role + attribution server-side and writes the
// reseller_audit_log row; viewers only see the badge.
//
// EN/VI follows the same useLocale() cookie as the rest of the console.
// See web/src/lib/reseller/customer-stage.ts (G2 #7, S19-B).

import { useState } from "react";

import {
  CUSTOMER_STAGES,
  CUSTOMER_STAGE_LABELS,
  type CustomerStage,
  type CustomerStageSource,
} from "@/lib/reseller/customer-stage";
import { useLocale } from "@/lib/use-locale";

interface Props {
  customerId: string;
  stage: CustomerStage;
  source: CustomerStageSource;
  updatedAt: string | null;
  canOverride: boolean;
}

const STAGE_TONE: Record<CustomerStage, string> = {
  lead: "bg-surface-100 text-ink-700",
  onboarded: "bg-sky-50 text-sky-800",
  scored: "bg-brand-50 text-brand-800",
  data_room: "bg-violet-50 text-violet-800",
  fundraising: "bg-amber-50 text-amber-800",
  invested: "bg-emerald-50 text-emerald-800",
  churned: "bg-rose-50 text-rose-800",
};

export function PipelineStageCell({ customerId, stage, source, updatedAt, canOverride }: Props) {
  const [locale] = useLocale();
  const [current, setCurrent] = useState<CustomerStage>(stage);
  const [currentSource, setCurrentSource] = useState<CustomerStageSource>(source);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = (s: CustomerStage) =>
    locale === "vi" ? CUSTOMER_STAGE_LABELS[s].label_vi : CUSTOMER_STAGE_LABELS[s].label_en;
  const sourceLabel =
    currentSource === "manual"
      ? locale === "vi" ? "thủ công" : "manual"
      : locale === "vi" ? "tự động" : "auto";
  const title = `${CUSTOMER_STAGE_LABELS[current].hint_en}${updatedAt ? ` · ${updatedAt.slice(0, 10)}` : ""}`;

  async function onChange(next: CustomerStage) {
    if (next === current || busy) return;
    const previous = current;
    const previousSource = currentSource;
    setBusy(true);
    setError(null);
    setCurrent(next);
    setCurrentSource("manual");
    try {
      const res = await fetch(`/api/reseller/customers/${encodeURIComponent(customerId)}/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ stage: next }),
      });
      const json = (await res.json().catch(() => null)) as { ok?: boolean; reason?: string } | null;
      if (!res.ok || !json?.ok) {
        setCurrent(previous);
        setCurrentSource(previousSource);
        setError(json?.reason ?? `HTTP ${res.status}`);
      }
    } catch {
      setCurrent(previous);
      setCurrentSource(previousSource);
      setError("network");
    } finally {
      setBusy(false);
    }
  }

  const badge = (
    <span
      data-pipeline-stage={current}
      data-pipeline-source={currentSource}
      title={title}
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STAGE_TONE[current]}`}
    >
      {label(current)}
      <span className="ml-1 text-[10px] font-normal opacity-70">· {sourceLabel}</span>
    </span>
  );

  if (!canOverride) return badge;

  return (
    <div className="flex flex-col gap-1">
      {badge}
      <select
        aria-label={locale === "vi" ? "Đổi giai đoạn" : "Change stage"}
        className="w-full max-w-[11rem] rounded border border-surface-300 bg-white px-1.5 py-0.5 text-xs text-ink-700 disabled:opacity-60"
        value={current}
        disabled={busy}
        onChange={(e) => void onChange(e.target.value as CustomerStage)}
      >
        {CUSTOMER_STAGES.map((s) => (
          <option key={s} value={s}>
            {label(s)}
          </option>
        ))}
      </select>
      {error ? (
        <span className="text-[10px] text-red-600" role="alert">
          {locale === "vi" ? "Không lưu được" : "Not saved"}: {error}
        </span>
      ) : null}
    </div>
  );
}
