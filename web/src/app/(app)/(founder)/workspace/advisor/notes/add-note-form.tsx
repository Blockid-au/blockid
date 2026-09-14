"use client";

// Add-note form for /workspace/advisor/notes.
//
// S31-B (2026-09-13). This was a native <form method="post"> posting
// application/x-www-form-urlencoded to POST /api/advisor/notes, which does
// request.json() — every submit answered 400 {"error":"invalid_json"} as a
// raw JSON page and the note was never saved. Posts JSON now, validates
// inline, disables while pending and refreshes the timeline on success.

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

const ERRORS: Record<string, string> = {
  body_required: "Write something before saving.",
  client_id_required: "Pick a client first.",
  unauthorized: "Your session has expired — sign in again.",
  invalid_json: "The note could not be sent. Try again.",
};

export function humaniseNoteError(code: string | undefined, status: number): string {
  if (code && ERRORS[code]) return ERRORS[code]!;
  if (status >= 500) return "Could not save the note just now. Try again in a moment.";
  return "Could not save the note.";
}

export function AddNoteForm({ clientId }: { clientId: string }) {
  const router = useRouter();
  const [body, setBody] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const text = body.trim();
    if (!text) {
      setError(ERRORS.body_required!);
      return;
    }
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/advisor/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId, body: text }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(humaniseNoteError(json?.error, res.status));
        return;
      }
      setBody("");
      setSaved(true);
      router.refresh();
    } catch {
      setError("Network error — the note was not saved. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
      <label className="block">
        <span className="text-xs uppercase tracking-wide text-slate-500">Note body</span>
        <textarea
          name="body"
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            if (error) setError(null);
          }}
          required
          rows={5}
          aria-invalid={error ? true : undefined}
          className="mt-1 block w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-ink-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
          placeholder="What did you discuss? Next actions? Blockers?"
        />
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
      {saved && !error && (
        <p role="status" className="text-sm text-emerald-700">
          Note saved.
        </p>
      )}
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
          {pending ? "Saving…" : "Save note"}
        </button>
      </div>
    </form>
  );
}
