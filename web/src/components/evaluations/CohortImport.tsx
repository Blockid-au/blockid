"use client";

// CohortImport — the CSV upload control on the BlockID Cohort header (G21
// P2-A). File input → POST /api/evaluations/batch/[id]/import.csv (multipart)
// → result table (imported / skipped by line with the reason) + a link to
// the sample file at /samples/cohort-import.csv. Calls `onImported` so the
// page can refresh (router.refresh()) once rows landed; the runner scores
// them off-peak.

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Download, Loader2, Upload } from "lucide-react";
import type { ImportSkip } from "@/lib/evaluations/cohort-import";

export const SAMPLE_CSV_HREF = "/samples/cohort-import.csv";

export interface CohortImportResult {
  ok: boolean;
  imported?: number;
  skipped?: ImportSkip[];
  cap?: { used: number; max: number | null; remaining: number | null };
  invites_sent?: number;
  error?: string;
  message?: string;
  needed?: number;
}

export interface CohortImportProps {
  batchId: string;
  /** From the paid pilot; null = uncapped. Shown next to the control. */
  applicantsCap?: number | null;
  /** Items already in the cohort (header count). */
  used?: number;
  onImported?: (result: CohortImportResult) => void;
}

const REASON_LABEL: Record<string, string> = {
  empty_row: "Empty row",
  missing_company: "No company name",
  company_too_long: "Company name too long",
  invalid_url: "Website is not a valid URL",
  invalid_email: "Contact e-mail is not valid",
  invalid_deck_url: "Deck link is not valid",
  invalid_abn: "ABN must be 11 digits",
  invalid_stage: "Unknown stage",
  duplicate_in_file: "Duplicate inside the file",
  duplicate_in_cohort: "Already in this cohort",
  too_many_rows: "Over the per-import limit",
  plan_limit: "Plan limit reached",
  create_failed: "Could not create the startup",
};

export function reasonLabel(reason: string): string {
  return REASON_LABEL[reason] ?? reason.replace(/_/g, " ");
}

export function CohortImport({ batchId, applicantsCap = null, used = 0, onImported }: CohortImportProps) {
  const router = useRouter();
  const inputId = React.useId();
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<CohortImportResult | null>(null);
  const [fileName, setFileName] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  async function upload(file: File) {
    setBusy(true);
    setResult(null);
    setFileName(file.name);
    try {
      const fd = new FormData();
      fd.append("file", file, file.name);
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/import.csv`, { method: "POST", body: fd });
      const json = (await res.json().catch(() => ({ ok: false, error: "invalid_response" }))) as CohortImportResult;
      const out: CohortImportResult = res.ok ? json : { ...json, ok: false, message: json.message ?? (res.status === 429 ? "Too many imports — try again in a while." : "Import failed") };
      setResult(out);
      if (out.ok) {
        onImported?.(out);
        router.refresh();
      }
    } catch {
      setResult({ ok: false, error: "network", message: "Network error. Please try again." });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const remaining = applicantsCap == null ? null : Math.max(0, applicantsCap - used);

  return (
    <div className="space-y-2" data-testid="cohort-import">
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor={inputId}
          className={`inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 transition-colors hover:bg-brand-50 ${busy ? "pointer-events-none opacity-60" : ""}`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Upload className="h-4 w-4" aria-hidden="true" />}
          {busy ? "Importing…" : "Import CSV"}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          disabled={busy}
          data-testid="cohort-import-input"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void upload(f);
          }}
        />
        <a href={SAMPLE_CSV_HREF} download className="inline-flex min-h-11 items-center gap-1.5 px-2 text-xs font-medium text-ink-600 hover:text-brand-700" data-testid="cohort-import-sample">
          <Download className="h-3.5 w-3.5" aria-hidden="true" />
          Sample CSV
        </a>
        {applicantsCap != null ? (
          <span className="text-xs text-ink-500" data-testid="cohort-import-cap">
            {used} of {applicantsCap} pilot places used{remaining === 0 ? " — cap reached" : ""}
          </span>
        ) : null}
      </div>
      <p className="text-xs text-ink-500">
        Columns: <code>company, url, contact_email, stage, sector, deck_url</code> (header row required, up to 2 MB). Each row becomes a startup you evaluate; founders with an e-mail are invited to claim their profile.
      </p>

      {result ? (
        <div
          role="status"
          aria-live="polite"
          className={`rounded-xl border px-4 py-3 text-sm ${result.ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}
          data-testid="cohort-import-result"
        >
          <div className="flex items-start gap-2">
            {result.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              {result.ok ? (
                <p>
                  <strong>{result.imported ?? 0}</strong> startup{result.imported === 1 ? "" : "s"} imported{fileName ? ` from ${fileName}` : ""}
                  {result.invites_sent ? ` · ${result.invites_sent} founder invite${result.invites_sent === 1 ? "" : "s"} sent` : ""}
                  {result.skipped && result.skipped.length > 0 ? ` · ${result.skipped.length} row${result.skipped.length === 1 ? "" : "s"} skipped` : ""}. New rows score off-peak tonight.
                </p>
              ) : (
                <p>
                  {result.message ?? "Import failed"}
                  {result.error === "cap_reached" && result.cap ? ` (${result.cap.used} of ${result.cap.max} used)` : ""}
                </p>
              )}
              {result.skipped && result.skipped.length > 0 ? (
                <table className="mt-2 w-full text-xs">
                  <caption className="sr-only">Skipped rows</caption>
                  <thead>
                    <tr className="text-left text-ink-500">
                      <th scope="col" className="pr-3 font-medium">Line</th>
                      <th scope="col" className="pr-3 font-medium">Reason</th>
                      <th scope="col" className="font-medium">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.skipped.slice(0, 50).map((s) => (
                      <tr key={`${s.line}-${s.reason}`}>
                        <td className="pr-3 tabular-nums">{s.line}</td>
                        <td className="pr-3">{reasonLabel(s.reason)}</td>
                        <td className="text-ink-600">{s.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : null}
              {result.skipped && result.skipped.length > 50 ? <p className="mt-1 text-xs text-ink-500">Showing the first 50 of {result.skipped.length} skipped rows.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
