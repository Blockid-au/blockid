"use client";

// "Delete account" section of Account settings (S24-B).
// Talks to /api/account/delete: status (GET), reauth / request / cancel (POST).

import { useEffect, useState } from "react";

export interface DeletionStatusView {
  pending: boolean;
  requestedAt: string | null;
  scheduledFor: string | null;
  hasPassword: boolean;
  erased: boolean;
  graceDays: number;
  isAdmin: boolean;
}

interface SharedProject {
  id: string;
  name: string;
  slug: string | null;
  members: number;
}

type ApiResult = {
  ok: boolean;
  reason?: string;
  detail?: string;
  projects?: SharedProject[];
  scheduledFor?: string;
  sent?: boolean;
  error?: string;
  retryInSeconds?: number;
};

const CONFIRM = "DELETE";

function fmt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function DeleteAccountSection({
  initial,
  reauthToken,
  flag,
}: {
  initial: DeletionStatusView;
  /** `?delete_token=` from the re-auth email — pre-fills the token step. */
  reauthToken?: string | null;
  /** `?deletion=cancelled|invalid` from the cancel link. */
  flag?: string | null;
}) {
  const [status, setStatus] = useState<DeletionStatusView>(initial);
  const [open, setOpen] = useState<boolean>(Boolean(reauthToken));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [token, setToken] = useState<string>(reauthToken ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err" | "info"; text: string } | null>(
    flag === "cancelled" ? { kind: "ok", text: "Deletion cancelled — your account stays." } : flag === "invalid" ? { kind: "err", text: "That cancel link is no longer valid." } : null,
  );
  const [shared, setShared] = useState<SharedProject[]>([]);

  useEffect(() => {
    if (reauthToken && typeof window !== "undefined") {
      // keep the single-use token out of the address bar / history
      const url = new URL(window.location.href);
      url.searchParams.delete("delete_token");
      window.history.replaceState(null, "", url.toString());
    }
  }, [reauthToken]);

  async function post(body: Record<string, unknown>): Promise<{ res: Response; data: ApiResult }> {
    const res = await fetch("/api/account/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({ ok: false }))) as ApiResult;
    return { res, data };
  }

  async function sendReauth() {
    setBusy(true);
    setMsg(null);
    try {
      const { res, data } = await post({ action: "reauth" });
      if (!res.ok || !data.ok) setMsg({ kind: "err", text: data.error ?? data.reason ?? `HTTP ${res.status}` });
      else setMsg({ kind: "info", text: "Check your email — the confirmation link is valid for 15 minutes." });
    } finally {
      setBusy(false);
    }
  }

  async function submitRequest(e: React.FormEvent) {
    e.preventDefault();
    if (confirmation.trim() !== CONFIRM) {
      setMsg({ kind: "err", text: `Type ${CONFIRM} exactly to confirm.` });
      return;
    }
    setBusy(true);
    setMsg(null);
    setShared([]);
    try {
      const body: Record<string, unknown> = { action: "request", confirmation: confirmation.trim(), reason: reason.trim() || undefined };
      if (token) body.token = token;
      else body.password = password;
      const { res, data } = await post(body);
      if (res.status === 409 && data.reason === "shared_projects") {
        setShared(data.projects ?? []);
        setMsg({ kind: "err", text: "You own projects that other people still work in. Transfer or archive them first." });
        return;
      }
      if (res.status === 401 && data.reason === "reauth_required") {
        setToken("");
        setMsg({
          kind: "err",
          text: data.detail === "bad_password" ? "Password incorrect." : data.detail === "expired" ? "That confirmation link expired — request a new one." : "Please confirm it's you first.",
        });
        return;
      }
      if (!res.ok || !data.ok) {
        setMsg({ kind: "err", text: data.error ?? data.reason ?? `HTTP ${res.status}` });
        return;
      }
      setStatus((s) => ({ ...s, pending: true, scheduledFor: data.scheduledFor ?? s.scheduledFor, requestedAt: new Date().toISOString() }));
      setOpen(false);
      setPassword("");
      setConfirmation("");
      setMsg({ kind: "ok", text: `Deletion scheduled for ${fmt(data.scheduledFor ?? null)}. We emailed you a link to cancel.` });
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    setBusy(true);
    setMsg(null);
    try {
      const { res, data } = await post({ action: "cancel" });
      if (!res.ok || !data.ok) setMsg({ kind: "err", text: data.reason ?? `HTTP ${res.status}` });
      else {
        setStatus((s) => ({ ...s, pending: false, requestedAt: null, scheduledFor: null }));
        setMsg({ kind: "ok", text: "Deletion cancelled — your account stays." });
      }
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-xl border border-surface-300 bg-white px-4 py-2.5 text-sm text-ink-800 placeholder:text-muted focus:border-brand-500 focus:ring-1 focus:ring-brand-200 outline-none transition-all";

  return (
    <section className="bg-white border border-red-200 shadow-sm rounded-2xl p-6" aria-labelledby="delete-account-heading">
      <h2 id="delete-account-heading" className="text-base font-semibold text-ink-800 mb-1">Delete account</h2>
      <p className="text-xs text-ink-600 mb-4">
        Deleting your account removes your profile, projects, reports, data rooms, evidence, API keys and sessions, cancels any Stripe subscription and removes saved payment methods. Invoices and credit ledgers are kept in de-identified form for the 7-year period the Privacy Policy requires (clause 4), as are consent records and the audit log.
      </p>
      <p className="text-xs text-ink-600 mb-4">
        <strong>{status.graceDays}-day grace period:</strong> nothing is erased for {status.graceDays} days after you confirm. You can cancel at any time in that window — from this page or the link in the confirmation email. After that the erasure runs automatically and cannot be undone.
      </p>

      {msg && (
        <p role="status" className={`text-xs mb-3 rounded-lg px-3 py-2 ${msg.kind === "ok" ? "bg-emerald-50 text-emerald-800" : msg.kind === "info" ? "bg-brand-50 text-brand-800" : "bg-red-50 text-red-800"}`}>
          {msg.text}
        </p>
      )}

      {status.isAdmin ? (
        <p className="text-xs text-ink-700">Admin accounts cannot be deleted from here — use the admin console (another admin must perform it).</p>
      ) : status.pending ? (
        <div className="space-y-3">
          <p className="text-sm text-ink-800">
            Deletion scheduled for <strong>{fmt(status.scheduledFor)}</strong>.
          </p>
          <button type="button" onClick={cancel} disabled={busy} className="rounded-xl border border-surface-300 px-4 py-2 text-sm font-medium text-ink-800 hover:bg-surface-50 disabled:opacity-50">
            Keep my account
          </button>
        </div>
      ) : !open ? (
        <button type="button" onClick={() => setOpen(true)} className="rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50">
          Delete my account…
        </button>
      ) : (
        <form onSubmit={submitRequest} className="space-y-3">
          {shared.length > 0 && (
            <ul className="text-xs text-red-800 bg-red-50 rounded-lg px-3 py-2 space-y-1" aria-label="Projects shared with other members">
              {shared.map((p) => (
                <li key={p.id}>
                  <a className="underline" href={p.slug ? `/workspace/team?project=${encodeURIComponent(p.slug)}` : "/workspace/team"}>
                    {p.name}
                  </a>{" "}
                  — {p.members} other member{p.members === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          )}

          {token ? (
            <p className="text-xs text-emerald-800 bg-emerald-50 rounded-lg px-3 py-2">Email confirmed — finish below.</p>
          ) : status.hasPassword ? (
            <label className="block">
              <span className="block text-xs text-ink-700 mb-1">Your password</span>
              <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} required />
            </label>
          ) : (
            <div className="text-xs text-ink-700 space-y-2">
              <p>Your account has no password (Google or email sign-in). Confirm by email first:</p>
              <button type="button" onClick={sendReauth} disabled={busy} className="rounded-xl border border-surface-300 px-3 py-1.5 text-xs font-medium text-ink-800 hover:bg-surface-50 disabled:opacity-50">
                Email me a confirmation link
              </button>
            </div>
          )}

          <label className="block">
            <span className="block text-xs text-ink-700 mb-1">Type <strong>{CONFIRM}</strong> to confirm</span>
            <input type="text" value={confirmation} onChange={(e) => setConfirmation(e.target.value)} className={input} placeholder={CONFIRM} autoComplete="off" required />
          </label>

          <label className="block">
            <span className="block text-xs text-ink-700 mb-1">Why are you leaving? (optional)</span>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} className={input} maxLength={500} />
          </label>

          <div className="flex gap-2">
            <button type="submit" disabled={busy || (!token && status.hasPassword && !password) || (!token && !status.hasPassword)} className="rounded-xl bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50">
              Schedule deletion
            </button>
            <button type="button" onClick={() => { setOpen(false); setMsg(null); }} className="rounded-xl border border-surface-300 px-4 py-2 text-sm font-medium text-ink-800 hover:bg-surface-50">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
