"use client";

/**
 * ReportOwnerActions — "Download PDF" + "Save to data room" for the signed-in
 * owner of a Money Finder report (T0244, plan §4f).
 *
 *   Download PDF        → GET  /api/funding/report/[id]/pdf (attachment)
 *   Save to data room   → POST /api/funding/report/[id]/save-to-dataroom
 *                          409 = report has no project → link to attach one
 */

import * as React from "react";
import Link from "next/link";
import { Check, Download, FolderPlus, Loader2 } from "lucide-react";

export interface ReportOwnerActionsProps {
  reportId: string;
  /** Null when the report was generated without a project (guest / no default project). */
  projectId: string | null;
  className?: string;
}

type SaveState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "saved"; href: string | null }
  | { kind: "error"; message: string; needsProject?: boolean };

export function ReportOwnerActions({ reportId, projectId, className }: ReportOwnerActionsProps) {
  const [save, setSave] = React.useState<SaveState>({ kind: "idle" });

  async function saveToDataRoom() {
    setSave({ kind: "busy" });
    try {
      const res = await fetch(`/api/funding/report/${encodeURIComponent(reportId)}/save-to-dataroom`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({}),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; downloadUrl?: string | null };
      if (res.status === 409) {
        setSave({ kind: "error", message: data.message ?? "Attach this report to a startup first.", needsProject: true });
        return;
      }
      if (!res.ok || !data.ok) {
        setSave({ kind: "error", message: data.message ?? data.error ?? "Could not save — try again." });
        return;
      }
      setSave({ kind: "saved", href: "/workspace/data-room" });
    } catch {
      setSave({ kind: "error", message: "Network error — check your connection and try again." });
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`} data-report-owner-actions>
      <a
        href={`/api/funding/report/${encodeURIComponent(reportId)}/pdf`}
        className="inline-flex items-center gap-2 rounded-lg border border-line-subtle bg-surface px-4 py-2 text-sm font-semibold text-primary hover:border-line"
        data-download-pdf
      >
        <Download className="h-4 w-4" aria-hidden /> Download PDF
      </a>
      <button
        type="button"
        onClick={saveToDataRoom}
        disabled={save.kind === "busy" || save.kind === "saved"}
        className="inline-flex items-center gap-2 rounded-lg bg-action px-4 py-2 text-sm font-semibold text-on-action hover:bg-action-hover disabled:cursor-not-allowed disabled:opacity-60"
        data-save-dataroom
      >
        {save.kind === "busy" ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        ) : save.kind === "saved" ? (
          <Check className="h-4 w-4" aria-hidden />
        ) : (
          <FolderPlus className="h-4 w-4" aria-hidden />
        )}
        {save.kind === "saved" ? "Saved to data room" : "Save to data room"}
      </button>
      {save.kind === "saved" && save.href ? (
        <Link href={save.href} className="text-sm font-semibold text-action">
          Open data room →
        </Link>
      ) : null}
      {save.kind === "error" ? (
        <p role="alert" className="w-full text-sm text-bear">
          {save.message}
          {save.needsProject ? (
            <>
              {" "}
              <Link href="/workspace/projects" className="font-semibold underline">
                Choose a startup
              </Link>
              {" then re-run the finder from "}
              <Link href="/workspace/funding" className="font-semibold underline">
                your workspace
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : null}
      {!projectId && save.kind === "idle" ? (
        <p className="w-full text-xs text-tertiary">This report is not attached to a startup yet — saving will ask you to pick one.</p>
      ) : null}
    </div>
  );
}

export default ReportOwnerActions;
