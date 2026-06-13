"use client";

import * as React from "react";
import { CheckCircle2, Clock, XCircle, Copy, ExternalLink, Trash2, Plus, X } from "lucide-react";

interface LinkRow {
  token: string;
  slug: string | null;
  scoreId: string;
  investorEmail: string | null;
  investorName: string | null;
  fundName: string | null;
  note: string | null;
  createdByEmail: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  viewCount: number;
  lastViewedAt: string | null;
  status: "active" | "revoked" | "expired";
  url: string;
}

interface Props {
  links: LinkRow[];
}

function StatusBadge({ status }: { status: "active" | "revoked" | "expired" }) {
  if (status === "active") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
        <CheckCircle2 className="h-3 w-3" />
        Active
      </span>
    );
  }
  if (status === "revoked") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-medium text-red-700">
        <XCircle className="h-3 w-3" />
        Revoked
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
      <Clock className="h-3 w-3" />
      Expired
    </span>
  );
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}w ago`;
  return formatDate(iso);
}

// ---------------------------------------------------------------------------
// Create Link Modal
// ---------------------------------------------------------------------------
interface CreateModalProps {
  onClose: () => void;
  onCreated: (link: LinkRow) => void;
}

function CreateLinkModal({ onClose, onCreated }: CreateModalProps) {
  const [investorEmail, setInvestorEmail] = React.useState("");
  const [investorName, setInvestorName] = React.useState("");
  const [fundName, setFundName] = React.useState("");
  const [scoreId, setScoreId] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [note, setNote] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!investorEmail.trim() || !investorEmail.includes("@")) {
      setError("A valid investor email is required.");
      return;
    }
    if (!scoreId.trim()) {
      setError("Score ID is required.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/investor-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scoreId: scoreId.trim(),
          investorEmail: investorEmail.trim(),
          investorName: investorName.trim() || undefined,
          fundName: fundName.trim() || undefined,
          note: note.trim() || undefined,
          expiresAt: expiresAt || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        error?: string;
        token?: string;
        slug?: string | null;
        url?: string;
        investorEmail?: string | null;
        investorName?: string | null;
        fundName?: string | null;
        createdAt?: string;
      };
      if (!json.ok) {
        setError(json.error ?? "Failed to create link.");
        setLoading(false);
        return;
      }
      // Build the new row from the response so we can push it into local state
      const newLink: LinkRow = {
        token: json.token!,
        slug: json.slug ?? null,
        scoreId: scoreId.trim(),
        investorEmail: json.investorEmail ?? null,
        investorName: json.investorName ?? null,
        fundName: fundName.trim() || null,
        note: note.trim() || null,
        createdByEmail: "",
        createdAt: json.createdAt ?? new Date().toISOString(),
        expiresAt: expiresAt || null,
        revokedAt: null,
        viewCount: 0,
        lastViewedAt: null,
        status: "active",
        url: json.url!,
      };
      onCreated(newLink);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl border border-surface-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-surface-100">
          <h2 className="text-base font-semibold text-ink-800">Create Investor Link</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-400 hover:bg-surface-100 hover:text-ink-600 transition-colors"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <Field label="Score ID *" htmlFor="scoreId">
            <input
              id="scoreId"
              type="text"
              required
              value={scoreId}
              onChange={(e) => setScoreId(e.target.value)}
              placeholder="e.g. abc123 (from your SVI report URL)"
              className="input-base"
            />
          </Field>

          <Field label="Investor Email *" htmlFor="investorEmail">
            <input
              id="investorEmail"
              type="email"
              required
              value={investorEmail}
              onChange={(e) => setInvestorEmail(e.target.value)}
              placeholder="investor@example.com"
              className="input-base"
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Investor Name" htmlFor="investorName">
              <input
                id="investorName"
                type="text"
                value={investorName}
                onChange={(e) => setInvestorName(e.target.value)}
                placeholder="Jane Smith"
                className="input-base"
              />
            </Field>
            <Field label="Fund Name" htmlFor="fundName">
              <input
                id="fundName"
                type="text"
                value={fundName}
                onChange={(e) => setFundName(e.target.value)}
                placeholder="Acme Ventures"
                className="input-base"
              />
            </Field>
          </div>

          <Field label="Expires At (optional)" htmlFor="expiresAt">
            <input
              id="expiresAt"
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="input-base"
            />
          </Field>

          <Field label="Note (optional)" htmlFor="note">
            <textarea
              id="note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Internal note about this investor..."
              className="input-base resize-none"
            />
          </Field>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60 transition-colors"
            >
              {loading ? "Creating…" : "Create Link"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-ink-500 mb-1.5">
        {label}
      </label>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main client component
// ---------------------------------------------------------------------------
export function InvestorLinksClient({ links: initialLinks }: Props) {
  const [links, setLinks] = React.useState<LinkRow[]>(initialLinks);
  const [showModal, setShowModal] = React.useState(false);
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [copiedToken, setCopiedToken] = React.useState<string | null>(null);

  function handleCreated(link: LinkRow) {
    setLinks((prev) => [link, ...prev]);
    setShowModal(false);
  }

  async function handleRevoke(token: string) {
    if (!confirm("Revoke this investor link? The investor will no longer be able to view the report.")) return;
    setRevoking(token);
    try {
      const res = await fetch(`/api/investor-link?id=${encodeURIComponent(token)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (json.ok) {
        setLinks((prev) =>
          prev.map((l) =>
            l.token === token
              ? { ...l, revokedAt: new Date().toISOString(), status: "revoked" as const }
              : l,
          ),
        );
      } else {
        alert(json.error ?? "Failed to revoke link.");
      }
    } catch {
      alert("Network error. Please try again.");
    } finally {
      setRevoking(null);
    }
  }

  async function handleCopy(url: string, token: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    } catch {
      /* ignore */
    }
  }

  if (links.length === 0) {
    return (
      <>
        {showModal && (
          <CreateLinkModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
        )}
        <div className="rounded-2xl border border-dashed border-surface-300 bg-surface-50 p-12 text-center">
          <div className="mx-auto mb-4 h-12 w-12 rounded-xl bg-brand-50 flex items-center justify-center">
            <Plus className="h-6 w-6 text-brand-500" />
          </div>
          <p className="text-sm font-medium text-ink-700">No investor links yet</p>
          <p className="mt-1 text-sm text-ink-400">
            Create a per-investor link to track views and attribution per investor.
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Create First Link
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {showModal && (
        <CreateLinkModal onClose={() => setShowModal(false)} onCreated={handleCreated} />
      )}

      <div className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-100">
          <p className="text-sm font-medium text-ink-600">
            {links.length} investor link{links.length !== 1 ? "s" : ""}
          </p>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            New Link
          </button>
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-50 text-left">
                <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Investor
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Views
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Last Viewed
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Expires
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Status
                </th>
                <th className="px-4 py-3 text-xs font-medium uppercase tracking-wide text-ink-400">
                  Created
                </th>
                <th className="px-6 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {links.map((link) => (
                <tr key={link.token} className="hover:bg-surface-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-medium text-ink-800 truncate max-w-[200px]">
                      {link.investorName || link.investorEmail || "—"}
                    </p>
                    {link.investorName && link.investorEmail && (
                      <p className="text-xs text-ink-400 truncate">{link.investorEmail}</p>
                    )}
                    {link.fundName && (
                      <p className="text-xs text-ink-400 truncate">{link.fundName}</p>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className="font-mono tabular-nums font-semibold text-ink-700">
                      {link.viewCount}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-ink-500 text-xs">
                    {formatRelative(link.lastViewedAt)}
                  </td>
                  <td className="px-4 py-4 text-ink-500 text-xs">
                    {link.expiresAt ? formatDate(link.expiresAt) : "Never"}
                  </td>
                  <td className="px-4 py-4">
                    <StatusBadge status={link.status} />
                  </td>
                  <td className="px-4 py-4 text-ink-400 text-xs tabular-nums">
                    {formatDate(link.createdAt)}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 justify-end">
                      {/* Copy link */}
                      <button
                        onClick={() => handleCopy(link.url, link.token)}
                        title="Copy link"
                        className="rounded-lg p-1.5 text-ink-400 hover:bg-surface-100 hover:text-ink-600 transition-colors"
                      >
                        {copiedToken === link.token ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </button>
                      {/* Open link */}
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Open link"
                        className="rounded-lg p-1.5 text-ink-400 hover:bg-surface-100 hover:text-ink-600 transition-colors"
                      >
                        <ExternalLink className="h-4 w-4" />
                      </a>
                      {/* Revoke */}
                      {link.status === "active" && (
                        <button
                          onClick={() => handleRevoke(link.token)}
                          disabled={revoking === link.token}
                          title="Revoke link"
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-surface-100">
          {links.map((link) => (
            <div key={link.token} className="px-5 py-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink-800 truncate">
                    {link.investorName || link.investorEmail || "—"}
                  </p>
                  {link.investorName && link.investorEmail && (
                    <p className="text-xs text-ink-400 truncate">{link.investorEmail}</p>
                  )}
                  {link.fundName && (
                    <p className="text-xs text-ink-400 truncate">{link.fundName}</p>
                  )}
                </div>
                <StatusBadge status={link.status} />
              </div>
              <div className="flex items-center gap-4 text-xs text-ink-500">
                <span>
                  <span className="font-semibold tabular-nums text-ink-700">{link.viewCount}</span> views
                </span>
                <span>Last: {formatRelative(link.lastViewedAt)}</span>
                <span>Created: {formatDate(link.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopy(link.url, link.token)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-100 transition-colors"
                >
                  {copiedToken === link.token ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy Link
                    </>
                  )}
                </button>
                <a
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-surface-200 px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-surface-100 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open
                </a>
                {link.status === "active" && (
                  <button
                    onClick={() => handleRevoke(link.token)}
                    disabled={revoking === link.token}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Revoke
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <style jsx global>{`
        .input-base {
          width: 100%;
          border-radius: 0.5rem;
          border: 1px solid #e5e7eb;
          background: white;
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          color: #111827;
          transition: border-color 0.15s;
          outline: none;
        }
        .input-base:focus {
          border-color: #6366f1;
          box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
        }
        .input-base::placeholder {
          color: #9ca3af;
        }
      `}</style>
    </>
  );
}
