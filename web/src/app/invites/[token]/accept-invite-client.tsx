"use client";

/**
 * Accept-invite button.
 *
 * Q4 Multi-project #3 (iteration-13 T4). Renders inside /invites/[token]
 * for authenticated invitees. Warns if the signed-in email differs from
 * the invited email (still lets them accept — the owner may have intended
 * a personal account instead of a work one).
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
        setError(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDone(true);
      // Give the user a beat to see the success then send them to the workspace.
      setTimeout(() => router.push("/workspace/projects"), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <p className="mt-6 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-800">
        Invite accepted — taking you to your workspace…
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-3">
      {mismatch && (
        <p className="rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
          You&apos;re signed in as <b>{currentEmail}</b> but this invite was
          addressed to <b>{expectedEmail}</b>. Accepting will bind the invite
          to your current account.
        </p>
      )}
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
