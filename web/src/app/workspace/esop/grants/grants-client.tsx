"use client";

import * as React from "react";
import { AlertCircle, Check, Loader2, Plus, X, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Grant, GrantStatus, Div83AStatus } from "@/lib/esop-grants";
import type { Div83ACheck } from "@/lib/div83a-checker";

interface GrantsClientProps {
  initialGrants: Grant[];
  disclaimer: string;
}

interface CreateForm {
  granteeName: string;
  granteeEmail: string;
  grantDate: string;
  sharesUnderOption: string;
  strikePriceAud: string;
  vestingYears: string;
  cliffMonths: string;
  notes: string;
}

interface CheckForm {
  hasEsicRuling: "yes" | "no" | "unknown";
  isListed: "yes" | "no" | "unknown";
  aggregatedTurnoverAud: string;
  incorporatedAt: string;
  granteePostGrantOwnershipPct: string;
}

function makeEmptyForm(): CreateForm {
  return {
    granteeName: "",
    granteeEmail: "",
    grantDate: new Date().toISOString().slice(0, 10),
    sharesUnderOption: "10000",
    strikePriceAud: "0.10",
    vestingYears: "4",
    cliffMonths: "12",
    notes: "",
  };
}

function makeEmptyCheckForm(): CheckForm {
  return {
    hasEsicRuling: "unknown",
    isListed: "no",
    aggregatedTurnoverAud: "",
    incorporatedAt: "",
    granteePostGrantOwnershipPct: "",
  };
}

const STATUS_LABELS: Record<GrantStatus, string> = {
  active: "Active",
  exercised: "Exercised",
  lapsed: "Lapsed",
  cancelled: "Cancelled",
};

const STATUS_STYLES: Record<GrantStatus, string> = {
  active: "bg-emerald-100 text-emerald-700",
  exercised: "bg-brand-100 text-brand-700",
  lapsed: "bg-slate-100 text-slate-600",
  cancelled: "bg-rose-100 text-rose-700",
};

const DIV83A_STYLES: Record<Div83AStatus, string> = {
  eligible: "bg-emerald-100 text-emerald-700",
  ineligible: "bg-rose-100 text-rose-700",
  unsure: "bg-amber-100 text-amber-700",
};

function tristate(v: "yes" | "no" | "unknown"): boolean | undefined {
  if (v === "yes") return true;
  if (v === "no") return false;
  return undefined;
}

export function GrantsClient({ initialGrants, disclaimer }: GrantsClientProps) {
  const [grants, setGrants] = React.useState<Grant[]>(() => initialGrants);
  const [createOpen, setCreateOpen] = React.useState<boolean>(() => false);
  const [form, setForm] = React.useState<CreateForm>(() => makeEmptyForm());
  const [submitting, setSubmitting] = React.useState<boolean>(() => false);
  const [error, setError] = React.useState<string | null>(() => null);
  const [success, setSuccess] = React.useState<string | null>(() => null);

  // Div 83A check panel
  const [checkGrant, setCheckGrant] = React.useState<Grant | null>(() => null);
  const [checkForm, setCheckForm] = React.useState<CheckForm>(() => makeEmptyCheckForm());
  const [checkResult, setCheckResult] = React.useState<Div83ACheck | null>(() => null);
  const [checking, setChecking] = React.useState<boolean>(() => false);

  async function refreshGrants(): Promise<void> {
    try {
      const res = await fetch("/api/esop/grants");
      const json = (await res.json()) as { ok: boolean; grants?: Grant[] };
      if (json.ok && json.grants) setGrants(json.grants);
    } catch {
      /* ignore transient */
    }
  }

  async function handleCreate(evt: React.FormEvent<HTMLFormElement>): Promise<void> {
    evt.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/esop/grants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          granteeName: form.granteeName,
          granteeEmail: form.granteeEmail || null,
          grantDate: form.grantDate,
          sharesUnderOption: Number(form.sharesUnderOption),
          strikePriceAud: Number(form.strikePriceAud),
          vestingYears: Number(form.vestingYears),
          cliffMonths: Number(form.cliffMonths),
          notes: form.notes || null,
        }),
      });
      const json = (await res.json()) as { ok: boolean; grant?: Grant; error?: string };
      if (!res.ok || !json.ok || !json.grant) {
        setError(json.error ?? "Failed to create grant");
        return;
      }
      setGrants((prev) => [json.grant as Grant, ...prev]);
      setSuccess("Grant created.");
      setCreateOpen(false);
      setForm(makeEmptyForm());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create grant");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUpdateStatus(id: string, status: GrantStatus): Promise<void> {
    setError(null);
    try {
      const res = await fetch(`/api/esop/grants/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const json = (await res.json()) as { ok: boolean; grant?: Grant; error?: string };
      if (!res.ok || !json.ok || !json.grant) {
        setError(json.error ?? "Failed to update grant");
        return;
      }
      setGrants((prev) => prev.map((g) => (g.id === id ? (json.grant as Grant) : g)));
      setSuccess(`Grant marked ${STATUS_LABELS[status].toLowerCase()}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update grant");
    }
  }

  function openCheck(grant: Grant): void {
    setCheckGrant(grant);
    setCheckResult(null);
    setCheckForm(makeEmptyCheckForm());
  }

  async function runDiv83ACheck(): Promise<void> {
    if (!checkGrant) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/esop/div83a-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grantId: checkGrant.id,
          project: {
            hasEsicRuling: tristate(checkForm.hasEsicRuling),
            isListed: tristate(checkForm.isListed),
            aggregatedTurnoverAud: checkForm.aggregatedTurnoverAud
              ? Number(checkForm.aggregatedTurnoverAud)
              : undefined,
            incorporatedAt: checkForm.incorporatedAt || undefined,
          },
          granteePostGrantOwnershipPct: checkForm.granteePostGrantOwnershipPct
            ? Number(checkForm.granteePostGrantOwnershipPct)
            : undefined,
        }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        status?: Div83AStatus;
        criteria?: Div83ACheck["criteria"];
        guidance?: string;
        error?: string;
      };
      if (!res.ok || !json.ok || !json.status || !json.criteria) {
        setError(json.error ?? "Check failed");
        return;
      }
      setCheckResult({
        status: json.status,
        criteria: json.criteria,
        guidance: json.guidance ?? "",
      });
      await refreshGrants();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Check failed");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink-800">ESOP Grants</h1>
          <p className="text-sm text-ink-500 mt-1">
            Track option grants and check eligibility for the Australian
            Startup Concession (ITAA 1997 Subdivision 83A).
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateOpen(true);
            setError(null);
            setSuccess(null);
          }}
          className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Plus strokeWidth={1.75} className="h-4 w-4" />
          Create grant
        </button>
      </header>

      <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-800">
        {disclaimer}
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-700">
          <AlertCircle strokeWidth={1.75} className="h-4 w-4 shrink-0" />
          {error}
        </div>
      ) : null}
      {success ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-sm text-emerald-700">
          <Check strokeWidth={1.75} className="h-4 w-4 shrink-0" />
          {success}
        </div>
      ) : null}

      {/* Table */}
      <div className="rounded-2xl border border-surface-200 bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-100 bg-surface-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase">Grantee</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-ink-500 uppercase">Grant date</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase">Shares</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase">Strike (A$)</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase">Vesting</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase">Status</th>
                <th className="text-center px-4 py-3 text-xs font-medium text-ink-500 uppercase">Div 83A</th>
                <th className="text-right px-4 py-3 text-xs font-medium text-ink-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody>
              {grants.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-500">
                    No grants yet. Create your first option grant to start tracking eligibility.
                  </td>
                </tr>
              ) : (
                grants.map((g) => (
                  <tr key={g.id} className="border-b border-surface-100 last:border-b-0">
                    <td className="px-4 py-3">
                      <div className="font-medium text-ink-800">{g.granteeName}</div>
                      {g.granteeEmail ? (
                        <div className="text-xs text-ink-500">{g.granteeEmail}</div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-ink-600 tabular-nums">{g.grantDate}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-800">
                      {g.sharesUnderOption.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-ink-700">
                      {g.strikePriceAud.toFixed(4)}
                    </td>
                    <td className="px-4 py-3 text-center text-xs text-ink-600">
                      {g.vestingYears}y / {g.cliffMonths}m cliff
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", STATUS_STYLES[g.status])}>
                        {STATUS_LABELS[g.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {g.div83aStatus ? (
                        <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", DIV83A_STYLES[g.div83aStatus])}>
                          {g.div83aStatus}
                        </span>
                      ) : (
                        <span className="text-xs text-ink-400">Not checked</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openCheck(g)}
                          className="inline-flex h-7 items-center gap-1 rounded-lg px-2 text-xs font-medium text-brand-700 hover:bg-brand-50"
                          title="Run Division 83A eligibility check"
                        >
                          <ShieldCheck strokeWidth={1.75} className="h-3.5 w-3.5" />
                          Check 83A
                        </button>
                        {g.status === "active" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(g.id, "exercised")}
                              className="inline-flex h-7 items-center rounded-lg px-2 text-xs font-medium text-emerald-700 hover:bg-emerald-50"
                            >
                              Mark exercised
                            </button>
                            <button
                              type="button"
                              onClick={() => handleUpdateStatus(g.id, "lapsed")}
                              className="inline-flex h-7 items-center rounded-lg px-2 text-xs font-medium text-slate-600 hover:bg-slate-100"
                            >
                              Mark lapsed
                            </button>
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create modal */}
      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200">
              <h2 className="text-sm font-bold text-ink-800">Create ESOP grant</h2>
              <button
                type="button"
                onClick={() => setCreateOpen(false)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:bg-surface-100"
                aria-label="Close"
              >
                <X strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Grantee name *</span>
                  <input
                    required
                    type="text"
                    value={form.granteeName}
                    onChange={(e) => setForm((f) => ({ ...f, granteeName: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Grantee email</span>
                  <input
                    type="email"
                    value={form.granteeEmail}
                    onChange={(e) => setForm((f) => ({ ...f, granteeEmail: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Grant date *</span>
                  <input
                    required
                    type="date"
                    value={form.grantDate}
                    onChange={(e) => setForm((f) => ({ ...f, grantDate: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Shares under option *</span>
                  <input
                    required
                    type="number"
                    min={1}
                    value={form.sharesUnderOption}
                    onChange={(e) => setForm((f) => ({ ...f, sharesUnderOption: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Strike price (AUD)</span>
                  <input
                    type="number"
                    step="0.0001"
                    min={0}
                    value={form.strikePriceAud}
                    onChange={(e) => setForm((f) => ({ ...f, strikePriceAud: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Vesting years</span>
                  <input
                    type="number"
                    min={1}
                    max={6}
                    value={form.vestingYears}
                    onChange={(e) => setForm((f) => ({ ...f, vestingYears: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Cliff (months)</span>
                  <input
                    type="number"
                    min={0}
                    max={24}
                    value={form.cliffMonths}
                    onChange={(e) => setForm((f) => ({ ...f, cliffMonths: e.target.value }))}
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="text-ink-700 font-medium">Notes</span>
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm"
                />
              </label>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="h-9 px-4 rounded-lg border border-surface-200 text-sm font-medium text-ink-600 hover:bg-surface-50"
                  disabled={submitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {submitting ? <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" /> : <Check strokeWidth={1.75} className="h-4 w-4" />}
                  Create grant
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* Div 83A checker panel */}
      {checkGrant ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white shadow-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-200">
              <div>
                <h2 className="text-sm font-bold text-ink-800">
                  Division 83A check — {checkGrant.granteeName}
                </h2>
                <p className="text-xs text-ink-500 mt-0.5">
                  Answer what you can. Missing inputs return “unsure”.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCheckGrant(null)}
                className="h-7 w-7 flex items-center justify-center rounded-lg text-ink-500 hover:bg-surface-100"
                aria-label="Close"
              >
                <X strokeWidth={1.75} className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[80vh] overflow-y-auto">
              <div className="rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                {disclaimer}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">ESIC / start-up test</span>
                  <select
                    value={checkForm.hasEsicRuling}
                    onChange={(e) =>
                      setCheckForm((f) => ({ ...f, hasEsicRuling: e.target.value as "yes" | "no" | "unknown" }))
                    }
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-2 text-sm"
                  >
                    <option value="unknown">Unknown</option>
                    <option value="yes">Yes — meets s83A-33</option>
                    <option value="no">No</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Company listed?</span>
                  <select
                    value={checkForm.isListed}
                    onChange={(e) =>
                      setCheckForm((f) => ({ ...f, isListed: e.target.value as "yes" | "no" | "unknown" }))
                    }
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-2 text-sm"
                  >
                    <option value="no">No (unlisted)</option>
                    <option value="yes">Yes</option>
                    <option value="unknown">Unknown</option>
                  </select>
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Aggregated turnover (AUD)</span>
                  <input
                    type="number"
                    min={0}
                    value={checkForm.aggregatedTurnoverAud}
                    onChange={(e) =>
                      setCheckForm((f) => ({ ...f, aggregatedTurnoverAud: e.target.value }))
                    }
                    placeholder="e.g. 2500000"
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-ink-700 font-medium">Company incorporated</span>
                  <input
                    type="date"
                    value={checkForm.incorporatedAt}
                    onChange={(e) =>
                      setCheckForm((f) => ({ ...f, incorporatedAt: e.target.value }))
                    }
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
                <label className="block text-sm col-span-2">
                  <span className="text-ink-700 font-medium">Grantee post-grant ownership (%)</span>
                  <input
                    type="number"
                    step="0.01"
                    min={0}
                    max={100}
                    value={checkForm.granteePostGrantOwnershipPct}
                    onChange={(e) =>
                      setCheckForm((f) => ({ ...f, granteePostGrantOwnershipPct: e.target.value }))
                    }
                    placeholder="e.g. 1.25"
                    className="mt-1 w-full h-9 rounded-lg border border-surface-200 px-3 text-sm"
                  />
                </label>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={runDiv83ACheck}
                  disabled={checking}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {checking ? <Loader2 strokeWidth={1.75} className="h-4 w-4 animate-spin" /> : <ShieldCheck strokeWidth={1.75} className="h-4 w-4" />}
                  Run check
                </button>
              </div>

              {checkResult ? (
                <div className="rounded-xl border border-surface-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-2.5 bg-surface-50">
                    <span className="text-xs font-medium text-ink-600 uppercase tracking-wider">
                      Result
                    </span>
                    <span className={cn("inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium", DIV83A_STYLES[checkResult.status])}>
                      {checkResult.status}
                    </span>
                  </div>
                  <ul className="divide-y divide-surface-100">
                    {checkResult.criteria.map((c) => (
                      <li key={c.key} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-ink-800">{c.label}</span>
                          <span
                            className={cn(
                              "text-xs font-medium px-2 py-0.5 rounded",
                              c.met === true
                                ? "bg-emerald-100 text-emerald-700"
                                : c.met === false
                                  ? "bg-rose-100 text-rose-700"
                                  : "bg-amber-100 text-amber-700",
                            )}
                          >
                            {c.met === true ? "met" : c.met === false ? "not met" : "unsure"}
                          </span>
                        </div>
                        <p className="text-xs text-ink-500 mt-1">{c.evidence}</p>
                      </li>
                    ))}
                  </ul>
                  <div className="px-4 py-3 text-xs text-ink-600 bg-surface-50 border-t border-surface-100">
                    {checkResult.guidance}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
