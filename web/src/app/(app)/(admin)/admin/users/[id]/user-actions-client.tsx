"use client";

// Client-side action panel for /admin/users/[id].
//
// Renders 3 buttons: Add credits (modal for amount + reason), Change role
// (user ↔ admin), Delete account (destructive — reason + typed-confirm).
// Each button POSTs to /api/admin/users/[id]/**. All mutations trigger a
// full router refresh so the server component re-loads with the new state.

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  userId: string;
  email: string;
  currentRole: "user" | "admin";
}

type Mode = null | "credits" | "role" | "delete";

interface ApiResult {
  ok: boolean;
  reason?: string;
  balance?: number;
}

export function UserActionsClient({ userId, email, currentRole }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Credits form
  const [creditAmount, setCreditAmount] = useState<string>("1.00");
  const [creditReason, setCreditReason] = useState<string>("admin_grant");

  // Role form
  const nextRole: "user" | "admin" = currentRole === "admin" ? "user" : "admin";

  // Delete form
  const [deleteReason, setDeleteReason] = useState<string>("");
  const [deleteConfirm, setDeleteConfirm] = useState<string>("");

  function close() {
    setMode(null);
    setMsg(null);
  }

  async function submitCredits() {
    setBusy(true);
    setMsg(null);
    try {
      const amount = Number(creditAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setMsg({ kind: "err", text: "Amount must be a positive number." });
        setBusy(false);
        return;
      }
      const res = await fetch(`/api/admin/users/${userId}/credits`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount, reason: creditReason || "admin_grant" }),
      });
      const body = (await res.json()) as ApiResult;
      if (!res.ok || !body.ok) {
        setMsg({ kind: "err", text: body.reason ?? `HTTP ${res.status}` });
      } else {
        setMsg({
          kind: "ok",
          text: `Granted ${amount.toFixed(2)}. New balance: ${(body.balance ?? 0).toFixed(2)}.`,
        });
        router.refresh();
      }
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function submitRole() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}/role`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ role: nextRole }),
      });
      const body = (await res.json()) as ApiResult;
      if (!res.ok || !body.ok) {
        setMsg({ kind: "err", text: body.reason ?? `HTTP ${res.status}` });
      } else {
        setMsg({ kind: "ok", text: `Role updated to ${nextRole}.` });
        router.refresh();
      }
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  async function submitDelete() {
    if (deleteConfirm !== email) {
      setMsg({ kind: "err", text: "Type the email exactly to confirm." });
      return;
    }
    if (!deleteReason.trim()) {
      setMsg({ kind: "err", text: "A reason is required for the audit log." });
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: deleteReason.trim() }),
      });
      const body = (await res.json()) as ApiResult;
      if (!res.ok || !body.ok) {
        setMsg({ kind: "err", text: body.reason ?? `HTTP ${res.status}` });
      } else {
        setMsg({ kind: "ok", text: "Account anonymised." });
        router.refresh();
      }
    } catch (err) {
      setMsg({ kind: "err", text: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setMode("credits");
            setMsg(null);
          }}
          className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          + Add credits
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("role");
            setMsg(null);
          }}
          className="rounded-md bg-surface-100 px-3 py-1.5 text-sm font-medium text-ink-800 ring-1 ring-surface-200 hover:bg-surface-200"
        >
          Change role → {nextRole}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("delete");
            setMsg(null);
          }}
          className="ml-auto rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white"
        >
          Delete account
        </button>
      </div>

      {msg && (
        <p
          className={`mt-3 text-sm ${
            msg.kind === "ok" ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {msg.text}
        </p>
      )}

      {mode === "credits" && (
        <Modal title="Add credits" onClose={close}>
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-500">
                Amount (credits)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="mt-1 w-full rounded-md border border-surface-300 bg-white px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-500">
                Reason (visible in credit_transactions)
              </label>
              <input
                type="text"
                value={creditReason}
                onChange={(e) => setCreditReason(e.target.value)}
                placeholder="admin_grant"
                className="mt-1 w-full rounded-md border border-surface-300 bg-white px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitCredits}
                disabled={busy}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Granting…" : "Grant credits"}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-md px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {mode === "role" && (
        <Modal title={`Change role to ${nextRole}`} onClose={close}>
          <div className="space-y-3">
            <p className="text-sm text-ink-700">
              Currently <strong>{currentRole}</strong>. This will grant them{" "}
              {nextRole === "admin"
                ? "full admin access including this dashboard."
                : "standard user access, revoking admin privileges."}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitRole}
                disabled={busy}
                className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Updating…" : `Set role to ${nextRole}`}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-md px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}

      {mode === "delete" && (
        <Modal title="Delete account (anonymise)" onClose={close}>
          <div className="space-y-3">
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
              This does <strong>not</strong> hard-delete the row (retention).
              Email and personal fields are scrubbed; sessions are revoked; the
              audit log records the reason and the actor.
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-500">
                Reason (mandatory — written to audit log)
              </label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. GDPR erasure request, ticket #123"
                className="mt-1 min-h-[60px] w-full rounded-md border border-surface-300 bg-white px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium uppercase tracking-wide text-ink-500">
                Type <code className="font-mono">{email}</code> to confirm
              </label>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="mt-1 w-full rounded-md border border-surface-300 bg-white px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={submitDelete}
                disabled={busy || deleteConfirm !== email || !deleteReason.trim()}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
              >
                {busy ? "Deleting…" : "Anonymise account"}
              </button>
              <button
                type="button"
                onClick={close}
                className="rounded-md px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-100"
              >
                Cancel
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-500 hover:bg-surface-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
