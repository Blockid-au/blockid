"use client";

// PrivacyBanner — single-line bottom banner announcing our APP + cookie
// handling and giving the visitor two paths: Accept (records consent
// against the current pinned `privacy` disclaimer version) or
// Preferences (routes to /legal/privacy-preferences where granular
// analytics/marketing toggles live).
//
// State is persisted client-side under
// `blockid_privacy_ack_v1` — bumping the storage key when the underlying
// disclaimer version changes forces a fresh opt-in on next visit.

import * as React from "react";
import Link from "next/link";
import { DISCLAIMER_VERSIONS } from "@/lib/legal/versions";

const STORAGE_KEY = "blockid_privacy_ack_v1";

export interface PrivacyBannerProps {
  /** Override the Preferences link target. */
  preferencesHref?: string;
}

function readAcked(): boolean {
  try {
    return typeof window !== "undefined"
      ? window.localStorage.getItem(STORAGE_KEY) === "true"
      : true;
  } catch {
    return true;
  }
}

function persistAcked(): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, "true");
  } catch {
    /* non-fatal — banner will re-show next session */
  }
}

export function PrivacyBanner({
  preferencesHref = "/legal/privacy-preferences",
}: PrivacyBannerProps): React.ReactElement | null {
  const [visible, setVisible] = React.useState<boolean>(false);
  const [submitting, setSubmitting] = React.useState<boolean>(false);

  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- post-hydration read of localStorage; a lazy initialiser would mismatch the server render
    if (!readAcked()) setVisible(true);
  }, []);

  const onAccept = React.useCallback(async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await fetch("/api/legal/ack", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          kind: "privacy",
          disclaimer_version: DISCLAIMER_VERSIONS.privacy,
          granted: true,
        }),
      });
    } catch {
      // Anonymous visitors get 401; either way persist the local dismissal
      // so we do not badger them across pages.
    } finally {
      persistAcked();
      setVisible(false);
      setSubmitting(false);
    }
  }, [submitting]);

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="Privacy notice"
      className="fixed inset-x-0 bottom-0 z-[90] border-t border-line-subtle bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/80"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 text-sm text-slate-700 sm:flex-row sm:items-center sm:justify-between">
        <p className="leading-snug">
          BlockID.au uses cookies and processes personal information under the
          Privacy Act 1988 (Cth) and Australian Privacy Principles. See our{" "}
          {/* The banner is fixed and always in view for guests, so its links
              would prefetch on every page load; the footer already links
              /legal/privacy and the same prefetch was seen holding a
              connection ~30 s on /analyze (QA audit P3). */}
          <Link
            href="/legal/privacy"
            prefetch={false}
            className="font-semibold text-brand-700 underline-offset-2 hover:underline"
          >
            Privacy Policy
          </Link>
          .
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href={preferencesHref}
            prefetch={false}
            className="inline-flex items-center justify-center rounded-lg border border-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-surface-sunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          >
            Preferences
          </Link>
          <button
            type="button"
            onClick={onAccept}
            disabled={submitting}
            className="inline-flex items-center justify-center rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action shadow-sm transition-colors hover:bg-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {submitting ? "Saving…" : "Accept"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default PrivacyBanner;
