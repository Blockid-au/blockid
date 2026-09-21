"use client";

// Retention form (G21 P3-B) — `org_settings.retention_days` + the audit
// export switch, saved through PATCH /api/org/settings. Explains exactly
// what the weekly cron deletes (docs/ops/retention.md) before the owner
// turns it on; "Keep everything" (null) is the default.

import { useState, type FormEvent } from "react";
import { userErrorMessage } from "@/lib/ui/user-error";

export const RETENTION_PRESETS = [
  { value: "", label: "Keep everything (default)" },
  { value: "90", label: "90 days" },
  { value: "180", label: "180 days" },
  { value: "365", label: "1 year" },
  { value: "730", label: "2 years" },
  { value: "1095", label: "3 years" },
] as const;

export interface RetentionFormProps {
  initialRetentionDays: number | null;
  initialAuditExportEnabled: boolean;
  /** False before migration 0428 — the form renders read-only with the reason. */
  available: boolean;
}

export function RetentionForm({ initialRetentionDays, initialAuditExportEnabled, available }: RetentionFormProps) {
  const initial = initialRetentionDays == null ? "" : String(initialRetentionDays);
  const preset = RETENTION_PRESETS.some((p) => p.value === initial);
  const [choice, setChoice] = useState<string>(preset ? initial : "custom");
  const [custom, setCustom] = useState<string>(preset ? "" : initial);
  const [auditExport, setAuditExport] = useState<boolean>(initialAuditExportEnabled);
  const [state, setState] = useState<{ kind: "idle" | "saving" | "saved" | "error"; message?: string }>({ kind: "idle" });

  const effectiveDays: number | null = choice === "" ? null : choice === "custom" ? (custom.trim() === "" ? null : Number(custom)) : Number(choice);
  const customInvalid = choice === "custom" && custom.trim() !== "" && (!Number.isInteger(Number(custom)) || Number(custom) < 30 || Number(custom) > 3650);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (customInvalid) {
      setState({ kind: "error", message: "Enter a whole number of days between 30 and 3650, or choose Keep everything." });
      return;
    }
    setState({ kind: "saving" });
    try {
      const res = await fetch("/api/org/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ retention_days: effectiveDays, audit_export_enabled: auditExport }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !body.ok) {
        setState({ kind: "error", message: userErrorMessage({ status: res.status, body }, "The settings could not be saved. Please try again.") });
        return;
      }
      setState({ kind: "saved", message: effectiveDays == null ? "Saved — everything is kept." : `Saved — organisation artefacts older than ${effectiveDays} days are deleted on the weekly run.` });
    } catch (err) {
      setState({ kind: "error", message: userErrorMessage(err, "The settings could not be saved. Please try again.") });
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6" data-testid="retention-form" aria-describedby="retention-help">
      <fieldset disabled={!available || state.kind === "saving"} className="space-y-4">
        <legend className="text-sm font-semibold text-ink-800">Retention window</legend>
        <p id="retention-help" className="text-sm text-ink-600">
          Once a week, artefacts your organisation created that are older than the window are deleted: cohort snapshots, intake submissions and reviewer overrides on your cohorts. Founders&apos; startups, scores, evidence and claims are never touched — they belong to the founder. Audit rows are never deleted.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {RETENTION_PRESETS.map((p) => (
            <label key={p.value || "keep"} className="flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
              <input type="radio" name="retention" value={p.value} checked={choice === p.value} onChange={() => setChoice(p.value)} />
              {p.label}
            </label>
          ))}
          <label className="flex items-center gap-2 rounded-lg border border-surface-200 px-3 py-2 text-sm has-[:checked]:border-brand-400 has-[:checked]:bg-brand-50">
            <input type="radio" name="retention" value="custom" checked={choice === "custom"} onChange={() => setChoice("custom")} />
            Custom
            <input
              type="number"
              inputMode="numeric"
              min={30}
              max={3650}
              step={1}
              value={custom}
              onChange={(e) => {
                setChoice("custom");
                setCustom(e.target.value);
              }}
              aria-label="Custom retention in days (30–3650)"
              aria-invalid={customInvalid || undefined}
              className="ml-auto w-24 rounded border border-surface-200 px-2 py-1 text-right tabular-nums"
              placeholder="days"
            />
          </label>
        </div>
        {customInvalid ? <p className="text-xs text-red-700">Between 30 and 3650 days.</p> : null}
        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={auditExport} onChange={(e) => setAuditExport(e.target.checked)} className="mt-0.5" />
          <span>
            Allow the audit-log CSV export for this organisation (<a href="/workspace/settings/audit" className="underline">Settings → Audit log</a>). Every export is itself recorded on the audit log.
          </span>
        </label>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={!available || state.kind === "saving" || customInvalid} className="rounded-md bg-ink-800 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          {state.kind === "saving" ? "Saving…" : "Save retention settings"}
        </button>
        {state.kind === "saved" ? (
          <p className="text-sm text-emerald-700" role="status" data-testid="retention-saved">
            {state.message}
          </p>
        ) : null}
        {state.kind === "error" ? (
          <p className="text-sm text-red-700" role="alert" data-testid="retention-error">
            {state.message}
          </p>
        ) : null}
        {!available ? (
          <p className="text-sm text-ink-600" data-testid="retention-unavailable">
            Organisation settings are being provisioned on this deployment — the form unlocks once the settings table is live.
          </p>
        ) : null}
      </div>
    </form>
  );
}
