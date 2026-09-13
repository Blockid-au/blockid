"use client";

// RoundClient — the fundraise tracker for one round (S26-A).
//
// Reads /api/fundraise/[roundId] (round + commitments + summary + linked
// data room). Draws the target-vs-soft-vs-committed-vs-funded bar, lists
// every cheque with an inline status ladder, records new ones, and opens /
// closes the round. Opening a round attaches the project's data room —
// compiling one (3 credits, charged to the person clicking) only when the
// project has none, and the button says so BEFORE the click.

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, FolderOpen, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  COMMITMENT_INSTRUMENTS,
  COMMITMENT_STATUSES,
  formatAud,
  INSTRUMENT_LABEL,
  progressSegments,
  STATUS_LABEL,
  type CommitmentInstrument,
  type CommitmentStatus,
  type RoundSummary,
} from "@/lib/fundraise/commitments";

interface RoundDto {
  id: string;
  round_name: string;
  target_amount: number | string;
  pre_money_valuation: number | string | null;
  instrument_type: string;
  status: string;
  data_room_id: string | null;
  activated_at: string | null;
  closed_at: string | null;
  created_at: string;
}

interface CommitmentDto {
  id: string;
  investor_name: string;
  investor_email: string | null;
  investor_org: string | null;
  amount_aud: number | string;
  status: CommitmentStatus;
  instrument: CommitmentInstrument;
  notes: string | null;
  access_token_id: string | null;
  committed_at: string | null;
  signed_at: string | null;
  funded_at: string | null;
  withdrawn_at: string | null;
  created_at: string;
}

interface RoundResponse {
  ok: boolean;
  round?: RoundDto;
  commitments?: CommitmentDto[];
  summary?: RoundSummary;
  dataRoom?: { id: string; name: string | null } | null;
  canEdit?: boolean;
  error?: string;
}

type ActivationDataRoom =
  | { id: string; attached: "existing" | "generated"; creditsUsed?: number }
  | { id: null; attached: "none"; reason: string; cost?: number };

const SEGMENT_CLASS: Record<"funded" | "committed" | "soft", string> = {
  funded: "bg-emerald-500",
  committed: "bg-brand-500",
  soft: "bg-amber-400",
};

const STATUS_BADGE: Record<CommitmentStatus, string> = {
  soft: "bg-amber-50 text-amber-700",
  committed: "bg-brand-50 text-brand-700",
  signed: "bg-sky-50 text-sky-700",
  funded: "bg-emerald-50 text-emerald-700",
  withdrawn: "bg-surface-100 text-ink-500 line-through",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** What the Open button promises — the cost is shown before the click. */
export function activateButtonCopy(hasRoom: boolean): string {
  return hasRoom ? "Open round — links your data room" : "Open round — generates your data room (3 credits)";
}

export function activationToast(dr: ActivationDataRoom): string {
  if (dr.attached === "generated") return "Round is open. Your data room was generated and attached (3 credits).";
  if (dr.attached === "existing") return "Round is open. Your existing data room is attached.";
  if (dr.attached !== "none") return "Round is open.";
  if (dr.reason === "insufficient_credits") return "Round is open. No data room yet — top up credits, then generate one from the Data Room page.";
  if (dr.reason === "feature_locked") return "Round is open. Data rooms are not on your plan — upgrade to attach one.";
  return "Round is open. The data room could not be generated — try again from the Data Room page.";
}

export function RoundClient({ roundId }: { roundId: string }) {
  const [data, setData] = React.useState<RoundResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [toast, setToast] = React.useState<{ text: string; kind: "ok" | "err" } | null>(null);

  const [name, setName] = React.useState("");
  const [org, setOrg] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [status, setStatus] = React.useState<CommitmentStatus>("soft");
  const [instrument, setInstrument] = React.useState<CommitmentInstrument>("safe");
  const [notes, setNotes] = React.useState("");

  const load = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/fundraise/${encodeURIComponent(roundId)}`, { credentials: "same-origin" });
      const body = (await res.json().catch(() => null)) as RoundResponse | null;
      if (!res.ok || !body?.ok) {
        setData({ ok: false, error: body?.error ?? (res.status === 404 ? "Round not found" : "Could not load the round") });
        return;
      }
      setData(body);
    } catch {
      setData({ ok: false, error: "Could not load the round" });
    } finally {
      setLoading(false);
    }
  }, [roundId]);

  React.useEffect(() => {
    void (async () => {
      await load();
    })();
  }, [load]);

  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const say = (text: string, kind: "ok" | "err" = "ok") => setToast({ text, kind });

  async function addCommitment(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy("add");
    try {
      const res = await fetch(`/api/fundraise/${encodeURIComponent(roundId)}/commitments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({
          investorName: name,
          investorOrg: org || null,
          investorEmail: email || null,
          amountAud: amount,
          status,
          instrument,
          notes: notes || null,
        }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;
      if (!res.ok || !body?.ok) {
        say(body?.message ?? body?.error ?? "Could not record the commitment.", "err");
        return;
      }
      setName("");
      setOrg("");
      setEmail("");
      setAmount("");
      setNotes("");
      setStatus("soft");
      say("Commitment recorded.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function patchCommitment(id: string, patch: Record<string, unknown>) {
    if (busy) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/fundraise/${encodeURIComponent(roundId)}/commitments/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(patch),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        say(body?.error ?? "Could not update the commitment.", "err");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function removeCommitment(id: string) {
    if (busy) return;
    if (!window.confirm("Remove this commitment? Use “Withdrawn” instead if the investor pulled out — that keeps the history.")) return;
    setBusy(id);
    try {
      const res = await fetch(`/api/fundraise/${encodeURIComponent(roundId)}/commitments/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
      if (!res.ok || !body?.ok) {
        say(body?.error ?? "Could not remove the commitment.", "err");
        return;
      }
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function activate() {
    if (busy) return;
    setBusy("activate");
    try {
      const res = await fetch(`/api/fundraise/${encodeURIComponent(roundId)}/activate`, { method: "POST", credentials: "same-origin" });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string; dataRoom?: ActivationDataRoom } | null;
      if (!res.ok || !body?.ok) {
        say(body?.message ?? body?.error ?? "Could not open the round.", "err");
        return;
      }
      say(body.dataRoom ? activationToast(body.dataRoom) : "Round is open.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function close() {
    if (busy) return;
    if (!window.confirm("Close this round? A closed round cannot be reopened and takes no new commitments.")) return;
    setBusy("close");
    try {
      const res = await fetch(`/api/fundraise/${encodeURIComponent(roundId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ status: "closed" }),
      });
      const body = (await res.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string } | null;
      if (!res.ok || !body?.ok) {
        say(body?.message ?? body?.error ?? "Could not close the round.", "err");
        return;
      }
      say("Round closed. Apply it to your cap table from the Fundraise page.");
      await load();
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-ink-600" role="status" aria-live="polite">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Loading the round…
      </p>
    );
  }

  if (!data?.ok || !data.round || !data.summary) {
    return (
      <div className="space-y-4">
        <Link href="/workspace/fundraise" className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to fundraise
        </Link>
        <p className="text-sm text-bear" role="alert">
          {data?.error ?? "Could not load the round."}
        </p>
      </div>
    );
  }

  const { round, summary, dataRoom } = data;
  const commitments = data.commitments ?? [];
  const canEdit = data.canEdit !== false;
  const segments = progressSegments(summary);
  const isClosed = round.status === "closed";

  return (
    <div className="space-y-8" data-testid="fundraise-round">
      {toast && (
        <p
          role="status"
          aria-live="polite"
          className={cn(
            "rounded-xl border px-4 py-3 text-sm",
            toast.kind === "ok" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800",
          )}
        >
          {toast.text}
        </p>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link href="/workspace/fundraise" className="inline-flex items-center gap-1 text-xs text-brand-600 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> All rounds
          </Link>
          <h1 className="mt-1 flex flex-wrap items-center gap-2 text-2xl font-bold tracking-tight text-ink-900">
            {round.round_name}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                round.status === "draft" && "bg-amber-50 text-amber-700",
                round.status === "active" && "bg-emerald-50 text-emerald-700",
                round.status === "closed" && "bg-surface-100 text-ink-500",
              )}
            >
              {round.status}
            </span>
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Target {formatAud(summary.targetAud)} · {round.instrument_type.replace("_", " ")}
            {round.pre_money_valuation ? ` · pre-money ${formatAud(Number(round.pre_money_valuation))}` : ""}
            {round.activated_at ? ` · opened ${fmtDate(round.activated_at)}` : ""}
            {round.closed_at ? ` · closed ${fmtDate(round.closed_at)}` : ""}
          </p>
        </div>
        {canEdit && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {round.status === "draft" && (
              <button
                type="button"
                onClick={() => void activate()}
                disabled={busy !== null}
                className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
                data-testid="round-activate"
              >
                {busy === "activate" && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {activateButtonCopy(Boolean(dataRoom))}
              </button>
            )}
            {round.status === "active" && (
              <button
                type="button"
                onClick={() => void close()}
                disabled={busy !== null}
                className="rounded-xl border border-surface-300 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-surface-50 disabled:opacity-60"
                data-testid="round-close"
              >
                Close round
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Progress ────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-5" aria-labelledby="round-progress-heading">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="round-progress-heading" className="text-sm font-semibold text-ink-800">
            Progress to target
          </h2>
          <p className="text-sm tabular-nums text-ink-600">
            <span className="font-semibold text-ink-900">{formatAud(summary.hardAud)}</span> of {formatAud(summary.targetAud)} committed or funded
            {" · "}
            {summary.pct.hard}%
          </p>
        </div>
        <div
          className="mt-3 flex h-4 w-full overflow-hidden rounded-full bg-surface-100"
          role="img"
          aria-label={`Funded ${formatAud(summary.fundedAud)}, committed ${formatAud(summary.committedAud)}, soft-circled ${formatAud(summary.softAud)} of a ${formatAud(summary.targetAud)} target`}
          data-testid="round-progress-bar"
        >
          {segments.map((s) => (
            <div key={s.key} className={cn("h-full", SEGMENT_CLASS[s.key])} style={{ width: `${s.pct}%` }} title={`${s.key}: ${formatAud(s.aud)}`} />
          ))}
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Funded" value={formatAud(summary.fundedAud)} sub={`${summary.pct.funded}% · ${summary.counts.funded} paid`} dot="bg-emerald-500" />
          <Tile label="Committed" value={formatAud(summary.committedAud)} sub={`${summary.pct.committed}% · ${summary.counts.committed + summary.counts.signed} incl. ${summary.counts.signed} signed`} dot="bg-brand-500" />
          <Tile label="Soft-circled" value={formatAud(summary.softAud)} sub={`${summary.pct.soft}% · ${summary.counts.soft} conversations`} dot="bg-amber-400" />
          <Tile label="Still to raise" value={formatAud(summary.remainingAud)} sub={summary.pct.pipeline >= 100 ? "Pipeline covers the target" : `Pipeline ${summary.pct.pipeline}% of target`} dot="bg-surface-300" />
        </dl>
      </section>

      {/* ── Data room ───────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white p-5" aria-labelledby="round-dataroom-heading">
        <h2 id="round-dataroom-heading" className="flex items-center gap-2 text-sm font-semibold text-ink-800">
          <FolderOpen className="h-4 w-4" aria-hidden="true" />
          Data room
        </h2>
        {dataRoom ? (
          <p className="mt-2 text-sm text-ink-600">
            <span className="font-medium text-ink-800">{dataRoom.name ?? "Your data room"}</span> is attached to this round.{" "}
            <Link href="/workspace/data-room" className="text-brand-600 hover:underline">
              Open the data room
            </Link>{" "}
            to mint investor links, turn on auto follow-up per investor and read the engagement heatmap.
          </p>
        ) : round.status === "draft" ? (
          <p className="mt-2 text-sm text-ink-600">
            Opening the round attaches your project&apos;s data room. If the project has none yet, one is generated from what BlockID
            already holds — the same 3-credit compile as the Data Room page — charged to whoever opens the round.
          </p>
        ) : (
          <p className="mt-2 text-sm text-ink-600">
            No data room is attached.{" "}
            <Link href="/workspace/data-room" className="text-brand-600 hover:underline">
              Generate one on the Data Room page
            </Link>{" "}
            and it links here automatically.
          </p>
        )}
      </section>

      {/* ── Commitments ─────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-surface-200 bg-white" aria-labelledby="round-commitments-heading">
        <div className="border-b border-surface-100 px-5 py-4">
          <h2 id="round-commitments-heading" className="text-sm font-semibold text-ink-800">
            Commitments ({summary.investors})
          </h2>
          <p className="mt-1 text-xs text-ink-500">
            Soft-circled → committed → signed → funded. Move a cheque along as the paperwork lands; mark it withdrawn if the investor pulls out.
          </p>
        </div>
        {commitments.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500" data-testid="commitments-empty">
            No commitments yet. Record the first conversation below as soft-circled.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="commitments-table">
              <thead>
                <tr className="bg-surface-50 text-ink-600">
                  <th className="px-4 py-2.5 text-left font-medium">Investor</th>
                  <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                  <th className="px-4 py-2.5 text-left font-medium">Instrument</th>
                  <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  <th className="px-4 py-2.5 text-left font-medium">Dates</th>
                  {canEdit && <th className="px-4 py-2.5" />}
                </tr>
              </thead>
              <tbody>
                {commitments.map((c) => (
                  <tr key={c.id} className="border-t border-surface-100">
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-ink-800">{c.investor_name}</p>
                      <p className="text-xs text-ink-500">{[c.investor_org, c.investor_email].filter(Boolean).join(" · ")}</p>
                      {c.notes && <p className="mt-0.5 text-xs text-ink-500">{c.notes}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-ink-800">{formatAud(Number(c.amount_aud))}</td>
                    <td className="px-4 py-2.5 text-ink-600">{INSTRUMENT_LABEL[c.instrument] ?? c.instrument}</td>
                    <td className="px-4 py-2.5">
                      {canEdit && !isClosed ? (
                        <select
                          aria-label={`Status for ${c.investor_name}`}
                          value={c.status}
                          disabled={busy === c.id}
                          onChange={(e) => void patchCommitment(c.id, { status: e.target.value })}
                          className={cn("rounded-lg border border-surface-200 px-2 py-1 text-xs font-medium", STATUS_BADGE[c.status])}
                        >
                          {COMMITMENT_STATUSES.map((s) => (
                            <option key={s} value={s}>
                              {STATUS_LABEL[s]}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className={cn("rounded-full px-2 py-0.5 text-xs font-medium", STATUS_BADGE[c.status])}>{STATUS_LABEL[c.status]}</span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-ink-500">
                      {c.funded_at
                        ? `Funded ${fmtDate(c.funded_at)}`
                        : c.signed_at
                          ? `Signed ${fmtDate(c.signed_at)}`
                          : c.committed_at
                            ? `Committed ${fmtDate(c.committed_at)}`
                            : c.withdrawn_at
                              ? `Withdrawn ${fmtDate(c.withdrawn_at)}`
                              : `Added ${fmtDate(c.created_at)}`}
                    </td>
                    {canEdit && (
                      <td className="px-2 py-2.5 text-right">
                        <button
                          type="button"
                          onClick={() => void removeCommitment(c.id)}
                          disabled={busy !== null}
                          aria-label={`Remove ${c.investor_name}`}
                          className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canEdit && !isClosed && (
          <form onSubmit={addCommitment} className="border-t border-surface-100 px-5 py-4" data-testid="commitment-form">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-500">Record a commitment</h3>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <label className="text-xs font-medium text-ink-600">
                Investor name
                <input required value={name} onChange={(e) => setName(e.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-ink-600">
                Fund / organisation
                <input value={org} onChange={(e) => setOrg(e.target.value)} maxLength={200} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-ink-600">
                Email
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-ink-600">
                Amount (A$)
                <input required inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="250000" className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
              </label>
              <label className="text-xs font-medium text-ink-600">
                Status
                <select value={status} onChange={(e) => setStatus(e.target.value as CommitmentStatus)} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
                  {COMMITMENT_STATUSES.filter((s) => s !== "withdrawn").map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-ink-600">
                Instrument
                <select value={instrument} onChange={(e) => setInstrument(e.target.value as CommitmentInstrument)} className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm">
                  {COMMITMENT_INSTRUMENTS.map((i) => (
                    <option key={i} value={i}>
                      {INSTRUMENT_LABEL[i]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs font-medium text-ink-600 sm:col-span-3">
                Notes
                <input value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} placeholder="Lead investor, pro-rata, conditions…" className="mt-1 w-full rounded-lg border border-surface-200 px-3 py-2 text-sm" />
              </label>
            </div>
            <button
              type="submit"
              disabled={busy !== null}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              {busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
              Add commitment
            </button>
          </form>
        )}
      </section>
    </div>
  );
}

function Tile({ label, value, sub, dot }: { label: string; value: string; sub: string; dot: string }) {
  return (
    <div className="rounded-xl border border-surface-100 bg-surface-50/60 px-4 py-3">
      <dt className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-500">
        <span className={cn("inline-block h-2 w-2 rounded-full", dot)} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-1 text-lg font-bold tabular-nums text-ink-900">{value}</dd>
      <dd className="text-xs text-ink-500">{sub}</dd>
    </div>
  );
}
