"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Copy,
  Key,
  Loader2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiKeyInfo } from "@/lib/api-keys";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ApiKeysClientProps {
  keys: ApiKeyInfo[];
  canCreate: boolean;
  currentPlan: string;
  rateLimit: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ApiKeysClient({
  keys: initialKeys,
  canCreate,
  currentPlan,
  rateLimit,
}: ApiKeysClientProps) {
  const [keys, setKeys] = React.useState<ApiKeyInfo[]>(initialKeys);
  const [showCreateModal, setShowCreateModal] = React.useState(false);
  const [showRevokeConfirm, setShowRevokeConfirm] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Revoke key
  // -----------------------------------------------------------------------

  async function handleRevoke(keyId: string) {
    setRevoking(keyId);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        setKeys((prev) =>
          prev.map((k) => (k.id === keyId ? { ...k, isActive: false } : k)),
        );
        setShowRevokeConfirm(null);
      } else {
        setError(json.reason ?? "Failed to revoke key.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setRevoking(null);
    }
  }

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Upgrade CTA for non-Growth plans */}
      {!canCreate && (
        <section className="rounded-2xl border border-amber-200 bg-amber-50/50 p-6 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-amber-100 flex items-center justify-center">
              <Shield strokeWidth={1.75} className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-800">
                API Access Requires Growth Plan
              </h2>
              <p className="text-sm text-ink-600">
                Upgrade to the Growth plan or above to generate API keys and
                integrate BlockID into your workflow.
              </p>
            </div>
          </div>
          <Link
            href="/workspace/billing"
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
          >
            <Sparkles strokeWidth={1.75} className="h-4 w-4" />
            Upgrade Now
          </Link>
        </section>
      )}

      {/* Header + Create button */}
      <section className="rounded-2xl border border-surface-200 bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-surface-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-brand-50 flex items-center justify-center">
              <Key strokeWidth={1.75} className="h-4.5 w-4.5 text-brand-600" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink-800">Your API Keys</h2>
              <p className="text-xs text-ink-600">
                {rateLimit.toLocaleString()} requests/minute on your{" "}
                {currentPlan === "free" ? "Starter" : currentPlan.charAt(0).toUpperCase() + currentPlan.slice(1)}{" "}
                plan
              </p>
            </div>
          </div>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <Plus strokeWidth={1.75} className="h-4 w-4" />
              Generate New Key
            </button>
          )}
        </div>

        {/* Key list */}
        <div className="divide-y divide-surface-200">
          {keys.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Key strokeWidth={1.5} className="h-8 w-8 text-ink-300 mx-auto mb-3" />
              <p className="text-sm text-ink-500">No API keys yet.</p>
              {canCreate && (
                <p className="text-xs text-ink-400 mt-1">
                  Click &quot;Generate New Key&quot; to create your first key.
                </p>
              )}
            </div>
          ) : (
            keys.map((key) => (
              <div
                key={key.id}
                className={cn(
                  "px-6 py-4 flex items-center justify-between gap-4",
                  !key.isActive && "opacity-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-ink-800 truncate">
                      {key.name}
                    </span>
                    {key.isActive ? (
                      <span className="text-[10px] uppercase tracking-wider font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        Active
                      </span>
                    ) : (
                      <span className="text-[10px] uppercase tracking-wider font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                        Revoked
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4 mt-1">
                    <code className="text-xs text-ink-500 font-mono">{key.prefix}</code>
                    <span className="text-xs text-ink-400">
                      Created{" "}
                      {new Date(key.createdAt).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    {key.lastUsedAt && (
                      <span className="text-xs text-ink-400">
                        Last used{" "}
                        {new Date(key.lastUsedAt).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </span>
                    )}
                  </div>
                </div>

                {key.isActive && (
                  <button
                    type="button"
                    onClick={() => setShowRevokeConfirm(key.id)}
                    className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer shrink-0"
                    title="Revoke key"
                  >
                    <Trash2 strokeWidth={1.75} className="h-4 w-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>
      </section>

      {/* API docs link */}
      <div className="text-center">
        <Link
          href="/developers"
          className="text-sm text-brand-600 hover:text-brand-700 font-medium hover:underline"
        >
          View API Documentation &rarr;
        </Link>
      </div>

      {/* Create modal */}
      {showCreateModal && (
        <CreateKeyModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newKey) => {
            setKeys((prev) => [newKey, ...prev]);
          }}
        />
      )}

      {/* Revoke confirmation dialog */}
      {showRevokeConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setShowRevokeConfirm(null)}
          />
          <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl max-w-sm w-full p-6 space-y-4">
            <h3 className="text-base font-semibold text-ink-800">Revoke API Key</h3>
            <p className="text-sm text-ink-600">
              This action cannot be undone. Any applications using this key will
              immediately lose access.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={() => setShowRevokeConfirm(null)}
                className="h-9 px-4 rounded-[10px] border border-surface-200 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRevoke(showRevokeConfirm)}
                disabled={revoking === showRevokeConfirm}
                className={cn(
                  "h-9 px-4 rounded-[10px] bg-red-600 text-sm font-semibold text-white hover:bg-red-700 transition-colors cursor-pointer flex items-center gap-1.5",
                  revoking === showRevokeConfirm && "opacity-60 cursor-wait",
                )}
              >
                {revoking === showRevokeConfirm && (
                  <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                )}
                Revoke Key
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Create Key Modal
// ---------------------------------------------------------------------------

function CreateKeyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (key: ApiKeyInfo) => void;
}) {
  const [name, setName] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [createdKey, setCreatedKey] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Default" }),
      });
      const json = await res.json();
      if (json.ok) {
        setCreatedKey(json.key);
        onCreated({
          id: json.id,
          name: json.name,
          prefix: json.prefix,
          isActive: true,
          lastUsedAt: null,
          createdAt: new Date().toISOString(),
          permissions: json.permissions ?? ["svi:read", "svi:create", "score:create"],
          rateLimitPerMin: json.rateLimitPerMin ?? 100,
        });
      } else {
        setError(json.reason ?? "Failed to create key.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!createdKey) return;
    try {
      await navigator.clipboard.writeText(createdKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: select text
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={!createdKey ? onClose : undefined} />
      <div className="relative bg-white rounded-2xl border border-surface-200 shadow-xl max-w-md w-full p-6 space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-ink-800">
            {createdKey ? "API Key Created" : "Generate New API Key"}
          </h3>
          {!createdKey && (
            <button
              type="button"
              onClick={onClose}
              className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-400 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
            >
              <X strokeWidth={1.75} className="h-4 w-4" />
            </button>
          )}
        </div>

        {createdKey ? (
          /* ---- Key created — show once ---- */
          <div className="space-y-4">
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-start gap-2.5">
              <AlertTriangle strokeWidth={1.75} className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">
                Save this key now. You will not be able to see it again.
              </p>
            </div>

            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
              <label className="text-xs font-medium text-ink-500 mb-2 block">
                Your API Key
              </label>
              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm font-mono text-ink-800 break-all select-all">
                  {createdKey}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    "h-8 w-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer shrink-0",
                    copied
                      ? "bg-emerald-50 text-emerald-600"
                      : "text-ink-400 hover:text-ink-700 hover:bg-surface-100",
                  )}
                  title="Copy to clipboard"
                >
                  {copied ? (
                    <Check strokeWidth={1.75} className="h-4 w-4" />
                  ) : (
                    <Copy strokeWidth={1.75} className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="w-full h-9 rounded-[10px] bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        ) : (
          /* ---- Create form ---- */
          <div className="space-y-4">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div>
              <label htmlFor="key-name" className="text-sm font-medium text-ink-700 mb-1.5 block">
                Key Name
              </label>
              <input
                id="key-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Production, Staging, CI/CD"
                maxLength={100}
                className="w-full h-9 rounded-[10px] border border-surface-200 bg-white px-3 text-sm text-ink-800 placeholder-ink-400 focus:outline-none focus:ring-2 focus:ring-brand-200 focus:border-brand-400 transition-colors"
              />
              <p className="text-xs text-ink-400 mt-1">
                A friendly label to help you identify this key.
              </p>
            </div>

            <div className="flex items-center gap-3 justify-end">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-[10px] border border-surface-200 text-sm font-medium text-ink-700 hover:bg-surface-50 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreate}
                disabled={loading}
                className={cn(
                  "h-9 px-4 rounded-[10px] bg-brand-600 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer flex items-center gap-1.5",
                  loading && "opacity-60 cursor-wait",
                )}
              >
                {loading ? (
                  <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" />
                ) : (
                  <Key strokeWidth={1.75} className="h-4 w-4" />
                )}
                Generate Key
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
