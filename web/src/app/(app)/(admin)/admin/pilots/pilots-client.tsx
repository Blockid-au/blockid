"use client";

// /admin/pilots — G16-C. Table of pilots (masked e-mail, tier, days left,
// submissions / reports / assessments, status), the "Start pilot" form
// (POST /api/admin/pilots), "End early" (DELETE /api/admin/pilots/[id]),
// links to the intake inbox and the last 20 /pilot applications. Posts JSON
// from a client component — no inline scripts (CSP). Prices / defaults come
// in as props from lib/pilots/offer (server) so no literal lives here.

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
  defaults: { days: number; credits: number; maxApplicants: number; programPrice: string; tier: string };
}

const INPUT = "w-full h-10 rounded-lg border border-surface-300 bg-white px-3 text-sm text-ink-800 placeholder:text-ink-400 focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-200";
const LABEL = "block text-xs font-medium text-ink-600 mb-1";

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
    return <p className="rounded-xl border border-dashed border-surface-300 bg-white p-6 text-sm text-ink-500" data-testid="pilots-empty">No pilots yet. Start one below once the evaluator has a BlockID account.</p>;
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
  if (applications.length === 0) return <p className="text-sm text-ink-500" data-testid="pilot-applications-empty">No applications yet — the form is at /pilot.</p>;
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
  const [email, setEmail] = React.useState("");
  const [programName, setProgramName] = React.useState("");
  const [days, setDays] = React.useState(String(defaults.days));
  const [credits, setCredits] = React.useState(String(defaults.credits));
  const [intakeSlug, setIntakeSlug] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
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

  async function handleStart(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!email.includes("@") || !programName.trim()) {
      setFeedback({ type: "error", message: "Evaluator e-mail and program name are required." });
      return;
    }
    if (!window.confirm(`Start a ${days}-day Program-tier pilot for ${email.trim()} and grant ${credits} credits? (Admin comp — no Stripe.)`)) return;
    setSubmitting(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/admin/pilots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), program_name: programName.trim(), days: Number(days), credits: Number(credits), intake_slug: intakeSlug.trim() || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; existing?: boolean; error?: string; message?: string; intake_url?: string | null; warnings?: string[] };
      if (!res.ok || !data.ok) {
        setFeedback({ type: "error", message: data.message ?? data.error ?? "Start failed" });
        return;
      }
      setFeedback({
        type: "success",
        message: data.existing ? "That evaluator already has an active pilot — returned as is." : `Pilot started.${data.intake_url ? ` Intake: ${data.intake_url}` : ""}${data.warnings?.length ? ` Warnings: ${data.warnings.join("; ")}` : ""}`,
      });
      setEmail("");
      setProgramName("");
      setIntakeSlug("");
      await refresh();
    } catch {
      setFeedback({ type: "error", message: "Network error." });
    } finally {
      setSubmitting(false);
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
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-brand-700">G16-C · evaluator pilots</p>
            <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-ink-800"><FlaskConical strokeWidth={1.75} className="h-6 w-6 text-brand-600" /> Pilots</h1>
            <p className="mt-1 text-sm text-ink-500">
              <span data-testid="pilots-active">{active}</span>{` of ${initial.cap} active · comp = ${defaults.tier} (${defaults.programPrice}/mo list) by admin grant, never a Stripe coupon.`}
            </p>
          </div>
          <nav className="flex flex-wrap gap-2 text-sm">
            <Link href="/workspace/accelerator/applications" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-surface-300 bg-white px-3 text-ink-700 hover:bg-surface-100"><Inbox strokeWidth={1.75} className="h-4 w-4" /> Intake inbox</Link>
            <Link href="/pilot" className="inline-flex h-9 items-center rounded-lg border border-surface-300 bg-white px-3 text-ink-700 hover:bg-surface-100">/pilot (public offer)</Link>
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

        <section aria-labelledby="pilots-start-heading" className="rounded-xl border border-surface-200 bg-white p-5">
          <h2 id="pilots-start-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-500">Start pilot</h2>
          <p className="mt-1 text-xs text-ink-500">The evaluator must already have a BlockID account (404 otherwise — pilots never create accounts). Sets plan → {defaults.tier}, grants credits, creates the intake link (≤ {defaults.maxApplicants} applicants) as that user, sends the welcome e-mail, audits, alerts ops.</p>
          <form onSubmit={handleStart} className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-5" data-testid="pilot-start-form">
            <div className="lg:col-span-2">
              <label htmlFor="pilot-start-email" className={LABEL}>Evaluator e-mail</label>
              <input id="pilot-start-email" name="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@program.org" className={INPUT} />
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="pilot-start-program" className={LABEL}>Program name</label>
              <input id="pilot-start-program" name="program_name" type="text" required maxLength={120} value={programName} onChange={(e) => setProgramName(e.target.value)} placeholder="Startmate Winter 27" className={INPUT} />
            </div>
            <div>
              <label htmlFor="pilot-start-days" className={LABEL}>Days</label>
              <input id="pilot-start-days" name="days" type="number" min={1} max={90} value={days} onChange={(e) => setDays(e.target.value)} className={INPUT} />
            </div>
            <div>
              <label htmlFor="pilot-start-credits" className={LABEL}>Credits</label>
              <input id="pilot-start-credits" name="credits" type="number" min={0} max={5000} step="0.5" value={credits} onChange={(e) => setCredits(e.target.value)} className={INPUT} />
            </div>
            <div className="lg:col-span-2">
              <label htmlFor="pilot-start-slug" className={LABEL}>Existing intake slug (optional — otherwise one is created)</label>
              <input id="pilot-start-slug" name="intake_slug" type="text" value={intakeSlug} onChange={(e) => setIntakeSlug(e.target.value)} placeholder="winter-27-abcdefgh" className={INPUT} />
            </div>
            <div className="flex items-end lg:col-span-2">
              <button type="submit" disabled={submitting} data-testid="pilot-start-submit" className="inline-flex h-10 items-center gap-2 rounded-lg bg-brand-600 px-4 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50">
                {submitting ? "Starting…" : "Start pilot"}
              </button>
            </div>
          </form>
        </section>

        <section aria-labelledby="pilots-applications-heading" className="space-y-3">
          <h2 id="pilots-applications-heading" className="text-sm font-semibold uppercase tracking-wide text-ink-500">Applications from /pilot (last 20)</h2>
          <ApplicationsTable applications={applications} />
        </section>
      </div>
    </AdminLayout>
  );
}
