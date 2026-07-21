"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { InboxRow } from "./page";

interface Props {
  pending: readonly InboxRow[];
  approved: readonly InboxRow[];
  denied: readonly InboxRow[];
}

function TypeBadge({ t }: { t: InboxRow["request_type"] }) {
  const map: Record<InboxRow["request_type"], { label: string; cls: string }> = {
    code_request: { label: "code", cls: "bg-indigo-50 text-indigo-800" },
    over_budget_approval: { label: "over-budget", cls: "bg-amber-50 text-amber-800" },
    collateral_approval: { label: "collateral", cls: "bg-emerald-50 text-emerald-800" },
  };
  const { label, cls } = map[t];
  return <span className={`rounded px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

function PayloadSummary({ row }: { row: InboxRow }) {
  if (row.request_type === "code_request") {
    const p = row.payload as {
      tier_pct?: number;
      suggested_suffix?: string | null;
      notes?: string | null;
    };
    return (
      <div className="text-xs text-ink-700">
        Tier {p.tier_pct}% off
        {p.suggested_suffix && (
          <>
            {" · suffix "}
            <code className="font-mono">{p.suggested_suffix}</code>
          </>
        )}
        {p.notes && <p className="mt-1 text-ink-500">{p.notes}</p>}
      </div>
    );
  }
  if (row.request_type === "over_budget_approval") {
    const p = row.payload as {
      target_user_id?: string;
      requested_amount?: number;
      reason?: string | null;
      remaining_budget_snapshot?: number | null;
    };
    return (
      <div className="text-xs text-ink-700">
        Grant <span className="font-semibold">{p.requested_amount?.toLocaleString()}</span>{" "}
        credits to <code className="font-mono">{p.target_user_id?.slice(0, 8)}…</code>
        {p.remaining_budget_snapshot != null && (
          <> · budget remaining {p.remaining_budget_snapshot.toLocaleString()}</>
        )}
        {p.reason && <p className="mt-1 text-ink-500">{p.reason}</p>}
      </div>
    );
  }
  const p = row.payload as { collateral_url?: string; purpose?: string };
  return (
    <div className="text-xs text-ink-700">
      <a
        href={p.collateral_url}
        target="_blank"
        rel="noreferrer"
        className="text-brand-700 underline"
      >
        {p.collateral_url}
      </a>
      {p.purpose && <p className="mt-1 text-ink-500">{p.purpose}</p>}
    </div>
  );
}

function DecisionRow({ row, onDone }: { row: InboxRow; onDone: () => void }) {
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState<string>("");

  async function submit(action: "approve" | "deny") {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/admin/resellers/requests/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          decision_reason: reason.trim() ? reason.trim().slice(0, 200) : undefined,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        reason?: string;
      };
      if (!res.ok || !body.ok) {
        setState("error");
        setError(body.reason ?? `HTTP ${res.status}`);
        return;
      }
      onDone();
    } catch (err) {
      setState("error");
      setError((err as Error).message);
    }
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      <input
        type="text"
        placeholder="Optional decision reason…"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={200}
        className="flex-1 rounded border border-surface-300 bg-white px-2 py-1 text-xs"
      />
      <button
        type="button"
        disabled={state === "busy"}
        onClick={() => submit("approve")}
        className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:bg-surface-300"
      >
        Approve
      </button>
      <button
        type="button"
        disabled={state === "busy"}
        onClick={() => submit("deny")}
        className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white disabled:bg-surface-300"
      >
        Deny
      </button>
      {state === "error" && (
        <span className="text-xs text-red-600">Failed: {error}</span>
      )}
    </div>
  );
}

function resellerHead(row: InboxRow): { code: string; display_name: string } | null {
  const r = row.resellers;
  if (!r) return null;
  if (Array.isArray(r)) return r[0] ?? null;
  return r;
}

function RowCard({
  row,
  showActions,
  onDone,
}: {
  row: InboxRow;
  showActions: boolean;
  onDone: () => void;
}) {
  const rHead = resellerHead(row);
  return (
    <li className="rounded border border-surface-200 bg-white p-3">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-2">
          <TypeBadge t={row.request_type} />
          <span className="font-medium text-ink-900">
            {rHead?.display_name ?? row.reseller_id.slice(0, 8)}
          </span>
          <code className="text-xs text-ink-500">{rHead?.code}</code>
        </div>
        <span className="text-xs text-ink-500">
          {new Date(row.created_at).toISOString().slice(0, 16).replace("T", " ")}
        </span>
      </div>
      <div className="mt-2">
        <PayloadSummary row={row} />
      </div>
      {row.decision_at && (
        <p className="mt-2 text-xs text-ink-500">
          Decided {new Date(row.decision_at).toISOString().slice(0, 10)}
          {row.decision_reason && <>: {row.decision_reason}</>}
        </p>
      )}
      {showActions && <DecisionRow row={row} onDone={onDone} />}
    </li>
  );
}

export function RequestsInboxClient({ pending, approved, denied }: Props) {
  const router = useRouter();
  const refresh = () => router.refresh();

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-700">
          Pending ({pending.length})
        </h2>
        {pending.length === 0 ? (
          <p className="rounded border border-dashed border-surface-300 bg-white p-6 text-center text-sm text-ink-500">
            No pending requests.
          </p>
        ) : (
          <ul className="space-y-2">
            {pending.map((r) => (
              <RowCard key={r.id} row={r} showActions onDone={refresh} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-700">
          Recently approved
        </h2>
        {approved.length === 0 ? (
          <p className="text-xs text-ink-500">No approvals yet.</p>
        ) : (
          <ul className="space-y-2">
            {approved.map((r) => (
              <RowCard key={r.id} row={r} showActions={false} onDone={refresh} />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-700">
          Recently denied
        </h2>
        {denied.length === 0 ? (
          <p className="text-xs text-ink-500">No denials yet.</p>
        ) : (
          <ul className="space-y-2">
            {denied.map((r) => (
              <RowCard key={r.id} row={r} showActions={false} onDone={refresh} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
