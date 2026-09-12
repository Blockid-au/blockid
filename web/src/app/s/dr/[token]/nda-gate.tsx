"use client";

// The NDA click-wrap the investor sees before any document (S21-A).
//
// Server-rendered page decides whether this shows (load.ts withholds the
// documents while the gate is pending), this component only collects the
// acceptance: the clause, an optional email so the founder's ledger has a
// name, one checkbox, one button. On success it calls `router.refresh()` so
// the server re-renders with the documents; on a 409 (founder bumped the
// clause mid-read) it reloads to show the new text.
//
// Accessibility: the clause is a scrollable region with a label, the
// checkbox has a real <label>, the button is disabled until ticked, errors
// land in a role="alert" under the button.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldCheck } from "lucide-react";
import { NDA_NOT_LEGAL_ADVICE } from "@/lib/dataroom/nda";

export interface NdaGateProps {
  token: string;
  version: number;
  text: string;
  startupName: string;
  /** "stale_version" → the founder changed the clause since you last agreed. */
  reason: "never" | "stale_version" | null;
}

export function NdaGate({ token, version, text, startupName, reason }: NdaGateProps) {
  const router = useRouter();
  const [agreed, setAgreed] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/data-room/nda", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, version, email: email.trim() || undefined }),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; status?: string }
        | null;
      if (res.status === 409) {
        // Clause changed while this page was open — show the current one.
        window.location.reload();
        return;
      }
      if (!res.ok || !data?.ok) {
        setError(
          data?.error === "email is not a valid address"
            ? "That email address does not look right."
            : "We could not record your acceptance. Please try again.",
        );
        return;
      }
      router.refresh();
    } catch {
      setError("We could not record your acceptance. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="nda-h"
      className="mt-8 rounded-xl border border-line-subtle bg-surface p-5 sm:p-6"
      data-testid="nda-gate"
    >
      <h2 id="nda-h" className="inline-flex items-center gap-2 text-base font-semibold text-primary">
        <ShieldCheck aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 text-action" />
        Confidentiality terms before you continue
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-secondary">
        {reason === "stale_version"
          ? `${startupName} has updated these terms since you last agreed. Please read and accept the new version to keep reading.`
          : `${startupName} asks everyone who opens this room to agree to the terms below first. The documents are listed once you accept.`}
      </p>

      <div
        role="region"
        aria-label="Confidentiality terms"
        tabIndex={0}
        className="mt-4 max-h-72 overflow-y-auto rounded-lg border border-line-subtle bg-surface-sunken p-4 text-sm leading-relaxed text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action"
      >
        {text.split(/\n{2,}/).map((para, i) => (
          <p key={i} className={i === 0 ? "" : "mt-3"}>
            {para}
          </p>
        ))}
        <p className="mt-4 text-xs leading-relaxed text-muted">{NDA_NOT_LEGAL_ADVICE}</p>
        <p className="mt-1 text-xs text-tertiary">Version {version}</p>
      </div>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <div>
          <label htmlFor="nda-email" className="block text-xs font-medium text-muted">
            Your email <span className="font-normal text-tertiary">(optional — so the founder knows who agreed)</span>
          </label>
          <input
            id="nda-email"
            type="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@fund.vc"
            className="mt-1 w-full max-w-sm rounded-lg border border-line bg-surface px-3 py-2 text-base text-primary placeholder:text-faint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action sm:text-sm"
          />
        </div>

        <label htmlFor="nda-agree" className="flex cursor-pointer items-start gap-3 text-sm text-primary">
          <input
            id="nda-agree"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 rounded border-line accent-action"
          />
          <span>
            I have read the terms and agree to keep the contents of this data room confidential and to use
            them only to evaluate an investment.
          </span>
        </label>

        <div>
          <button
            type="submit"
            disabled={!agreed || busy}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-action px-5 py-2.5 text-sm font-semibold text-on-action transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="nda-agree-button"
          >
            {busy ? (
              <>
                <Loader2 aria-hidden="true" strokeWidth={1.75} className="h-4 w-4 animate-spin motion-reduce:animate-none" />
                Recording…
              </>
            ) : (
              "I agree — open the data room"
            )}
          </button>
          {error && (
            <p role="alert" className="mt-2 text-sm text-bear">
              {error}
            </p>
          )}
        </div>
      </form>

      <p className="mt-4 text-xs leading-relaxed text-tertiary">
        Accepting records the time, the version of the terms, a hashed network address and your browser
        family — never the raw address. The founder sees who agreed and when.
      </p>
    </section>
  );
}
