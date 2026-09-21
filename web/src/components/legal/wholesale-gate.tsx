"use client";

// WholesaleGate — retail vs wholesale investor gate modal.
//
// Renders a three-option prompt asking whether the user is a wholesale
// investor per Corporations Act s708(8)/(11):
//   - Yes: file upload → POST /api/legal/wholesale-verify
//   - No:  set a local flag (`blockid.wholesale.decl.retail`) and close
//   - Not sure: link to an FAQ page (no state change)
//
// On successful Yes-verification the local flag is cleared and an
// `onVerified` callback fires so the parent can re-render gated surfaces.

import * as React from "react";
import Link from "next/link";
import { userErrorMessage } from "@/lib/ui/user-error";

const LOCAL_KEY_RETAIL = "blockid.wholesale.decl.retail";
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // 8 MB

export interface WholesaleGateProps {
  open: boolean;
  onClose: () => void;
  onVerified?: () => void;
  faqHref?: string;
}

type Mode = "prompt" | "upload" | "success";

export function WholesaleGate({
  open,
  onClose,
  onVerified,
  faqHref = "/legal/wholesale-faq",
}: WholesaleGateProps): React.ReactElement | null {
  const [mode, setMode] = React.useState<Mode>("prompt");
  const [file, setFile] = React.useState<File | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [prevOpen, setPrevOpen] = React.useState(open);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setMode("prompt");
      setFile(null);
      setError(null);
      setSubmitting(false);
    }
  }

  const onChooseRetail = React.useCallback(() => {
    try {
      localStorage.setItem(LOCAL_KEY_RETAIL, new Date().toISOString());
    } catch {
      /* non-fatal */
    }
    onClose();
  }, [onClose]);

  const onFileChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0] ?? null;
      if (f && f.size > MAX_UPLOAD_BYTES) {
        setError(
          `File too large (${Math.round(f.size / 1024)} KB). Max is ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`,
        );
        setFile(null);
        return;
      }
      setError(null);
      setFile(f);
    },
    [],
  );

  const onUpload = React.useCallback(async () => {
    if (!file || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/legal/wholesale-verify", {
        method: "POST",
        credentials: "same-origin",
        body: fd,
      });
      if (!res.ok) {
        let reason = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { reason?: string };
          if (j?.reason) reason = j.reason;
        } catch {
          /* ignore */
        }
        setError(reason);
        setSubmitting(false);
        return;
      }
      try {
        localStorage.removeItem(LOCAL_KEY_RETAIL);
      } catch {
        /* non-fatal */
      }
      setMode("success");
      onVerified?.();
    } catch (err) {
      setError(userErrorMessage(err, "Something went wrong. Please try again."));
      setSubmitting(false);
    }
  }, [file, submitting, onVerified]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="wsg-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-strong/50 p-4"
    >
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-line-subtle overflow-hidden">
        <div className="px-6 py-4 border-b border-line-subtle">
          <h2
            id="wsg-title"
            className="text-lg font-semibold text-primary"
          >
            Are you a wholesale investor?
          </h2>
          <p className="mt-1 text-xs text-muted">
            Per Corporations Act 2001 (Cth) s708(8)/(11) — sophisticated or
            professional investor.
          </p>
        </div>

        {mode === "prompt" && (
          <div className="px-6 py-5 space-y-3">
            <button
              type="button"
              onClick={() => setMode("upload")}
              className="w-full text-left rounded-lg border border-brand-500 bg-brand-50 px-4 py-3 hover:bg-brand-100 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              <div className="text-sm font-semibold text-brand-900">
                Yes — upload certificate
              </div>
              <div className="mt-0.5 text-xs text-brand-800/80">
                Upload an accountant&apos;s s708(8) certificate or professional
                investor licence.
              </div>
            </button>
            <button
              type="button"
              onClick={onChooseRetail}
              className="w-full text-left rounded-lg border border-line px-4 py-3 hover:bg-surface-sunken transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              <div className="text-sm font-semibold text-primary">
                No — proceed as retail
              </div>
              <div className="mt-0.5 text-xs text-secondary">
                Wholesale-only content will remain hidden.
              </div>
            </button>
            <Link
              href={faqHref}
              className="block w-full text-left rounded-lg border border-line px-4 py-3 hover:bg-surface-sunken transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-600 focus-visible:ring-offset-2"
            >
              <div className="text-sm font-semibold text-primary">
                Not sure — see FAQ
              </div>
              <div className="mt-0.5 text-xs text-secondary">
                Learn how wholesale investor status is determined in Australia.
              </div>
            </Link>
          </div>
        )}

        {mode === "upload" && (
          <div className="px-6 py-5 space-y-4">
            <p className="text-sm text-slate-700">
              Upload your s708(8) accountant&apos;s certificate (PDF, ≤ 8 MB). The
              file hash and metadata are stored in our audit trail; a human
              reviewer confirms status.
            </p>
            <input
              type="file"
              accept="application/pdf,image/png,image/jpeg"
              onChange={onFileChange}
              className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-lg file:border-0 file:bg-action file:px-3 file:py-2 file:text-sm file:font-semibold file:text-on-action hover:file:bg-action-hover"
            />
            {file && (
              <div className="text-xs text-muted">
                Selected: {file.name} · {Math.round(file.size / 1024)} KB
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-xs text-rose-800"
              >
                {error}
              </div>
            )}
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                type="button"
                onClick={() => setMode("prompt")}
                className="rounded-lg border border-line px-3 py-2 text-sm font-medium text-slate-700 hover:bg-surface-sunken"
              >
                Back
              </button>
              <button
                type="button"
                onClick={onUpload}
                disabled={!file || submitting}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                  file && !submitting
                    ? "bg-action hover:bg-action-hover text-on-action"
                    : "bg-slate-200 text-muted cursor-not-allowed"
                }`}
              >
                {submitting ? "Uploading…" : "Submit for review"}
              </button>
            </div>
          </div>
        )}

        {mode === "success" && (
          <div className="px-6 py-6 text-center space-y-3">
            <div className="text-3xl">✓</div>
            <p className="text-sm text-slate-700">
              Received. Your certificate is queued for review. You will be
              notified once wholesale status is confirmed.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-action hover:bg-action-hover text-on-action px-4 py-2 text-sm font-semibold"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default WholesaleGate;
