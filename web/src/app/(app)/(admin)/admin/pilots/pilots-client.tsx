"use client";

// /admin/pilots — G16-C, retired to a read-only ledger by G25 (2026-09-21:
// "bỏ luôn coupon và pilot"). Table of past comped pilots (masked e-mail,
// tier, days left, submissions / reports / assessments, status), "End early"
// (DELETE /api/admin/pilots/[id]) for a comp still running, and the last 20
// applications the retired /pilot/investor form collected. No new pilots are
// offered: the start form is gone and POST /api/admin/pilots answers 410.
// Posts JSON from a client component — no inline scripts (CSP). Prices /
// defaults come in as props from lib/pilots/offer (server) so no literal
// lives here.

import * as React from "react";
import Link from "next/link";
import { FlaskConical, Inbox, Square } from "lucide-react";
import { AdminLayout } from "@/components/admin/admin-layout";
import type { PilotListRow } from "@/lib/pilots/service";
import type { PilotApplication } from "@/lib/pilots/applications";

export interface PilotsClientProps {
  user: { email: string; displayName: string | null };
  initial: { pilots: PilotListRow[]; active: number; cap: number };
  applications: PilotApplication[];
  /** Comp terms as they were, for the ledger caption (lib/pilots/offer). */
  defaults: { programPrice: string; tier: string };
}


function fmt(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

function statusClass(status: PilotListRow["status"]): string {
  if (status === "active") return "bg-green-100 text-green-700";
  if (status === "expired") return "bg-amber-100 text-amber-800";
  return "bg-surface-200 text-ink-600";
}

export function PilotsTable({ pilots, onEnd, ending }: { pilots: PilotListRow[]; onEnd?: (id: string) => void; ending?: string | null }) {
  if (pilots.length === 0) {
    return <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500" data-testid="pilots-empty">No pilots on the ledger. New pilots are no longer offered (G25).</p>;
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white">
      <table className="w-full text-left text-sm" data-testid="pilots-table">
        <thead className="bg-surface-100 text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th scope="col" className="px-3 py-2">Program</th>
            <th scope="col" className="px-3 py-2">Evaluator</th>
            <th scope="col" className="px-3 py-2">Tier</th>
            <th scope="col" className="px-3 py-2 text-right">Days left</th>
            <th scope="col" className="px-3 py-2 text-right">Submissions</th>
            <th scope="col" className="px-3 py-2 text-right">Reports</th>
            <th scope="col" className="px-3 py-2 text-right">Assessments</th>
            <th scope="col" className="px-3 py-2">Status</th>
            <th scope="col" className="px-3 py-2">Intake</th>
            <th scope="col" className="px-3 py-2"><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200">
          {pilots.map((p) => (
            <tr key={p.id} data-testid="pilot-row" data-status={p.status} data-pilot-id={p.id}>
              <td className="px-3 py-2 font-medium text-ink-800">
                {p.program_name}
                <div className="text-[11px] text-ink-400">{fmt(p.started_at)} → {fmt(p.expires_at)} · {p.credits_granted} cr</div>
              </td>
              <td className="px-3 py-2 font-mono text-xs text-ink-600" data-testid="pilot-email">{p.email_masked}</td>
              <td className="px-3 py-2"><span className="rounded-full bg-brand-100 px-2 py-0.5 text-[11px] font-medium text-brand-700">{p.tier}</span>{p.previous_plan ? <div className="text-[11px] text-ink-400">{`was ${p.previous_plan}`}</div> : null}</td>
              <td className="px-3 py-2 text-right tabular-nums" data-testid="pilot-days-left">{p.status === "active" ? p.days_left : "—"}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.submissions}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.reports_run}</td>
              <td className="px-3 py-2 text-right tabular-nums">{p.assessments}</td>
              <td className="px-3 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${statusClass(p.status)}`}>{p.status}</span>
                {p.ended_reason ? <div className="text-[11px] text-ink-400">{`${p.ended_reason}${p.plan_reverted === false ? " · plan kept" : ""}`}</div> : null}
              </td>
              <td className="px-3 py-2 text-xs">
                {p.intake_url ? <a href={p.intake_url} className="text-brand-700 underline" target="_blank" rel="noreferrer">/apply/{p.intake_slug}</a> : <span className="text-ink-400">none</span>}
              </td>
              <td className="px-3 py-2 text-right">
                {p.status === "active" && onEnd ? (
                  <button type="button" onClick={() => onEnd(p.id)} disabled={ending === p.id} data-testid="pilot-end-early" className="inline-flex h-8 items-center gap-1 rounded-lg border border-surface-300 px-2.5 text-xs font-medium text-ink-700 hover:bg-surface-100 disabled:opacity-50">
                    <Square strokeWidth={1.75} className="h-3 w-3" /> {ending === p.id ? "Ending…" : "End early"}
                  </button>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ApplicationsTable({ applications }: { applications: PilotApplication[] }) {
  if (applications.length === 0) return <p className="text-sm text-ink-500" data-testid="pilot-applications-empty">No applications — the public form was retired 2026-09-21 (G25).</p>;
  return (
    <div className="overflow-x-auto rounded-xl border border-surface-200 bg-white">
      <table className="w-full text-left text-sm" data-testid="pilot-applications">
        <thead className="bg-surface-100 text-xs uppercase tracking-wide text-ink-500">
          <tr>
            <th scope="col" className="px-3 py-2">Received</th>
            <th scope="col" className="px-3 py-2">Program</th>
            <th scope="col" className="px-3 py-2">Contact</th>
            <th scope="col" className="px-3 py-2 text-right">Cohort</th>
            <th scope="col" className="px-3 py-2">Intake</th>
            <th scope="col" className="px-3 py-2">Message</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-200">
          {applications.map((a) => (
            <tr key={a.id} data-testid="pilot-application">
              <td className="px-3 py-2 text-xs text-ink-500">{a.received_at.slice(0, 16).replace("T", " ")}</td>
              <td className="px-3 py-2 font-medium text-ink-800">{a.program_name}</td>
              <td className="px-3 py-2 text-xs">{a.contact_name}<div className="font-mono text-ink-500">{a.email}</div></td>
              <td className="px-3 py-2 text-right tabular-nums">{a.cohort_size}</td>
              <td className="px-3 py-2 text-xs">{a.intake_month}</td>
              <td className="max-w-md px-3 py-2 text-xs text-ink-600">{a.message || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function PilotsClient({ user, initial, applications, defaults }: PilotsClientProps) {
  const [pilots, setPilots] = React.useState(initial.pilots);
  const [active, setActive] = React.useState(initial.active);
  const [ending, setEnding] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{ type: "success" | "error"; message: string } | null>(null);

  async function refresh() {
    try {
      const res = await fetch("/api/admin/pilots", { cache: "no-store" });
      const data = (await res.json()) as { ok: boolean; pilots?: PilotListRow[]; active?: number };
      if (data.ok && data.pilots) {
        setPilots(data.pilots);
        setActive(data.active ?? 0);
      }
    } catch {
      /* keep the current list */
    }
  }

  async function handleEnd(id: string) {
    const row = pilots.find((p) => p.id === id);
    if (!row) return;
    if (!window.confirm(`End the pilot for ${row.program_name} (${row.email_masked}) now? The plan reverts to ${row.previous_plan ?? "free"} unless a Stripe subscription exists.`)) return;
    const note = window.prompt("Reason / note (optional)", "") ?? "";
    setEnding(id);
    setFeedback(null);
    try {
      const res = await fetch(`/api/admin/pilots/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "ended_early", note }),
      });
      const data = (await res.json()) as { ok: boolean; plan_reverted?: boolean; error?: string; message?: string };
      if (!res.ok || !data.ok) {
        setFeedback({ type: "error", message: data.message ?? data.error ?? "End failed" });
        return;
      }
      setFeedback({ type: "success", message: data.plan_reverted ? "Pilot ended — plan reverted." : "Pilot ended — plan kept (Stripe subscription or plan changed since)." });
      await refresh();
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    } finally {
      setEnding(null);
    }
  }

  return (
    <AdminLayout user={user}>
      <div className="mx-auto max-w-7xl space-y-8 p-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">G16-C · evaluator pilots · ledger only since G25</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink-800"><FlaskConical strokeWidth={1.75} className="h-6 w-6 text-brand-600" /> Pilots</h1>
            <p className="mt-1 text-sm text-ink-500">
              <span data-testid="pilots-active">{active}</span>{` of ${initial.cap} active · comp = ${defaults.tier} (${defaults.programPrice}/mo list) by admin grant, never a Stripe coupon.`}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link href="/workspace/accelerator/applications" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 text-ink-700 hover:bg-surface-100"><Inbox strokeWidth={1.75} className="h-4 w-4" /> Intake inbox</Link>
            <Link href="/admin/validation" className="inline-flex h-9 items-center rounded-lg border border-surface-300 bg-white px-3 text-ink-700 hover:bg-surface-100">Validation tracker</Link>
            <Link href="/admin/credits" className="inline-flex h-9 items-center rounded-lg border border-surface-300 bg-white px-3 text-ink-700 hover:bg-surface-100">Credits</Link>
          </nav>
        </header>

        {feedback ? (
          <p role="status" data-testid="pilots-feedback" className={`rounded-lg px-4 py-3 text-sm ${feedback.type === "success" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}>{feedback.message}</p>
        ) : null}

        <section aria-labelledby="pilots-table-heading" className="space-y-3">
          <h2 id="pilots-table-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-500">Pilots</h2>
          <PilotsTable pilots={pilots} onEnd={handleEnd} ending={ending} />
        </section>

        <section aria-labelledby="pilots-retired-heading" className="rounded-xl border border-surface-200 bg-white p-5" data-testid="pilots-retired">
          <h2 id="pilots-retired-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-500">No new pilots</h2>
          <p className="mt-1 text-xs text-ink-500">Retired 2026-09-21 (G25). Evaluators go straight to the sold ladder — Cohort 25 / Cohort 100 annual with the card-required trial, or Scout / Firm / Program. This page stays as the ledger of past comps (a comp still running can be ended early above). Track written proposals and the first paying program on <Link href="/admin/validation" className="font-semibold text-brand-700 hover:underline">/admin/validation</Link>.</p>
        </section>

        <section aria-labelledby="pilots-applications-heading" className="space-y-3">
          <h2 id="pilots-applications-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-500">Applications from the retired /pilot/investor form (last 20)</h2>
          <ApplicationsTable applications={applications} />
        </section>
      </div>
    </AdminLayout>
  );
}
