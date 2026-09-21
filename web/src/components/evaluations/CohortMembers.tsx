"use client";

// CohortMembers — the seats on a BlockID Cohort (G21 P2-B): avatar row with
// role chips, and for the owner an inline "Invite reviewer" form (e-mail +
// role → POST /api/evaluations/batch/[id]/members; an unknown e-mail shows
// the 404 hint verbatim) plus remove. Everyone else sees the row read-only.

import * as React from "react";
import { useRouter } from "next/navigation";
import { UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { userErrorMessage } from "@/lib/ui/user-error";

export interface CohortMemberView {
  userId: string;
  role: "owner" | "reviewer" | "viewer";
  email: string | null;
  displayName: string | null;
  isCreator: boolean;
}

export interface CohortMembersProps {
  batchId: string;
  members: CohortMemberView[];
  /** The viewer is an owner → invite / remove controls. */
  canManage: boolean;
  /** False before migration 0423 — the invite form explains instead. */
  available: boolean;
  className?: string;
}

const ROLE_CHIP: Record<CohortMemberView["role"], string> = {
  owner: "border-brand-300 text-action",
  reviewer: "border-line text-secondary",
  viewer: "border-line-subtle text-muted",
};

export function initialsOf(m: Pick<CohortMemberView, "displayName" | "email">): string {
  const src = (m.displayName?.trim() || m.email?.split("@")[0] || "?").replace(/[^a-z0-9 ]/gi, " ");
  const parts = src.split(/\s+/).filter(Boolean);
  const two = parts.length >= 2 ? `${parts[0]![0]}${parts[1]![0]}` : (parts[0] ?? "?").slice(0, 2);
  return two.toUpperCase();
}

export function CohortMembers({ batchId, members, canManage, available, className }: CohortMembersProps) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"reviewer" | "viewer">("reviewer");
  const [state, setState] = React.useState<"idle" | "busy" | "ok" | "error">("idle");
  const [message, setMessage] = React.useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setState("error");
      setMessage("Enter the reviewer's e-mail address");
      return;
    }
    setState("busy");
    setMessage(null);
    try {
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/members`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), role }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string; email_sent?: boolean; already?: boolean };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? `HTTP ${res.status}`), { status: res.status, body });
      setState("ok");
      setMessage(body.already ? "Role updated." : body.email_sent ? "Added — they have been e-mailed a link to this cohort." : "Added.");
      setEmail("");
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(userErrorMessage(err, "Could not add that reviewer — try again."));
    }
  }

  async function remove(userId: string) {
    if (!canManage) return;
    try {
      const res = await fetch(`/api/evaluations/batch/${encodeURIComponent(batchId)}/members`, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: userId }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? `HTTP ${res.status}`), { status: res.status, body });
      router.refresh();
    } catch (err) {
      setState("error");
      setMessage(userErrorMessage(err, "Could not remove that seat — try again."));
    }
  }

  return (
    <section aria-labelledby="cohort-members-heading" className={cn("rounded-2xl border border-line-subtle bg-surface p-3 text-primary", className)} data-testid="cohort-members">
      <div className="flex flex-wrap items-center gap-2">
        <h2 id="cohort-members-heading" className="text-xs font-semibold uppercase tracking-wider text-muted">
          Reviewers
        </h2>
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Seats on this cohort">
          {members.map((m) => (
            <li key={m.userId} className="flex items-center gap-1.5 rounded-full border border-line-subtle bg-surface-sunken py-0.5 pl-0.5 pr-2 text-xs" data-testid="cohort-member" data-role={m.role}>
              <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-navy text-[11px] font-semibold text-white" aria-hidden="true">
                {initialsOf(m)}
              </span>
              <span className="text-primary">{m.displayName || m.email || "Seat"}</span>
              <span className={cn("rounded-full border px-1.5 text-[10px] font-medium uppercase", ROLE_CHIP[m.role])}>{m.role}</span>
              {canManage && !m.isCreator ? (
                <button type="button" onClick={() => remove(m.userId)} className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted hover:text-bear" aria-label={`Remove ${m.displayName || m.email || "this seat"} from the cohort`}>
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {canManage ? (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-controls="cohort-invite-form" className="ml-auto inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-line bg-surface px-3 text-xs font-medium text-secondary hover:bg-surface-hover" data-testid="invite-reviewer-toggle">
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Invite reviewer
          </button>
        ) : null}
      </div>
      {canManage && open ? (
        <form id="cohort-invite-form" onSubmit={invite} noValidate className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end" data-testid="invite-reviewer-form">
          <label className="flex-1 text-xs font-medium text-secondary">
            E-mail of an existing BlockID account
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-primary" data-testid="invite-email" />
          </label>
          <label className="text-xs font-medium text-secondary">
            Role
            <select value={role} onChange={(e) => setRole(e.target.value as "reviewer" | "viewer")} className="mt-1 h-11 w-full rounded-xl border border-line bg-surface px-3 text-sm text-primary sm:w-36" data-testid="invite-role">
              <option value="reviewer">Reviewer</option>
              <option value="viewer">Viewer</option>
            </select>
          </label>
          <button type="submit" disabled={state === "busy" || !available} className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-navy px-4 text-sm font-semibold text-white hover:bg-brand-navy-elev-1 disabled:opacity-50" data-testid="invite-submit">
            {state === "busy" ? "Adding…" : "Add"}
          </button>
        </form>
      ) : null}
      {!available && canManage && open ? <p className="mt-2 text-xs text-warn">Reviewer seats are not available on this environment yet.</p> : null}
      {message ? (
        <p role={state === "error" ? "alert" : "status"} className={cn("mt-2 text-xs", state === "error" ? "text-bear" : "text-bull")} data-testid="invite-message">
          {message}
        </p>
      ) : null}
    </section>
  );
}
