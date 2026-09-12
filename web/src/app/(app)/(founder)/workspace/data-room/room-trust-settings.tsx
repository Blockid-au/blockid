"use client";

// Founder-side trust settings for the data room (S21-A): NDA click-wrap on
// or off, the clause text, a "publish a new version" action that re-prompts
// every link, and the per-investor PDF watermark toggle.
//
// Three states the panel can be in, each said out loud rather than hidden:
//   - entitled + can edit   → live controls, save on change;
//   - entitled + read-only  → controls disabled with the S18-B view-only note
//                             (viewer / editor on a shared project);
//   - not entitled          → controls disabled with the upgrade line. The
//                             stored values still show so a founder who
//                             downgraded sees what will come back.
//
// Form rules: visible labels, helper text under the textarea, inline save
// feedback via the parent's toast, no autosave on keystroke (save button for
// the clause; toggles save immediately because they are one bit).

import * as React from "react";
import Link from "next/link";
import { FileSignature, Loader2, RefreshCw, Stamp } from "lucide-react";
import { formatRunDateTime } from "@/lib/analyses/summary";
import { NDA_NOT_LEGAL_ADVICE, NDA_TEXT_MAX_CHARS } from "@/lib/dataroom/nda";

export interface TrustSettings {
  dataRoomId: string;
  ndaRequired: boolean;
  ndaText: string | null;
  ndaVersion: number;
  watermarkEnabled: boolean;
  defaultNdaText: string;
  entitled: boolean;
  feature: string;
  canEdit: boolean;
  role: string;
}

export interface NdaAcceptance {
  id: string;
  linkId: string;
  version: number;
  viewerEmail: string | null;
  uaFamily: string | null;
  acceptedAt: string;
}

export interface RoomTrustSettingsProps {
  dataRoomId: string | null | undefined;
  /** Parent's readOnly (viewer / editor) — the server answers the same. */
  readOnly?: boolean;
  onToast?: (message: string, kind?: "success" | "error") => void;
  /** Test seam: skip the fetch. */
  initial?: { settings: TrustSettings; acceptances: NdaAcceptance[] } | null;
  /** Names for the acceptance ledger, keyed by link id. */
  linkLabels?: Record<string, string>;
}

export function RoomTrustSettings({ dataRoomId, readOnly = false, onToast, initial, linkLabels = {} }: RoomTrustSettingsProps) {
  const [settings, setSettings] = React.useState<TrustSettings | null>(initial?.settings ?? null);
  const [acceptances, setAcceptances] = React.useState<NdaAcceptance[]>(initial?.acceptances ?? []);
  const [loadFailed, setLoadFailed] = React.useState(false);
  const [draft, setDraft] = React.useState<string>(initial?.settings.ndaText ?? "");
  const [saving, setSaving] = React.useState<"nda" | "watermark" | "text" | "bump" | null>(null);

  const toast = React.useCallback(
    (message: string, kind: "success" | "error" = "success") => onToast?.(message, kind),
    [onToast],
  );

  React.useEffect(() => {
    if (initial || !dataRoomId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/data-room/settings?dataRoomId=${encodeURIComponent(dataRoomId)}`, {
          credentials: "same-origin",
        });
        const data = (await res.json().catch(() => null)) as
          | { ok?: boolean; settings?: TrustSettings; acceptances?: NdaAcceptance[] }
          | null;
        if (cancelled) return;
        if (!res.ok || !data?.ok || !data.settings) {
          setLoadFailed(true);
          return;
        }
        setSettings(data.settings);
        setDraft(data.settings.ndaText ?? "");
        setAcceptances(data.acceptances ?? []);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataRoomId, initial]);

  if (!dataRoomId) return null;

  const locked = !settings?.entitled;
  const disabled = readOnly || locked || !settings?.canEdit || saving !== null;

  async function save(
    patch: { ndaRequired?: boolean; watermarkEnabled?: boolean; ndaText?: string | null; bumpVersion?: boolean },
    kind: NonNullable<typeof saving>,
    okMessage: string,
  ) {
    if (!settings || disabled) return;
    setSaving(kind);
    try {
      const res = await fetch("/api/data-room/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ dataRoomId, ...patch }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; settings?: TrustSettings; error?: string; message?: string }
        | null;
      if (!res.ok || !data?.ok || !data.settings) {
        toast(
          res.status === 402
            ? "NDA and watermark are part of Starter and above."
            : data?.message ?? data?.error ?? "Could not save the setting.",
          "error",
        );
        return;
      }
      setSettings(data.settings);
      setDraft(data.settings.ndaText ?? "");
      toast(okMessage);
    } catch {
      toast("Could not save the setting. Please try again.", "error");
    } finally {
      setSaving(null);
    }
  }

  const textDirty = settings ? (draft.trim() || null) !== (settings.ndaText ?? null) : false;

  return (
    <div className="border-t border-line-subtle px-5 py-4" data-testid="room-trust-settings">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-primary">
        <FileSignature aria-hidden strokeWidth={1.75} className="h-4 w-4" />
        Confidentiality and watermark
      </h3>
      <p className="mt-1 text-xs text-secondary">
        Ask every investor to agree to an NDA before the documents are listed, and stamp PDFs they download
        with their name and the date.
      </p>

      {loadFailed && (
        <p className="mt-3 text-sm text-secondary">We could not load these settings just now. Reload the page.</p>
      )}

      {settings && (
        <>
          {locked && (
            <p className="mt-3 rounded-lg border border-line-subtle bg-surface-sunken px-3 py-2 text-xs text-secondary" data-testid="trust-locked">
              NDA click-wrap and per-investor watermarks are part of{" "}
              <Link href={`/pricing?feature=${encodeURIComponent(settings.feature)}`} className="font-semibold text-action underline underline-offset-2">
                Starter and above
              </Link>
              . Your links keep working without them.
            </p>
          )}
          {!locked && (readOnly || !settings.canEdit) && (
            <p className="mt-3 text-xs text-tertiary" data-testid="trust-readonly">
              You have {settings.role} access on this project — only the owner or an admin can change these.
            </p>
          )}

          <div className="mt-4 space-y-4">
            {/* NDA on/off */}
            <label htmlFor="trust-nda" className="flex items-start gap-3">
              <input
                id="trust-nda"
                type="checkbox"
                checked={settings.ndaRequired}
                disabled={disabled}
                onChange={(e) => void save({ ndaRequired: e.target.checked }, "nda", e.target.checked ? "NDA required — every link now asks before listing documents." : "NDA no longer required.")}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-action disabled:opacity-50"
                data-testid="trust-nda-toggle"
              />
              <span className="text-sm text-primary">
                Require an NDA before documents are shown
                <span className="block text-xs text-tertiary">
                  Version {settings.ndaVersion}. Refused server-side too — a PDF link will not serve until the investor agrees.
                </span>
              </span>
            </label>

            {/* Clause text */}
            <div>
              <label htmlFor="trust-nda-text" className="block text-xs font-medium text-muted">
                NDA clause
              </label>
              <textarea
                id="trust-nda-text"
                value={draft}
                disabled={disabled}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={settings.defaultNdaText}
                rows={6}
                maxLength={NDA_TEXT_MAX_CHARS}
                className="mt-1 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm leading-relaxed text-primary placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-60"
                data-testid="trust-nda-text"
              />
              <p className="mt-1 text-xs text-tertiary">
                Leave empty to use the default mutual-confidentiality clause shown as the placeholder. {NDA_NOT_LEGAL_ADVICE}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={disabled || !textDirty}
                  onClick={() => void save({ ndaText: draft.trim() || null }, "text", "Clause saved. Publish a new version when you want existing links to re-accept it.")}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-action px-3 text-xs font-semibold text-on-action transition-opacity hover:opacity-90 disabled:opacity-50"
                  data-testid="trust-nda-save"
                >
                  {saving === "text" && <Loader2 aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />}
                  Save clause
                </button>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    if (window.confirm(`Publish version ${settings.ndaVersion + 1}? Every investor who already agreed will be asked again next time they open the room.`)) {
                      void save({ bumpVersion: true, ...(textDirty ? { ndaText: draft.trim() || null } : {}) }, "bump", `Version ${settings.ndaVersion + 1} published — existing links will be asked to agree again.`);
                    }
                  }}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-line-subtle px-3 text-xs font-semibold text-primary transition-colors hover:border-line-strong disabled:opacity-50"
                  data-testid="trust-nda-bump"
                >
                  {saving === "bump" ? (
                    <Loader2 aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                  ) : (
                    <RefreshCw aria-hidden strokeWidth={1.75} className="h-3.5 w-3.5" />
                  )}
                  Publish new version
                </button>
              </div>
            </div>

            {/* Watermark */}
            <label htmlFor="trust-watermark" className="flex items-start gap-3">
              <input
                id="trust-watermark"
                type="checkbox"
                checked={settings.watermarkEnabled}
                disabled={disabled}
                onChange={(e) => void save({ watermarkEnabled: e.target.checked }, "watermark", e.target.checked ? "Watermark on — every PDF downloaded through a link is stamped for that investor." : "Watermark off.")}
                className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-action disabled:opacity-50"
                data-testid="trust-watermark-toggle"
              />
              <span className="inline-flex items-start gap-2 text-sm text-primary">
                <Stamp aria-hidden strokeWidth={1.75} className="mt-0.5 h-4 w-4 shrink-0 text-tertiary" />
                <span>
                  Watermark PDFs per investor
                  <span className="block text-xs text-tertiary">
                    Diagonal &ldquo;Prepared for &lt;name or email&gt; · &lt;date&gt; · BlockID.au&rdquo; on every page, so a leaked copy traces back.
                  </span>
                </span>
              </span>
            </label>
          </div>

          {/* Acceptance ledger */}
          {acceptances.length > 0 && (
            <div className="mt-5" data-testid="trust-acceptances">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">NDA acceptances</h4>
              <ul className="mt-2 space-y-1.5">
                {acceptances.slice(0, 20).map((a) => (
                  <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                    <span className="font-semibold text-primary">{linkLabels[a.linkId] ?? a.viewerEmail ?? "Investor"}</span>
                    {a.viewerEmail && linkLabels[a.linkId] && <span className="text-secondary">{a.viewerEmail}</span>}
                    <span className="text-tertiary">
                      v{a.version} · {formatRunDateTime(a.acceptedAt) || a.acceptedAt}
                      {a.uaFamily ? ` · ${a.uaFamily}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
