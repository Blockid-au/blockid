"use client";

/**
 * Accept-invite button.
 *
 * Q4 Multi-project #3 (iteration-13 T4). Renders inside /invites/[token]
 * for authenticated invitees.
 *
 * S17-A review (P2-5): the invite is bound to the invited email. When the
 * signed-in email differs, the Accept button is not offered — the server
 * would refuse with `invite_email_mismatch` (403) anyway — and the page
 * explains which address to sign in with (or to ask the owner for a new
 * invite to this address).
 */

import * as React from "react";
import { useRouter } from "next/navigation";

interface Props {
  token: string;
  expectedEmail: string;
  currentEmail: string;
}

export function AcceptInviteClient({ token, expectedEmail, currentEmail }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const mismatch =
    expectedEmail.trim().toLowerCase() !== currentEmail.trim().toLowerCase();

  const handleAccept = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/projects/members/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(
          body.code === "invite_email_mismatch"
            ? `This invite was sent to ${expectedEmail}. Sign in with that email to accept it, or ask the project owner to invite ${currentEmail} instead.`
            : (body.error ?? `HTTP ${res.status}`),
        );
        return;
      }
      setDone(true);
      // S17-A: the API already pinned the shared project as the active
      // workspace (blockid_project cookie) and tells us where to land.
      // Full navigation so server layouts re-read the cookie.
      const target =
        typeof body.redirect === "string" && body.redirect.startsWith("/")
          ? body.redirect
          : "/workspace/projects";
      setTimeout(() => {
        if (typeof window !== "undefined") window.location.assign(target);
        else router.push(target);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  // Sign the wrong account out, then land on login with `next=` pointing
  // back at this invite so the right account can accept it.
  const handleSwitchAccount = async () => {
    setSubmitting(true);
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
    } finally {
      const next = `/auth/login?next=${encodeURIComponent(`/invites/${token}`)}`;
      if (typeof window !== "undefined") window.location.assign(next);
      else router.push(next);
    }
  };

  if (done) {
    return (
      <p className="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        Invite accepted — opening the shared project…
      </p>
    );
  }

  if (mismatch) {
    return (
      <div className="mt-6 space-y-3">
        <p
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          You&apos;re signed in as <b>{currentEmail}</b>, but this invite was
          sent to <b>{expectedEmail}</b>. Invites can only be accepted by the
          email address they were sent to.
        </p>
        <p className="text-sm text-ink-600">
          Sign out and sign in as <b>{expectedEmail}</b> to accept, or ask the
          project owner to send a new invite to <b>{currentEmail}</b>.
        </p>
        <button
          type="button"
          onClick={handleSwitchAccount}
          disabled={submitting}
          className="inline-flex w-full items-center justify-center rounded-md border border-ink-300 bg-white px-4 py-2 text-sm font-semibold text-ink-800 shadow-sm hover:bg-surface-50 disabled:opacity-50"
        >
          {submitting ? "Signing out…" : `Sign in as ${expectedEmail}`}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      <button
        type="button"
        onClick={handleAccept}
        disabled={submitting}
        className="inline-flex w-full items-center justify-center rounded-md bg-ink-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-ink-900 disabled:opacity-50"
      >
        {submitting ? "Accepting…" : "Accept invitation"}
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
