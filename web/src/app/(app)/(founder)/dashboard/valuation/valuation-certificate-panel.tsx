"use client";

/**
 * Valuation certificate panel (S22-A) — sits under the VC valuation hero on
 * /dashboard/valuation.
 *
 *   - "Issue valuation certificate (5 credits / included)" — transparent
 *     pricing: the first POST is a preview (cost, balance, what will be
 *     sealed); the founder confirms before anything is charged;
 *   - list of issued certificates: number, issue date, SVI, A$ range,
 *     status; per row: download PDF (optionally "prepared for" an investor →
 *     watermarked copy), public verify link, add to data room (editor+),
 *     revoke with a reason (owner/admin);
 *   - role-aware: viewers see the list and the download/verify links only.
 *
 * `initial` lets the page (and the colocated render test) seed the state
 * without a fetch; otherwise the panel loads GET /api/valuation/certificate.
 */

import * as React from "react";
import { Award, CheckCircle2, Download, ExternalLink, FolderPlus, Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import { certificateCostLabel, formatAudCompact, type ValuationCertificateData } from "@/lib/valuation-certificate/types";

export interface CertificateListItem {
  id: string;
  certificateNo: string;
  contentHash: string;
  startupName: string;
  sviScore: number;
  valuation: ValuationCertificateData["valuation"] | null;
  method: string | null;
  creditsCharged: number;
  issuedAt: string;
  revokedAt: string | null;
  revokedReason: string | null;
  verifyUrl: string;
  pdfUrl: string;
}

export interface CertificatePanelState {
  certificates: CertificateListItem[];
  role: "owner" | "admin" | "editor" | "viewer" | null;
  cost: number;
  included: boolean;
}

interface Preview {
  cost: number;
  included: boolean;
  balance: number | null;
  creditNote: string;
  subject: { startupName: string; sviScore: number; valuation: ValuationCertificateData["valuation"]; evidence: { total: number; verified: number } };
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : AU_DATE.format(d);
}

export function canIssue(role: CertificatePanelState["role"]): boolean {
  return role === "owner" || role === "admin" || role === "editor";
}
export function canRevoke(role: CertificatePanelState["role"]): boolean {
  return role === "owner" || role === "admin";
}

export function ValuationCertificatePanel({ initial }: { initial?: CertificatePanelState }) {
  const [state, setState] = React.useState<CertificatePanelState | null>(initial ?? null);
  const [loading, setLoading] = React.useState(!initial);
  const [preview, setPreview] = React.useState<Preview | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [investor, setInvestor] = React.useState("");

  React.useEffect(() => {
    if (initial) return;
    let alive = true;
    fetch("/api/valuation/certificate")
      .then((r) => r.json())
      .then((d) => {
        if (!alive) return;
        if (d?.ok) setState({ certificates: d.certificates ?? [], role: d.role ?? null, cost: d.cost ?? 5, included: Boolean(d.included) });
        else setError(d?.error ?? "Could not load certificates");
      })
      .catch(() => alive && setError("Network error"))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [initial]);

  const post = React.useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }, []);

  const startIssue = React.useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy("preview");
    try {
      const { res, json } = await post("/api/valuation/certificate", {});
      if (!res.ok) {
        setError(json.error === "insufficient_credits" ? `Not enough credits — ${json.creditsRequired} needed, balance ${json.balance}.` : json.error === "no_svi_analysis" ? "Complete an SVI analysis first — run your first score to see a valuation." : json.error ?? "Could not prepare the certificate");
        return;
      }
      if (json.preview) setPreview({ cost: json.cost, included: json.included, balance: json.balance, creditNote: json.creditNote, subject: json.subject });
    } finally {
      setBusy(null);
    }
  }, [post]);

  const confirmIssue = React.useCallback(async () => {
    setBusy("issue");
    setError(null);
    try {
      const { res, json } = await post("/api/valuation/certificate", { confirm: true });
      if (!res.ok || !json.certificate) {
        setError(json.error ?? "Issue failed");
        return;
      }
      setState((s) => (s ? { ...s, certificates: [json.certificate, ...s.certificates] } : s));
      setPreview(null);
      setNotice(`Certificate ${json.certificate.certificateNo} issued${json.creditsCharged ? ` — ${json.creditsCharged} credits charged` : " — included in your plan"}.`);
    } finally {
      setBusy(null);
    }
  }, [post]);

  const addToDataRoom = React.useCallback(
    async (c: CertificateListItem) => {
      setBusy(`dataroom:${c.id}`);
      setError(null);
      try {
        const { res, json } = await post(`/api/valuation/certificate/${c.id}/data-room`);
        if (!res.ok) {
          setError(json.error === "revoked" ? "A revoked certificate cannot be added to the data room." : json.error ?? "Could not add to data room");
          return;
        }
        setNotice(`Certificate ${c.certificateNo} added to your data room.`);
      } finally {
        setBusy(null);
      }
    },
    [post],
  );

  const revoke = React.useCallback(
    async (c: CertificateListItem) => {
      const reason = typeof window !== "undefined" ? window.prompt("Reason for revoking this certificate (shown on the verify page):") : null;
      if (!reason || !reason.trim()) return;
      setBusy(`revoke:${c.id}`);
      setError(null);
      try {
        const { res, json } = await post(`/api/valuation/certificate/${c.id}/revoke`, { reason: reason.trim() });
        if (!res.ok || !json.certificate) {
          setError(json.error ?? "Revoke failed");
          return;
        }
        setState((s) => (s ? { ...s, certificates: s.certificates.map((x) => (x.id === c.id ? json.certificate : x)) } : s));
        setNotice(`Certificate ${c.certificateNo} revoked.`);
      } finally {
        setBusy(null);
      }
    },
    [post],
  );

  if (loading) {
    return <div className="animate-pulse h-24 bg-surface-100 rounded-2xl" data-testid="certificate-panel-loading" />;
  }
  if (!state) {
    return (
      <div className="rounded-2xl border border-surface-200 bg-surface-50 p-4 text-xs text-ink-500" data-testid="certificate-panel-error">
        {error ?? "Certificates unavailable"}
      </div>
    );
  }

  const issueAllowed = canIssue(state.role);
  const revokeAllowed = canRevoke(state.role);
  const costLabel = certificateCostLabel(state.cost, state.included);
  const pdfHref = (c: CertificateListItem) => (investor.trim() ? `${c.pdfUrl}?for=${encodeURIComponent(investor.trim())}` : c.pdfUrl);

  return (
    <section className="rounded-2xl border border-surface-200 bg-white p-5 md:p-6" data-testid="valuation-certificate-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold flex items-center gap-1.5">
            <Award strokeWidth={1.75} className="h-3.5 w-3.5" /> Investor due diligence
          </p>
          <h2 className="mt-1 text-lg font-semibold text-ink-800">Valuation certificate</h2>
          <p className="mt-1 text-sm text-ink-500 max-w-xl">
            A hash-sealed, 3-page A4 snapshot of this SVI score and indicative range that an investor can verify at a public
            link — issued by Auschain PTY LTD, indicative only, not an independent valuation report.
          </p>
        </div>
        {issueAllowed ? (
          <button
            type="button"
            onClick={() => void startIssue()}
            disabled={busy !== null || preview !== null}
            data-testid="issue-certificate"
            className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-60"
          >
            {busy === "preview" ? <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" /> : <Award strokeWidth={1.75} className="h-4 w-4" />}
            Issue valuation certificate ({costLabel})
          </button>
        ) : (
          <p className="text-xs text-ink-400" data-testid="certificate-readonly">
            View only — {state.role ?? "your role"} on this project cannot issue certificates.
          </p>
        )}
      </div>

      {preview && (
        <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 p-4" data-testid="certificate-preview">
          <p className="text-sm font-semibold text-ink-800">Confirm before anything is charged</p>
          <ul className="mt-2 text-xs text-ink-600 space-y-1">
            <li>
              Cost: <strong>{preview.included ? "included in your plan" : `${preview.cost} credits`}</strong>
              {preview.balance !== null && !preview.included ? ` · balance ${preview.balance}` : ""} · {preview.creditNote}
            </li>
            <li>
              Seals: {preview.subject.startupName} · SVI {preview.subject.sviScore} · {formatAudCompact(preview.subject.valuation.lowAud)} –{" "}
              {formatAudCompact(preview.subject.valuation.highAud)} (mid {formatAudCompact(preview.subject.valuation.midAud)}) ·{" "}
              {preview.subject.evidence.verified}/{preview.subject.evidence.total} evidence items verified
            </li>
            <li>The figures are frozen at issue; a later score run does not change this certificate. You can revoke it later.</li>
          </ul>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => void confirmIssue()}
              disabled={busy !== null}
              data-testid="confirm-issue"
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy === "issue" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 strokeWidth={1.75} className="h-3.5 w-3.5" />}
              {preview.included ? "Issue (included)" : `Issue for ${preview.cost} credits`}
            </button>
            <button type="button" onClick={() => setPreview(null)} disabled={busy !== null} className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50">
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="mt-3 text-xs text-red-700" role="alert" data-testid="certificate-error">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 text-xs text-emerald-700" data-testid="certificate-notice">
          {notice}
        </p>
      )}

      {state.certificates.length > 0 && (
        <div className="mt-4">
          <label className="flex flex-wrap items-center gap-2 text-xs text-ink-500">
            <span>Prepare downloads for an investor (watermark):</span>
            <input
              type="text"
              value={investor}
              onChange={(e) => setInvestor(e.target.value)}
              placeholder="name, firm or email"
              maxLength={80}
              data-testid="certificate-investor"
              className="rounded-lg border border-surface-200 px-2 py-1 text-xs text-ink-800 w-56"
            />
          </label>
        </div>
      )}

      <ul className="mt-3 divide-y divide-surface-100" data-testid="certificate-list">
        {state.certificates.length === 0 && (
          <li className="py-3 text-xs text-ink-400" data-testid="certificate-empty">
            No certificates issued yet.
          </li>
        )}
        {state.certificates.map((c) => {
          const revoked = Boolean(c.revokedAt);
          return (
            <li key={c.id} className="py-3 flex flex-wrap items-center justify-between gap-3" data-testid="certificate-row" data-certificate={c.certificateNo} data-revoked={revoked ? "1" : "0"}>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink-800 font-mono flex items-center gap-2">
                  {c.certificateNo}
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium font-sans",
                      revoked ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800",
                    )}
                  >
                    {revoked ? <ShieldAlert strokeWidth={1.75} className="h-3 w-3" /> : <ShieldCheck strokeWidth={1.75} className="h-3 w-3" />}
                    {revoked ? "Revoked" : "Active"}
                  </span>
                </p>
                <p className="text-xs text-ink-500 mt-0.5">
                  Issued {fmtDate(c.issuedAt)} · SVI {c.sviScore}
                  {c.valuation ? ` · ${formatAudCompact(c.valuation.lowAud)} – ${formatAudCompact(c.valuation.highAud)}` : ""}
                  {c.creditsCharged > 0 ? ` · ${c.creditsCharged} credits` : " · included"}
                  {revoked && c.revokedReason ? ` · revoked: ${c.revokedReason}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <a
                  href={pdfHref(c)}
                  className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50"
                  data-testid="certificate-pdf"
                >
                  <Download strokeWidth={1.75} className="h-3.5 w-3.5" /> PDF
                </a>
                <a
                  href={c.verifyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50"
                  data-testid="certificate-verify"
                >
                  <ExternalLink strokeWidth={1.75} className="h-3.5 w-3.5" /> Verify
                </a>
                {issueAllowed && !revoked && (
                  <button
                    type="button"
                    onClick={() => void addToDataRoom(c)}
                    disabled={busy !== null}
                    data-testid="certificate-dataroom"
                    className="inline-flex items-center gap-1 rounded-lg border border-surface-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-60"
                  >
                    {busy === `dataroom:${c.id}` ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus strokeWidth={1.75} className="h-3.5 w-3.5" />}
                    Add to data room
                  </button>
                )}
                {revokeAllowed && !revoked && (
                  <button
                    type="button"
                    onClick={() => void revoke(c)}
                    disabled={busy !== null}
                    data-testid="certificate-revoke"
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    {busy === `revoke:${c.id}` ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <ShieldAlert strokeWidth={1.75} className="h-3.5 w-3.5" />}
                    Revoke
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
