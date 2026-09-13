"use client";

/**
 * "Board resolution" button (S26-B) — one control reused on the cap-table
 * share-issue rows, the dividend cards and the ESOP pool.
 *
 * Flow (show-cost-first, never charge without confirmation):
 *   idle        → "Board resolution" — POST preview
 *   preview     → inline confirm card: title, company, directors (or "no
 *                 directors stored — blank signature lines"), cost
 *                 ("1 credit" / "included in your plan") + Generate / Cancel
 *   generated   → "Download PDF" (+ optional "prepared for" watermark
 *                 recipient) and "Save to data room"
 *   already generated (preview.existing) → straight to the download state,
 *                 nothing charged.
 *   stale       → (S27-A) the source record changed after generation: the
 *                 ready state says so and offers "Regenerate (1 credit /
 *                 included)" — a preview with `regenerate: true`, then the
 *                 same confirm; the old version stays listed under
 *                 "Previous versions" with its own (SUPERSEDED) PDF link.
 *
 * `initial` seeds a state for the colocated render test; `onNotice`
 * surfaces messages to the host page when it has its own banner.
 */

import * as React from "react";
import { Download, FileSignature, FolderPlus, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { resolutionCostLabel, type ResolutionKind } from "@/lib/board-resolutions/build";

export interface ResolutionVersionSummary {
  id: string;
  version: number;
  current: boolean;
  issuedAt: string;
  supersededAt: string | null;
  pdfUrl: string;
}

export interface ResolutionPreview {
  cost: number;
  included: boolean;
  balance: number | null;
  creditNote: string;
  company: { name: string; acn: string | null; abn: string | null };
  directors: Array<{ name: string }>;
  soleDirector: boolean;
  title: string;
  facts: Array<{ label: string; value: string }>;
  existing: { pdfUrl: string; issuedAt: string } | null;
  /** S27-A: this preview will supersede the current version (`nextVersion`). */
  regenerate?: boolean;
  nextVersion?: number;
}

const AU_DATE = new Intl.DateTimeFormat("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "Australia/Sydney" });
function fmtDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : AU_DATE.format(d);
}

export interface BoardResolutionButtonProps {
  kind: ResolutionKind;
  recordId: string;
  /** Short label for the host row ("Seed — 400,000 Ordinary to Seed Investor"). */
  label?: string;
  /** Editor+ may generate; viewers only see an existing PDF link when given. */
  canGenerate: boolean;
  /** Seed state without a fetch (tests / server-rendered hosts). */
  initial?: { preview?: ResolutionPreview | null; pdfUrl?: string | null; stale?: boolean; versions?: ResolutionVersionSummary[] };
  onNotice?: (msg: string) => void;
  className?: string;
}

export const KIND_LABEL: Record<ResolutionKind, string> = {
  "share-issue": "share issue",
  dividend: "dividend declaration",
  esop: "ESOP adoption",
};

export function BoardResolutionButton({ kind, recordId, label, canGenerate, initial, onNotice, className }: BoardResolutionButtonProps) {
  const [preview, setPreview] = React.useState<ResolutionPreview | null>(initial?.preview ?? null);
  const [pdfUrl, setPdfUrl] = React.useState<string | null>(initial?.pdfUrl ?? initial?.preview?.existing?.pdfUrl ?? null);
  const [stale, setStale] = React.useState<boolean>(Boolean(initial?.stale));
  const [versions, setVersions] = React.useState<ResolutionVersionSummary[]>(initial?.versions ?? []);
  const [busy, setBusy] = React.useState<"preview" | "generate" | "dataroom" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [recipient, setRecipient] = React.useState("");
  const base = `/api/board-resolutions/${kind}/${recordId}`;

  // A host that seeds `pdfUrl` from its list (cap-table issues, ESOP pool) does not know whether the
  // record changed since — one GET learns `stale` + the version history (viewer-safe, read-only).
  const seededWithoutStatus = Boolean(initial?.pdfUrl) && initial?.stale === undefined && initial?.versions === undefined;
  React.useEffect(() => {
    if (!seededWithoutStatus) return;
    let alive = true;
    fetch(base, { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!alive || !json?.ok) return;
        if (typeof json.stale === "boolean") setStale(json.stale);
        if (Array.isArray(json.versions)) setVersions(json.versions);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [base, seededWithoutStatus]);

  const post = React.useCallback(async (url: string, body?: unknown) => {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body ?? {}) });
    const json = await res.json().catch(() => ({}));
    return { res, json };
  }, []);

  const start = React.useCallback(
    async (regenerate = false) => {
      setError(null);
      setBusy("preview");
      try {
        const { res, json } = await post(base, regenerate ? { regenerate: true } : {});
        if (!res.ok) {
          setError(json.error === "insufficient_credits" ? `Not enough credits — ${json.creditsRequired} needed, balance ${json.balance}.` : json.error ?? "Could not prepare the resolution");
          return;
        }
        if (Array.isArray(json.versions)) setVersions(json.versions);
        if (typeof json.stale === "boolean") setStale(json.stale);
        if (json.existing?.pdfUrl && !regenerate) {
          setPdfUrl(json.existing.pdfUrl);
          setPreview(null);
          return;
        }
        setPreview({
          cost: json.cost,
          included: json.included,
          balance: json.balance,
          creditNote: json.creditNote,
          company: json.company,
          directors: json.directors ?? [],
          soleDirector: Boolean(json.soleDirector),
          title: json.title,
          facts: json.facts ?? [],
          existing: regenerate ? (json.existing ?? null) : null,
          regenerate: regenerate && Boolean(json.existing),
          nextVersion: typeof json.nextVersion === "number" ? json.nextVersion : undefined,
        });
      } finally {
        setBusy(null);
      }
    },
    [base, post],
  );

  const confirm = React.useCallback(async () => {
    setError(null);
    setBusy("generate");
    const regenerate = Boolean(preview?.regenerate);
    try {
      const { res, json } = await post(base, regenerate ? { confirm: true, regenerate: true } : { confirm: true });
      if (!res.ok || !json.resolution?.pdfUrl) {
        setError(json.error === "supersede_conflict" ? (json.message ?? "Regenerated elsewhere — reload.") : json.error ?? "Generation failed");
        return;
      }
      setPdfUrl(json.resolution.pdfUrl);
      setPreview(null);
      setStale(false);
      if (json.superseded) {
        setVersions((prev) => [json.resolution, ...prev.filter((v) => v.id !== json.resolution.id && v.id !== json.superseded.id).map((v) => ({ ...v })), { ...json.superseded, current: false }]);
      } else if (json.resolution) {
        setVersions((prev) => (prev.some((v) => v.id === json.resolution.id) ? prev : [json.resolution, ...prev]));
      }
      onNotice?.(
        json.existing
          ? "This resolution was already generated — nothing charged."
          : `Board resolution ${json.superseded ? `regenerated as v${json.resolution.version} (v${json.superseded.version} superseded)` : "generated"}${json.creditsCharged ? ` — ${json.creditsCharged} credit charged` : " — included in your plan"}.`,
      );
    } finally {
      setBusy(null);
    }
  }, [base, onNotice, post, preview]);

  const saveToDataRoom = React.useCallback(async () => {
    setError(null);
    setBusy("dataroom");
    try {
      const { res, json } = await post(`${base}/data-room`);
      if (!res.ok) {
        setError(json.error === "not_issued" ? "Generate the resolution first." : json.error ?? "Could not save to the data room");
        return;
      }
      onNotice?.("Board resolution saved to your data room.");
    } finally {
      setBusy(null);
    }
  }, [base, onNotice, post]);

  const withRecipient = (url: string) => (recipient.trim() ? `${url}${url.includes("?") ? "&" : "?"}for=${encodeURIComponent(recipient.trim())}` : url);
  const previous = versions.filter((v) => !v.current);

  if (pdfUrl && !preview) {
    return (
      <div className={cn("flex flex-wrap items-center gap-2", className)} data-testid="board-resolution-ready" data-kind={kind} data-stale={stale ? "1" : "0"}>
        <a href={withRecipient(pdfUrl)} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50" data-testid="board-resolution-pdf">
          <Download strokeWidth={1.75} className="h-3.5 w-3.5" /> Resolution PDF
        </a>
        {canGenerate ? (
          <>
            <input
              type="text"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
              placeholder="Prepared for (optional)"
              aria-label="Watermark recipient"
              className="h-8 w-40 rounded-lg border border-surface-200 bg-white px-2 text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button type="button" onClick={saveToDataRoom} disabled={busy !== null} data-testid="board-resolution-dataroom" className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-60">
              {busy === "dataroom" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <FolderPlus strokeWidth={1.75} className="h-3.5 w-3.5" />}
              Save to data room
            </button>
            <button type="button" onClick={() => void start(true)} disabled={busy !== null} data-testid="board-resolution-regenerate" className={cn("inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium disabled:opacity-60", stale ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" : "border-surface-200 bg-white text-ink-700 hover:bg-surface-50")}>
              {busy === "preview" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw strokeWidth={1.75} className="h-3.5 w-3.5" />}
              Regenerate
            </button>
          </>
        ) : null}
        {stale ? (
          <span className="text-[11px] text-amber-800" data-testid="board-resolution-stale">
            The record changed after this resolution was generated — regenerate to supersede it (cost shown before anything is charged).
          </span>
        ) : null}
        {previous.length > 0 ? (
          <span className="text-[11px] text-ink-500" data-testid="board-resolution-versions">
            Previous versions:{" "}
            {previous.map((v, i) => (
              <React.Fragment key={v.id}>
                {i > 0 ? ", " : ""}
                <a href={withRecipient(v.pdfUrl)} className="underline hover:text-ink-700">
                  v{v.version}
                </a>
                {v.supersededAt ? ` (superseded ${fmtDate(v.supersededAt)})` : ""}
              </React.Fragment>
            ))}
          </span>
        ) : null}
        {error ? <span className="text-xs text-red-600" role="alert">{error}</span> : null}
      </div>
    );
  }

  if (!canGenerate) return null;

  if (preview) {
    return (
      <div className={cn("w-full rounded-xl border border-brand-200 bg-brand-50 p-3", className)} role="group" aria-label={`Generate ${KIND_LABEL[kind]} resolution`} data-testid="board-resolution-preview" data-kind={kind}>
        <p className="text-xs font-semibold text-brand-900">{preview.title}</p>
        <p className="mt-1 text-[11px] text-ink-700">
          {preview.company.name} · ACN {preview.company.acn ?? "not supplied"}
          {preview.soleDirector ? " · sole director (s 248B)" : " · circulating resolution (s 248A)"}
        </p>
        <p className="mt-1 text-[11px] text-ink-700" data-testid="board-resolution-directors">
          {preview.directors.length > 0 ? `Signature blocks: ${preview.directors.map((d) => d.name).join(", ")}` : "No directors stored on the cap table (role \"director\") — the PDF prints blank signature lines."}
        </p>
        {preview.facts.length > 0 ? (
          <ul className="mt-2 grid grid-cols-1 gap-x-4 gap-y-0.5 text-[11px] text-ink-700 sm:grid-cols-2">
            {preview.facts.slice(0, 6).map((f) => (
              <li key={f.label}>
                <span className="text-ink-500">{f.label}:</span> {f.value}
              </li>
            ))}
          </ul>
        ) : null}
        {preview.regenerate ? (
          <p className="mt-2 text-[11px] text-amber-900" data-testid="board-resolution-regenerate-note">
            Regenerating as v{preview.nextVersion ?? "next"}: the current version is kept as a record and marked SUPERSEDED; the new version is charged like a first generation.
          </p>
        ) : null}
        <p className="mt-2 text-[11px] text-ink-600" data-testid="board-resolution-cost">
          Cost: {resolutionCostLabel(preview.cost, preview.included)}
          {preview.cost > 0 && preview.balance != null ? ` · balance ${preview.balance}` : ""}
          {preview.cost > 0 ? ` · ${preview.creditNote}` : ""} Re-downloads are free.
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={confirm} disabled={busy !== null} data-testid="board-resolution-confirm" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {busy === "generate" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <FileSignature strokeWidth={1.75} className="h-3.5 w-3.5" />}
            {preview.regenerate ? "Regenerate" : "Generate"} ({resolutionCostLabel(preview.cost, preview.included)})
          </button>
          <button type="button" onClick={() => setPreview(null)} disabled={busy !== null} data-testid="board-resolution-cancel" className="rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-50">
            Cancel
          </button>
        </div>
        {error ? <p className="mt-2 text-xs text-red-600" role="alert">{error}</p> : null}
      </div>
    );
  }

  return (
    <div className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <button type="button" onClick={() => void start(false)} disabled={busy !== null} title={label ? `Board resolution — ${label}` : undefined} data-testid="board-resolution-start" data-kind={kind} className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-60">
        {busy === "preview" ? <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" /> : <FileSignature strokeWidth={1.75} className="h-3.5 w-3.5" />}
        Board resolution
      </button>
      {error ? <span className="text-xs text-red-600" role="alert">{error}</span> : null}
    </div>
  );
}
