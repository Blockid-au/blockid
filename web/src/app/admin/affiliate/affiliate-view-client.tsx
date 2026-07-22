"use client";

// Client component for /admin/affiliate — renders the split-panel view
// (LEFT: reseller list, RIGHT: tabbed attribution drawer). Fetches
// attributions from GET /api/admin/affiliate/[resellerId]/attributions
// when a reseller is selected, and drives the row-level action buttons:
//   - Grant credits    → POST /api/admin/users/[id]/credits
//   - Change plan      → POST /api/admin/users/manage
//   - Revoke attribution → POST /api/admin/affiliate/attributions/[id]/revoke

import * as React from "react";
import type {
  AttributionSummaryBySource,
  ResellerListEntry,
} from "./types";

type SourceKey = "provisioned" | "code" | "admin_manual";
type TabKey = SourceKey | "impersonation";

interface ImpersonationEventDTO {
  id: string;
  ts_iso: string;
  action: string;
  target_user_id: string;
  target_email_masked: string;
  actor_email: string | null;
  summary: string;
}

interface ImpersonationGroupDTO {
  target_user_id: string;
  target_email_masked: string;
  target_display_name: string | null;
  events: ImpersonationEventDTO[];
}

interface AttributionUserRow {
  attribution_id: string;
  user_id: string | null;
  project_id: string | null;
  masked_email: string;
  display_name: string | null;
  joined_at: string | null;
  plan: string | null;
  mrr_aud_cents: number;
  promotion_code: string | null;
  source: SourceKey;
  attributed_at: string;
  status: string;
}

interface AttributionsResponse {
  ok: boolean;
  reseller: { id: string; code: string; display_name: string } | null;
  totals: AttributionSummaryBySource | null;
  rows: Record<SourceKey, AttributionUserRow[]>;
  impersonation?: ImpersonationGroupDTO[];
  error?: string;
}

const TABS: { key: TabKey; label: string; hint: string }[] = [
  {
    key: "provisioned",
    label: "Provisioned users",
    hint: "Users the reseller CREATED via /api/reseller/create-startup.",
  },
  {
    key: "code",
    label: "Code redemptions",
    hint: "Users who typed the reseller's promo code at signup.",
  },
  {
    key: "admin_manual",
    label: "Admin-attributed",
    hint: "Manual overrides by BlockID admins — rare, audited.",
  },
  {
    key: "impersonation",
    label: "Impersonation trail",
    hint: "admin.* audit-events touching any user attributed to this reseller (role / plan / permissions / credits / create).",
  },
];

const VALID_PLANS = ["free", "founding50", "growth"] as const;

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

function fmtAud(cents: number): string {
  if (!cents) return "—";
  return `A$${(cents / 100).toFixed(2)}`;
}

function fmtBucket(bucket: {
  count: number | null;
  suppressed: boolean;
}): string {
  if (bucket.suppressed || bucket.count === null) return "<5";
  return String(bucket.count);
}

export function AffiliateViewClient({
  resellers,
}: {
  resellers: ResellerListEntry[];
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [data, setData] = React.useState<AttributionsResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<TabKey>("provisioned");

  const [creditsFor, setCreditsFor] = React.useState<AttributionUserRow | null>(
    null,
  );

  const selected = React.useMemo(
    () => resellers.find((r) => r.id === selectedId) ?? null,
    [resellers, selectedId],
  );

  const fetchAttributions = React.useCallback(async (resellerId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/affiliate/${encodeURIComponent(resellerId)}/attributions`,
        { cache: "no-store" },
      );
      const body = (await res.json().catch(() => null)) as
        | AttributionsResponse
        | null;
      if (!res.ok || !body?.ok) {
        setError(body?.error ?? `HTTP ${res.status}`);
        setData(null);
      } else {
        setData(body);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "network_error");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    if (!selectedId) return;
    void fetchAttributions(selectedId);
  }, [selectedId, fetchAttributions]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,360px)_1fr]">
      {/* LEFT: reseller list */}
      <aside className="overflow-hidden rounded-lg border border-surface-200 bg-white">
        <div className="border-b border-surface-100 bg-surface-50 px-3 py-2 text-xs uppercase tracking-wide text-ink-500">
          Resellers ({resellers.length})
        </div>
        <ul className="divide-y divide-surface-100">
          {resellers.map((r) => {
            const active = r.id === selectedId;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left px-3 py-2 hover:bg-surface-50 transition-colors ${
                    active ? "bg-brand-50" : ""
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span
                      className={`text-sm font-medium ${
                        active ? "text-brand-700" : "text-ink-900"
                      }`}
                    >
                      {r.display_name}
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                        r.status === "active"
                          ? "bg-emerald-50 text-emerald-800"
                          : r.status === "paused"
                            ? "bg-yellow-50 text-yellow-800"
                            : "bg-red-50 text-red-800"
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 text-[11px] text-ink-500">
                    <span className="font-mono">{r.code}</span>
                    <span>·</span>
                    <span>{r.billing_model}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[11px] text-ink-600">
                    <span title="Provisioned">P {fmtBucket(r.summary.provisioned)}</span>
                    <span className="text-ink-300">|</span>
                    <span title="Code">C {fmtBucket(r.summary.code)}</span>
                    <span className="text-ink-300">|</span>
                    <span title="Admin manual">A {fmtBucket(r.summary.admin_manual)}</span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      {/* RIGHT: tabbed drawer */}
      <section className="rounded-lg border border-surface-200 bg-white">
        {!selected ? (
          <div className="p-8 text-center text-sm text-ink-500">
            Select a reseller on the left to see its attributions.
          </div>
        ) : (
          <>
            <header className="flex items-baseline justify-between border-b border-surface-100 px-4 py-3">
              <div>
                <h2 className="text-base font-semibold text-ink-900">
                  {selected.display_name}
                </h2>
                <p className="font-mono text-xs text-ink-500">{selected.code}</p>
              </div>
              <a
                href={`/admin/resellers/${selected.code.toLowerCase()}`}
                className="text-xs text-brand-700 hover:underline"
              >
                Open reseller detail →
              </a>
            </header>

            <nav className="flex gap-1 border-b border-surface-100 px-4 pt-3">
              {TABS.map((t) => {
                let label = "…";
                if (data?.totals) {
                  if (t.key === "impersonation") {
                    label = String(data.totals.impersonation ?? 0);
                  } else {
                    label = fmtBucket(data.totals[t.key]);
                  }
                }
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveTab(t.key)}
                    className={`rounded-t-md px-3 py-1.5 text-sm ${
                      activeTab === t.key
                        ? "bg-brand-50 font-semibold text-brand-700"
                        : "text-ink-600 hover:bg-surface-50"
                    }`}
                    title={t.hint}
                  >
                    {t.label} <span className="text-ink-500">({label})</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-4">
              {loading ? (
                <div className="py-8 text-center text-sm text-ink-500">
                  Loading attributions…
                </div>
              ) : error ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
                  {error}
                </div>
              ) : data ? (
                activeTab === "impersonation" ? (
                  <ImpersonationTrailPanel
                    groups={data.impersonation ?? []}
                  />
                ) : (
                  <AttributionTable
                    rows={data.rows[activeTab] ?? []}
                    onGrantCredits={(row) => setCreditsFor(row)}
                    onPlanChanged={() => void fetchAttributions(selected.id)}
                    onRevoked={() => void fetchAttributions(selected.id)}
                  />
                )
              ) : null}
            </div>
          </>
        )}
      </section>

      {creditsFor && (
        <GrantCreditsModal
          row={creditsFor}
          onClose={(refresh) => {
            setCreditsFor(null);
            if (refresh && selected) void fetchAttributions(selected.id);
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Attribution table                                                         */
/* ------------------------------------------------------------------------- */

function AttributionTable({
  rows,
  onGrantCredits,
  onPlanChanged,
  onRevoked,
}: {
  rows: AttributionUserRow[];
  onGrantCredits: (row: AttributionUserRow) => void;
  onPlanChanged: () => void;
  onRevoked: () => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-surface-300 bg-surface-50 p-6 text-center text-sm text-ink-500">
        No attributions in this bucket.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-surface-50 text-left text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th className="p-2">Email</th>
            <th className="p-2">Display name</th>
            <th className="p-2">Joined</th>
            <th className="p-2">Plan</th>
            <th className="p-2">MRR</th>
            <th className="p-2">Code used</th>
            <th className="p-2 text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-100">
          {rows.map((r) => (
            <AttributionRow
              key={r.attribution_id}
              row={r}
              onGrantCredits={() => onGrantCredits(r)}
              onPlanChanged={onPlanChanged}
              onRevoked={onRevoked}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AttributionRow({
  row,
  onGrantCredits,
  onPlanChanged,
  onRevoked,
}: {
  row: AttributionUserRow;
  onGrantCredits: () => void;
  onPlanChanged: () => void;
  onRevoked: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  const changePlan = async (plan: string) => {
    if (!row.user_id) {
      setMsg("Row has no user_id (project-only attribution) — cannot change plan.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch("/api/admin/users/manage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          user_id: row.user_id,
          field: "plan",
          value: plan,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setMsg(body?.error ?? `HTTP ${r.status}`);
      } else {
        setMsg(`Plan set to ${plan}.`);
        onPlanChanged();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "network_error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!window.confirm("Revoke this attribution? Soft-delete, audited.")) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(
        `/api/admin/affiliate/attributions/${encodeURIComponent(row.attribution_id)}/revoke`,
        { method: "POST" },
      );
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        setMsg(body?.error ?? `HTTP ${r.status}`);
      } else {
        setMsg("Revoked.");
        onRevoked();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "network_error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <tr>
      <td className="p-2 font-mono text-xs text-ink-700">{row.masked_email}</td>
      <td className="p-2 text-ink-800">{row.display_name ?? "—"}</td>
      <td className="p-2 text-xs text-ink-600">{fmtDate(row.joined_at)}</td>
      <td className="p-2">
        <span className="rounded bg-surface-100 px-1.5 py-0.5 text-xs">
          {row.plan ?? "free"}
        </span>
      </td>
      <td className="p-2 text-xs text-ink-700">{fmtAud(row.mrr_aud_cents)}</td>
      <td className="p-2 font-mono text-xs text-ink-600">
        {row.promotion_code ?? "—"}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            onClick={onGrantCredits}
            disabled={busy || !row.user_id}
            className="rounded-md border border-surface-200 bg-white px-2 py-1 text-xs text-ink-700 hover:bg-surface-50 disabled:opacity-50"
          >
            Grant credits
          </button>
          <select
            defaultValue=""
            disabled={busy || !row.user_id}
            onChange={(e) => {
              const v = e.target.value;
              if (v) void changePlan(v);
              e.currentTarget.value = "";
            }}
            className="rounded-md border border-surface-200 bg-white px-2 py-1 text-xs text-ink-700 disabled:opacity-50"
          >
            <option value="">Change plan…</option>
            {VALID_PLANS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={revoke}
            disabled={busy}
            className="rounded-md border border-red-200 bg-white px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
          >
            Revoke
          </button>
        </div>
        {msg && (
          <div className="mt-1 text-[11px] text-ink-500 text-right">{msg}</div>
        )}
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------------- */
/* Impersonation trail panel (P12.8)                                         */
/* ------------------------------------------------------------------------- */

function fmtTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

function actionBadge(action: string): { label: string; className: string } {
  switch (action) {
    case "admin.role.changed":
      return {
        label: "role",
        className: "bg-purple-50 text-purple-800",
      };
    case "admin.credits.granted":
      return {
        label: "credits",
        className: "bg-emerald-50 text-emerald-800",
      };
    case "admin.plan.changed":
      return {
        label: "plan",
        className: "bg-brand-50 text-brand-800",
      };
    case "admin.permissions.granted":
      return {
        label: "perm+",
        className: "bg-sky-50 text-sky-800",
      };
    case "admin.permissions.revoked":
      return {
        label: "perm-",
        className: "bg-amber-50 text-amber-800",
      };
    case "admin.user.created":
      return {
        label: "created",
        className: "bg-teal-50 text-teal-800",
      };
    default:
      return {
        label: action,
        className: "bg-surface-100 text-ink-700",
      };
  }
}

function ImpersonationTrailPanel({
  groups,
}: {
  groups: ImpersonationGroupDTO[];
}) {
  if (groups.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-surface-300 bg-surface-50 p-6 text-center text-sm text-ink-500">
        No admin.* audit events for any user in this reseller&apos;s
        attribution set yet.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-ink-500">
        admin.role.changed · admin.credits.granted · admin.plan.changed ·
        admin.permissions.granted/revoked · admin.user.created — newest 500
        events across every attributed user, grouped by target.
      </p>
      {groups.map((g) => (
        <details
          key={g.target_user_id}
          className="rounded-md border border-surface-200 bg-white"
          open={groups.length <= 3}
        >
          <summary className="flex cursor-pointer items-baseline justify-between px-3 py-2 text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium text-ink-900">
                {g.target_display_name ?? g.target_email_masked}
              </span>
              {g.target_display_name && (
                <span className="font-mono text-xs text-ink-500">
                  {g.target_email_masked}
                </span>
              )}
            </div>
            <div className="flex items-baseline gap-2 text-xs text-ink-500">
              <span>{g.events.length} event{g.events.length === 1 ? "" : "s"}</span>
              <a
                href={`/admin/users/${encodeURIComponent(g.target_user_id)}`}
                className="text-brand-700 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                Open user →
              </a>
            </div>
          </summary>
          <ul className="divide-y divide-surface-100 border-t border-surface-100">
            {g.events.map((ev) => {
              const badge = actionBadge(ev.action);
              return (
                <li key={ev.id} className="px-3 py-2 text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${badge.className}`}
                        title={ev.action}
                      >
                        {badge.label}
                      </span>
                      <span className="text-ink-800">{ev.summary}</span>
                    </div>
                    <span className="font-mono text-xs text-ink-500">
                      {fmtTs(ev.ts_iso)}
                    </span>
                  </div>
                  {ev.actor_email && (
                    <div className="mt-0.5 text-[11px] text-ink-500">
                      by {ev.actor_email}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </details>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------------- */
/* Grant credits modal                                                      */
/* ------------------------------------------------------------------------- */

function GrantCreditsModal({
  row,
  onClose,
}: {
  row: AttributionUserRow;
  onClose: (refresh: boolean) => void;
}) {
  const [amount, setAmount] = React.useState(50);
  const [reason, setReason] = React.useState("affiliate_view_bonus");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!row.user_id) {
      setError("Row has no user_id (project-only attribution).");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const r = await fetch(
        `/api/admin/users/${encodeURIComponent(row.user_id)}/credits`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            amount,
            reason,
            metadata: {
              by: "affiliate_view",
              attribution_id: row.attribution_id,
              source: row.source,
            },
          }),
        },
      );
      const body = await r.json().catch(() => null);
      if (!r.ok || !body?.ok) {
        setError(body?.error ?? `HTTP ${r.status}`);
      } else {
        onClose(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "network_error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={() => (busy ? null : onClose(false))}
    >
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        className="w-full max-w-sm rounded-lg bg-white p-4 shadow-xl"
      >
        <h3 className="text-base font-semibold text-ink-900">Grant credits</h3>
        <p className="mt-1 text-xs text-ink-500">
          To {row.display_name ?? row.masked_email}. Logged with metadata
          <code className="mx-1 rounded bg-surface-100 px-1">by=affiliate_view</code>.
        </p>

        <div className="mt-3 space-y-2">
          <label className="block text-xs font-medium text-ink-700">
            Amount
            <input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-0.5 block w-full rounded-md border border-surface-200 px-2 py-1 text-sm"
              required
            />
          </label>
          <label className="block text-xs font-medium text-ink-700">
            Reason
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="mt-0.5 block w-full rounded-md border border-surface-200 px-2 py-1 text-sm"
              required
            />
          </label>
        </div>

        {error && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            {error}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            disabled={busy}
            className="rounded-md border border-surface-200 bg-white px-3 py-1.5 text-sm text-ink-700 hover:bg-surface-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="rounded-md bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busy ? "Granting…" : "Grant"}
          </button>
        </div>
      </form>
    </div>
  );
}
