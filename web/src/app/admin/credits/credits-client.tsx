"use client";

import * as React from "react";
import { Coins, Search, X } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";

interface UserCredits {
  balance: number;
  lifetime_earned: number;
  lifetime_spent: number;
}

interface UserRow {
  id: string;
  email: string;
  display_name: string | null;
  plan: string | null;
  role: string;
  created_at: string;
  last_login_at: string | null;
  credits: UserCredits;
}

interface CreditsClientProps {
  user: { email: string; displayName: string | null };
  initialUsers: UserRow[];
}

type ModalAction = "grant" | "revoke";

export function CreditsClient({ user, initialUsers }: CreditsClientProps) {
  const [users, setUsers] = React.useState<UserRow[]>(initialUsers);
  const [search, setSearch] = React.useState("");
  const [modalOpen, setModalOpen] = React.useState(false);
  const [modalAction, setModalAction] = React.useState<ModalAction>("grant");
  const [modalEmail, setModalEmail] = React.useState("");
  const [modalAmount, setModalAmount] = React.useState("");
  const [modalReason, setModalReason] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Filter users by search
  const filtered = search.trim()
    ? users.filter(
        (u) =>
          u.email.toLowerCase().includes(search.toLowerCase()) ||
          (u.display_name ?? "").toLowerCase().includes(search.toLowerCase()),
      )
    : users;

  function openModal(email: string, action: ModalAction) {
    setModalEmail(email);
    setModalAction(action);
    setModalAmount("");
    setModalReason("");
    setFeedback(null);
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setModalEmail("");
    setModalAmount("");
    setModalReason("");
    setFeedback(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const amount = parseFloat(modalAmount);
    if (!amount || amount <= 0) {
      setFeedback({ type: "error", message: "Amount must be a positive number" });
      return;
    }
    if (!modalReason.trim()) {
      setFeedback({ type: "error", message: "Reason is required" });
      return;
    }

    setSubmitting(true);
    setFeedback(null);

    try {
      const res = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: modalEmail,
          amount,
          reason: modalReason.trim(),
          action: modalAction,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        setFeedback({
          type: "error",
          message: data.error ?? "Operation failed",
        });
        return;
      }

      // Update the local user list with the new balance
      setUsers((prev) =>
        prev.map((u) =>
          u.email === modalEmail
            ? {
                ...u,
                credits: {
                  ...u.credits,
                  balance: data.balance ?? u.credits.balance,
                  lifetime_earned:
                    modalAction === "grant"
                      ? u.credits.lifetime_earned + amount
                      : u.credits.lifetime_earned,
                },
              }
            : u,
        ),
      );

      setFeedback({
        type: "success",
        message: `${modalAction === "grant" ? "Granted" : "Revoked"} ${amount} credits. New balance: ${data.balance}`,
      });

      // Auto-close after success
      setTimeout(closeModal, 1500);
    } catch {
      setFeedback({ type: "error", message: "Network error" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminLayout user={user}>
      <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Coins strokeWidth={1.75} className="h-5 w-5 text-brand-600" />
            <h1 className="text-xl font-bold text-ink-800">
              Credit Management ({users.length})
            </h1>
          </div>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search
            strokeWidth={1.75}
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-400"
          />
          <input
            type="text"
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border border-surface-200 bg-white text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
          />
        </div>

        {/* Table */}
        <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200 bg-surface-100">
                  <th className="text-left px-6 py-3 text-xs text-ink-700 font-medium">
                    Email
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">
                    Name
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">
                    Plan
                  </th>
                  <th className="text-left px-4 py-3 text-xs text-ink-700 font-medium">
                    Role
                  </th>
                  <th className="text-right px-4 py-3 text-xs text-ink-700 font-medium">
                    Balance
                  </th>
                  <th className="text-right px-4 py-3 text-xs text-ink-700 font-medium">
                    Earned
                  </th>
                  <th className="text-right px-4 py-3 text-xs text-ink-700 font-medium">
                    Spent
                  </th>
                  <th className="text-center px-4 py-3 text-xs text-ink-700 font-medium">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-10 text-center text-ink-600"
                    >
                      {search ? "No users match your search" : "No users yet"}
                    </td>
                  </tr>
                ) : (
                  filtered.map((u) => (
                    <tr
                      key={u.id}
                      className="border-b border-surface-200/40 hover:bg-surface-50 transition-colors"
                    >
                      <td className="px-6 py-3 text-ink-600 font-mono text-xs">
                        {u.email}
                      </td>
                      <td className="px-4 py-3 text-ink-600 text-xs">
                        {u.display_name ?? "\u2014"}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${
                            u.plan === "founding50"
                              ? "bg-brand-100 text-brand-700"
                              : u.plan === "growth"
                                ? "bg-green-100 text-green-700"
                                : "bg-surface-100 text-ink-700"
                          }`}
                        >
                          {u.plan ?? "free"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] font-medium rounded px-1.5 py-0.5 ${
                            u.role === "admin"
                              ? "bg-red-100 text-red-700"
                              : "bg-surface-100 text-ink-700"
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-sm font-bold text-ink-800">
                        {formatCredits(u.credits.balance)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-green-600">
                        {formatCredits(u.credits.lifetime_earned)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-xs text-red-500">
                        {formatCredits(u.credits.lifetime_spent)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openModal(u.email, "grant")}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-green-50 text-green-700 border border-green-200 hover:bg-green-100 transition-colors cursor-pointer"
                          >
                            Grant
                          </button>
                          <button
                            type="button"
                            onClick={() => openModal(u.email, "revoke")}
                            className="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 transition-colors cursor-pointer"
                          >
                            Revoke
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={closeModal}
          />
          <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-ink-800">
                {modalAction === "grant" ? "Grant Credits" : "Revoke Credits"}
              </h2>
              <button
                type="button"
                onClick={closeModal}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-800 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <X strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-ink-700 mb-1">
                  User
                </label>
                <p className="text-sm text-ink-800 font-mono bg-surface-50 rounded-lg px-3 py-2 border border-surface-200">
                  {modalEmail}
                </p>
              </div>

              <div>
                <label
                  htmlFor="modal-amount"
                  className="block text-xs font-medium text-ink-700 mb-1"
                >
                  Amount (credits)
                </label>
                <input
                  id="modal-amount"
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={modalAmount}
                  onChange={(e) => setModalAmount(e.target.value)}
                  placeholder="e.g. 10"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-surface-200 bg-white text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                  autoFocus
                />
              </div>

              <div>
                <label
                  htmlFor="modal-reason"
                  className="block text-xs font-medium text-ink-700 mb-1"
                >
                  Reason
                </label>
                <input
                  id="modal-reason"
                  type="text"
                  value={modalReason}
                  onChange={(e) => setModalReason(e.target.value)}
                  placeholder="e.g. bonus for early adopter"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-surface-200 bg-white text-ink-800 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500"
                />
              </div>

              {feedback && (
                <div
                  className={`text-sm rounded-lg px-3 py-2 ${
                    feedback.type === "success"
                      ? "bg-green-50 text-green-700 border border-green-200"
                      : "bg-red-50 text-red-700 border border-red-200"
                  }`}
                >
                  {feedback.message}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  modalAction === "grant"
                    ? "bg-green-600 text-white hover:bg-green-700"
                    : "bg-red-600 text-white hover:bg-red-700"
                }`}
              >
                {submitting
                  ? "Processing..."
                  : modalAction === "grant"
                    ? "Grant Credits"
                    : "Revoke Credits"}
              </button>
            </form>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

/** Display-friendly credit amount: whole numbers as "1", fractional as "0.50". */
function formatCredits(amount: number): string {
  if (Number.isInteger(amount)) return String(amount);
  const formatted = amount.toFixed(2);
  return formatted.replace(/\.00$/, "");
}
