"use client";

// EvaluationsClient — table + "Add a startup" dialog + founder claim handler
// for /workspace/evaluations (T0270). All writes go through /api/evaluations.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ClipboardList, Loader2, Plus, Trash2, X, Pencil, Check, Mail } from "lucide-react";
import type { EvaluationListRow, EvaluationConsentTier } from "@/lib/evaluations";

// ---------------------------------------------------------------------------
// Props + local constants
// ---------------------------------------------------------------------------

export interface EvaluationsClientProps {
  initialEvaluations: EvaluationListRow[];
  used: number;
  limit: number;
  plan: string;
  isEvaluator: boolean;
  /** `?claim=<token>` from the founder invite email. */
  claimToken?: string | null;
}

const AU_STATE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "Select a state" },
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
  { value: "national", label: "National / not Australia" },
];

const STAGE_LABELS: Record<number, string> = {
  0: "Pre-idea",
  1: "Idea",
  2: "Validation",
  3: "MVP",
  4: "Early traction",
  5: "Growth",
  6: "Scale",
  7: "Mature",
};

const CONSENT_CHIP: Record<EvaluationConsentTier, { label: string; className: string }> = {
  attributed_only: {
    label: "Attributed only",
    className: "border-surface-300 bg-surface-100 text-ink-600",
  },
  reports_shared: {
    label: "Reports shared",
    className: "border-emerald-300 bg-emerald-50 text-emerald-700",
  },
  full_mentor: {
    label: "Full mentor",
    className: "border-brand-300 bg-brand-50 text-brand-700",
  },
};

export const EMPTY_STATE_COPY =
  "Add the first startup you're evaluating — every one gets the same 8-dimension rubric.";

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

function isUnlimited(limit: number): boolean {
  return limit >= Number.MAX_SAFE_INTEGER || limit >= 1_000_000;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EvaluationsClient({
  initialEvaluations,
  used: initialUsed,
  limit,
  plan,
  isEvaluator,
  claimToken = null,
}: EvaluationsClientProps) {
  const router = useRouter();
  const [rows, setRows] = React.useState<EvaluationListRow[]>(initialEvaluations);
  const [used, setUsed] = React.useState(initialUsed);

  // --- Add dialog state ---
  const [showAdd, setShowAdd] = React.useState(false);
  const [name, setName] = React.useState("");
  const [website, setWebsite] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [founderEmail, setFounderEmail] = React.useState("");
  const [state, setState] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);

  // --- Inline label edit ---
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [savingId, setSavingId] = React.useState<string | null>(null);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  // --- Founder claim (?claim=<token>) ---
  const [claimState, setClaimState] = React.useState<
    | { status: "idle" }
    | { status: "claiming" }
    | { status: "claimed"; projectName: string; already: boolean }
    | { status: "error"; message: string }
  >(claimToken ? { status: "claiming" } : { status: "idle" });

  const atLimit = !isUnlimited(limit) && used >= limit;
  const canAdd = isEvaluator && !atLimit;

  React.useEffect(() => {
    if (!claimToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/evaluations/claim/${encodeURIComponent(claimToken)}`, {
          method: "POST",
        });
        const json = (await res.json()) as {
          ok: boolean;
          project_name?: string;
          already_claimed?: boolean;
          message?: string;
          error?: string;
        };
        if (cancelled) return;
        if (json.ok) {
          setClaimState({
            status: "claimed",
            projectName: json.project_name ?? "this startup",
            already: Boolean(json.already_claimed),
          });
        } else {
          setClaimState({
            status: "error",
            message: json.message ?? (json.error === "not_found" ? "This invite link is no longer valid." : "Could not claim this startup."),
          });
        }
      } catch {
        if (!cancelled) setClaimState({ status: "error", message: "Network error. Please try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimToken]);

  function resetAddForm() {
    setName("");
    setWebsite("");
    setDescription("");
    setFounderEmail("");
    setState("");
    setCreateError(null);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          website: website.trim() || undefined,
          description: description.trim() || undefined,
          founder_email: founderEmail.trim() || undefined,
          state: state || undefined,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        evaluation?: EvaluationListRow;
        invite_sent?: boolean;
        used?: number;
        error?: string;
        message?: string;
        limit?: number;
      };
      if (json.ok && json.evaluation) {
        setRows((prev) => [json.evaluation as EvaluationListRow, ...prev]);
        setUsed(typeof json.used === "number" ? json.used : used + 1);
        setShowAdd(false);
        resetAddForm();
        if (founderEmail.trim()) {
          setNotice(
            json.invite_sent
              ? `Invite sent to ${founderEmail.trim()} — they can claim ${json.evaluation.projectName} to share their evidence.`
              : `Added ${json.evaluation.projectName}. The founder invite could not be emailed right now — you can re-send it later.`,
          );
        } else {
          setNotice(`Added ${json.evaluation.projectName}.`);
        }
        router.refresh();
      } else if (json.error === "evaluation_limit_reached") {
        setCreateError(
          json.message ?? `Your plan tracks up to ${json.limit ?? limit} startups. Upgrade to add more.`,
        );
      } else {
        setCreateError(json.message ?? json.error ?? "Failed to add the startup");
      }
    } catch {
      setCreateError("Network error. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function handleSaveLabel(id: string) {
    setSavingId(id);
    try {
      const res = await fetch(`/api/evaluations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel.trim() || null }),
      });
      const json = (await res.json()) as { ok: boolean; evaluation?: { label: string | null } };
      if (json.ok && json.evaluation) {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, label: json.evaluation?.label ?? null } : r)));
        setEditingId(null);
      }
    } catch {
      /* keep the editor open so the user can retry */
    } finally {
      setSavingId(null);
    }
  }

  async function handleRemove(row: EvaluationListRow) {
    if (!confirm(`Stop evaluating ${row.projectName}? The startup profile and any reports are kept.`)) return;
    setRemovingId(row.id);
    const snapshot = rows;
    setRows((prev) => prev.filter((r) => r.id !== row.id));
    try {
      const res = await fetch(`/api/evaluations/${row.id}`, { method: "DELETE" });
      const json = (await res.json()) as { ok: boolean };
      if (!json.ok) {
        setRows(snapshot);
      } else {
        setUsed((u) => Math.max(0, u - 1));
        router.refresh();
      }
    } catch {
      setRows(snapshot);
    } finally {
      setRemovingId(null);
    }
  }

  const limitLabel = isUnlimited(limit) ? "unlimited" : String(limit);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink-900">Startups I&apos;m evaluating</h1>
            <span className="inline-flex items-center rounded-full border border-brand-300 bg-brand-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-brand-700">
              Beta
            </span>
          </div>
          <p className="mt-1 text-sm text-ink-500">
            One rubric across every startup you track — 8 dimensions, the same evidence standard, AUD valuation range on demand.
          </p>
        </div>
        {canAdd ? (
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400/60 focus-visible:ring-offset-2"
          >
            <Plus strokeWidth={1.75} className="h-4 w-4" />
            Add a startup
          </button>
        ) : isEvaluator ? (
          <Link
            href="/pricing?segment=evaluator"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-brand-300 bg-white px-4 py-2.5 text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
          >
            Upgrade to track more
          </Link>
        ) : null}
      </header>

      {/* Founder claim outcome */}
      {claimState.status === "claiming" && (
        <div role="status" className="rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-ink-600 flex items-center gap-2">
          <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" /> Claiming your startup…
        </div>
      )}
      {claimState.status === "claimed" && (
        <div role="status" className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {claimState.already ? "You already claimed" : "You claimed"} <strong>{claimState.projectName}</strong>. Reports the evaluator runs on it are now shared with you.{" "}
          <Link href="/dashboard" className="underline font-medium">Go to your dashboard</Link>
        </div>
      )}
      {claimState.status === "error" && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {claimState.message}
        </div>
      )}

      {/* Plan-limit banner */}
      {isEvaluator && (
        <div
          data-testid="plan-limit-banner"
          className={
            atLimit
              ? "rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800 flex flex-wrap items-center justify-between gap-2"
              : "rounded-xl border border-surface-200 bg-white px-4 py-3 text-sm text-ink-600 flex flex-wrap items-center justify-between gap-2"
          }
        >
          <span>
            <strong>{used} of {limitLabel}</strong> tracked startup{limit === 1 ? "" : "s"} used
            <span className="mx-1.5 text-surface-300">|</span>
            <span className="capitalize">{plan.replace(/_/g, " ")}</span> plan
          </span>
          {atLimit && (
            <Link href="/pricing?segment=evaluator" className="font-semibold underline">
              Upgrade to track more
            </Link>
          )}
        </div>
      )}

      {!isEvaluator && claimState.status === "idle" && (
        <div className="rounded-xl border border-surface-200 bg-white px-5 py-6 text-sm text-ink-600">
          <p className="font-medium text-ink-900">This workspace is for evaluators.</p>
          <p className="mt-1">
            Investors, accelerators, incubators, advisors and service providers add the startups they assess here and score each on the same rubric.{" "}
            <Link href="/pricing?segment=evaluator" className="text-brand-700 underline">See evaluator plans</Link>
          </p>
        </div>
      )}

      {notice && (
        <div role="status" className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 flex items-start justify-between gap-3">
          <span>{notice}</span>
          <button type="button" onClick={() => setNotice(null)} aria-label="Dismiss" className="text-brand-700 hover:text-brand-900">
            <X strokeWidth={1.75} className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Table / empty state */}
      {isEvaluator && rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-14 text-center">
          <ClipboardList strokeWidth={1.5} className="mx-auto h-10 w-10 text-brand-500" />
          <p className="mt-4 text-base font-medium text-ink-900">{EMPTY_STATE_COPY}</p>
          <p className="mt-1 text-sm text-ink-500">
            Name, website and a one-line description are enough to start. Invite the founder and they can share their evidence.
          </p>
          {canAdd && (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer"
            >
              <Plus strokeWidth={1.75} className="h-4 w-4" />
              Add a startup
            </button>
          )}
        </div>
      ) : isEvaluator ? (
        <div className="overflow-x-auto rounded-2xl border border-surface-200 bg-white">
          <table className="min-w-full text-sm">
            <thead className="bg-surface-50 text-left text-xs uppercase tracking-wider text-ink-500">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">Startup</th>
                <th scope="col" className="px-4 py-3 font-semibold">Stage / SVI</th>
                <th scope="col" className="px-4 py-3 font-semibold">Consent</th>
                <th scope="col" className="px-4 py-3 font-semibold">Added</th>
                <th scope="col" className="px-4 py-3 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {rows.map((row) => {
                const chip = CONSENT_CHIP[row.consentTier] ?? CONSENT_CHIP.attributed_only;
                const editing = editingId === row.id;
                return (
                  <tr key={row.id} data-testid="evaluation-row" className="align-top">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-900">{row.projectName}</div>
                      {editing ? (
                        <div className="mt-1 flex items-center gap-1.5">
                          <input
                            aria-label="Label"
                            value={editLabel}
                            maxLength={120}
                            onChange={(e) => setEditLabel(e.target.value)}
                            className="w-44 rounded-md border border-surface-200 px-2 py-1 text-xs text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            placeholder="e.g. Cohort 4 shortlist"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveLabel(row.id)}
                            disabled={savingId === row.id}
                            aria-label="Save label"
                            className="rounded-md p-1 text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                          >
                            {savingId === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                          </button>
                          <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel" className="rounded-md p-1 text-ink-500 hover:bg-surface-100">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs text-ink-500">
                          {row.label ? <span className="rounded bg-surface-100 px-1.5 py-0.5 text-ink-700">{row.label}</span> : null}
                          {row.website ? (
                            <a href={row.website} target="_blank" rel="noopener noreferrer" className={row.label ? "ml-2 hover:underline" : "hover:underline"}>
                              {row.website.replace(/^https?:\/\//, "")}
                            </a>
                          ) : null}
                          {row.projectIndustry ? <span className="ml-2">{row.projectIndustry}</span> : null}
                          {row.state ? <span className="ml-2 uppercase">{row.state}</span> : null}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-700">
                      <div>{STAGE_LABELS[row.projectStage] ?? `Stage ${row.projectStage}`}</div>
                      <div className="text-xs text-ink-500">
                        {row.latestSvi != null ? (
                          <>SVI <strong className="text-ink-800">{Math.round(row.latestSvi)}</strong></>
                        ) : (
                          "Not scored yet"
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${chip.className}`}>
                        {chip.label}
                      </span>
                      {row.ownerKind === "founder_invited" && row.founderEmail ? (
                        <div className="mt-1 flex items-center gap-1 text-[11px] text-ink-500">
                          <Mail className="h-3 w-3" /> Invite sent to {row.founderEmail}
                        </div>
                      ) : null}
                      {row.ownerKind === "founder_claimed" ? (
                        <div className="mt-1 text-[11px] text-emerald-700">Founder claimed</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-600 whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/workspace/projects/${encodeURIComponent(row.projectSlug)}/analyze`}
                          className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-brand-700 hover:bg-brand-50"
                        >
                          {row.latestSvi != null ? "Open" : "Score"}
                        </Link>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(row.id);
                            setEditLabel(row.label ?? "");
                          }}
                          aria-label={`Edit label for ${row.projectName}`}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-surface-100 hover:text-ink-800"
                        >
                          <Pencil strokeWidth={1.75} className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(row)}
                          disabled={removingId === row.id}
                          aria-label={`Stop evaluating ${row.projectName}`}
                          className="rounded-lg p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                        >
                          {removingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 strokeWidth={1.75} className="h-4 w-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {/* Add dialog */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4" role="dialog" aria-modal="true" aria-labelledby="add-startup-title">
          <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-surface-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-surface-200">
              <h2 id="add-startup-title" className="text-lg font-bold text-ink-900">Add a startup</h2>
              <button
                type="button"
                onClick={() => { setShowAdd(false); setCreateError(null); }}
                aria-label="Close"
                className="h-8 w-8 flex items-center justify-center rounded-lg text-ink-500 hover:text-ink-700 hover:bg-surface-100 transition-colors cursor-pointer"
              >
                <X strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleAdd} className="px-6 py-5 space-y-4">
              <div>
                <label htmlFor="eval-name" className="block text-sm font-medium text-ink-700 mb-1">Startup name *</label>
                <input
                  id="eval-name"
                  type="text"
                  required
                  maxLength={100}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. SprocketBay"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-website" className="block text-sm font-medium text-ink-700 mb-1">
                  Website <span className="text-muted font-normal">(optional)</span>
                </label>
                <input
                  id="eval-website"
                  type="text"
                  inputMode="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="sprocketbay.com.au"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-desc" className="block text-sm font-medium text-ink-700 mb-1">One-line description</label>
                <input
                  id="eval-desc"
                  type="text"
                  maxLength={500}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Marketplace for industrial spare parts"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-founder" className="block text-sm font-medium text-ink-700 mb-1">
                  Founder email <span className="text-muted font-normal">(optional — we invite them to claim it)</span>
                </label>
                <input
                  id="eval-founder"
                  type="email"
                  value={founderEmail}
                  onChange={(e) => setFounderEmail(e.target.value)}
                  placeholder="founder@startup.com"
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 placeholder:text-muted focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>
              <div>
                <label htmlFor="eval-state" className="block text-sm font-medium text-ink-700 mb-1">State</label>
                <select
                  id="eval-state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  className="w-full rounded-lg border border-surface-200 px-3 py-2 text-sm text-ink-800 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                >
                  {AU_STATE_OPTIONS.map((o) => (
                    <option key={o.value || "none"} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
              {createError && <p className="text-sm text-red-600 font-medium" role="alert">{createError}</p>}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => { setShowAdd(false); setCreateError(null); }}
                  className="rounded-lg px-4 py-2 text-sm font-medium text-ink-600 hover:bg-surface-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !name.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {creating && <Loader2 strokeWidth={1.75} className="h-3.5 w-3.5 animate-spin" />}
                  Add startup
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
