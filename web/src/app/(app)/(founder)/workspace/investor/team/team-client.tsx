"use client";

// TeamClient — seats list · invite form · accept banner · remove (G13-W5-D3,
// S-D3; BA spec §A.5 E4.5 / F4). Talks to /api/investor/organisation
// (GET/POST/DELETE) and /api/investor/organisation/accept. A 402
// `seat_limit` renders the plan-limit message with the upgrade link — no
// Stripe change, the existing plan gate (F4).

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { userErrorMessage } from "@/lib/ui/user-error";

export interface TeamClientProps {
  inviteToken: string | null;
  evaluator: boolean;
  available: boolean;
  org: { id: string; name: string; kind: string; isPersonal: boolean } | null;
  isOwner: boolean;
  members: Array<{ id: string; userId: string; role: string; displayName: string | null; email: string | null; isOwner: boolean; joinedAt: string }>;
  invites: Array<{ id: string; email: string; role: string; expiresAt: string }>;
  seats: { limit: number | null; used: number };
  upgradeHint: string;
  viewerEmail: string;
}

type Accept = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; orgName: string; already: boolean } | { kind: "error"; message: string };
type Invite = { kind: "idle" } | { kind: "busy" } | { kind: "ok"; email: string; url: string; sent: boolean } | { kind: "limit"; message: string; hint: string } | { kind: "error"; message: string };

const ROLE_LABEL: Record<string, string> = {
  investor_viewer: "Viewer",
  investor_analyst: "Analyst",
  investment_manager: "Investment manager",
  investment_partner: "Partner",
  ic_member: "IC member",
  fund_admin: "Fund admin",
  accelerator_analyst: "Program analyst",
  institutional_admin: "Admin",
};

export function TeamClient(p: TeamClientProps) {
  const router = useRouter();
  const [accept, setAccept] = useState<Accept>(p.inviteToken ? { kind: "busy" } : { kind: "idle" });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("investment_partner");
  const [invite, setInvite] = useState<Invite>({ kind: "idle" });
  const [removing, setRemoving] = useState<string | null>(null);

  useEffect(() => {
    if (!p.inviteToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/investor/organisation/accept", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: p.inviteToken }) });
        const body = (await res.json().catch(() => ({}))) as { ok?: boolean; org?: { name: string }; already_member?: boolean; message?: string; error?: string };
        if (cancelled) return;
        if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? "Could not accept"), { status: res.status, body });
        setAccept({ kind: "ok", orgName: body.org?.name ?? "the organisation", already: !!body.already_member });
        router.replace("/workspace/investor/team");
        router.refresh();
      } catch (err) {
        if (!cancelled) setAccept({ kind: "error", message: userErrorMessage(err, "This invite could not be accepted.") });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [p.inviteToken, router]);

  const sendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInvite({ kind: "busy" });
    try {
      const res = await fetch("/api/investor/organisation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email.trim(), role }) });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; invite_url?: string; email_sent?: boolean; upgrade_hint?: string; invite?: { email: string } };
      if (res.status === 402 && body.error === "seat_limit") {
        setInvite({ kind: "limit", message: body.message ?? "Seat limit reached.", hint: body.upgrade_hint ?? "" });
        return;
      }
      if (!res.ok || !body.ok) throw Object.assign(new Error(body.message ?? body.error ?? "Invite failed"), { status: res.status, body });
      setInvite({ kind: "ok", email: body.invite?.email ?? email.trim(), url: body.invite_url ?? "", sent: body.email_sent !== false });
      setEmail("");
      router.refresh();
    } catch (err) {
      setInvite({ kind: "error", message: userErrorMessage(err, "Could not send the invite.") });
    }
  };

  const remove = async (target: { member_id?: string; invite_id?: string }) => {
    const key = target.member_id ?? target.invite_id ?? "";
    setRemoving(key);
    try {
      const res = await fetch("/api/investor/organisation", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(target) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      router.refresh();
    } finally {
      setRemoving(null);
    }
  };

  const limitText = p.seats.limit === null ? "unlimited seats" : `${p.seats.used} of ${p.seats.limit} seat${p.seats.limit === 1 ? "" : "s"} in use`;
  const full = p.seats.limit !== null && p.seats.used >= p.seats.limit;

  return (
    <div className="space-y-6">
      {accept.kind !== "idle" ? (
        <div className={`rounded-xl border px-4 py-3 text-sm ${accept.kind === "error" ? "border-red-200 bg-red-50 text-red-800" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`} data-testid="accept-banner" role={accept.kind === "error" ? "alert" : "status"}>
          {accept.kind === "busy" ? "Accepting your seat…" : accept.kind === "ok" ? (accept.already ? `You already hold a seat at ${accept.orgName}.` : `Welcome — you now hold a seat at ${accept.orgName}. Open any startup the firm evaluates from Deal flow.`) : accept.message}
        </div>
      ) : null}

      {p.evaluator && !p.available ? (
        <p className="rounded-xl border border-dashed border-surface-300 bg-white px-4 py-3 text-sm text-ink-600" data-testid="team-unavailable">
          Seats are not available on this environment yet (migrations 0393 / 0403 pending).
        </p>
      ) : null}

      {p.evaluator && p.available && p.org ? (
        <>
          <section className="rounded-2xl border border-surface-200 bg-white p-5" data-testid="team-members">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-ink-900">{p.org.name}</h2>
              <span className="text-xs text-ink-500" data-testid="seat-usage">
                {limitText}
              </span>
            </div>
            <ul className="mt-3 divide-y divide-surface-100">
              {p.members.map((m) => (
                <li key={m.id} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-testid="seat-member">
                  <span className="font-medium text-ink-900">{m.displayName ?? m.email ?? "Seat"}</span>
                  {m.email && m.displayName ? <span className="text-xs text-ink-500">{m.email}</span> : null}
                  <span className="rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[11px] text-ink-600">{m.isOwner ? "Owner" : (ROLE_LABEL[m.role] ?? m.role)}</span>
                  {m.email?.toLowerCase() === p.viewerEmail.toLowerCase() ? <span className="text-[11px] text-ink-400">you</span> : null}
                  {p.isOwner && !m.isOwner ? (
                    <button type="button" onClick={() => remove({ member_id: m.id })} disabled={removing === m.id} className="ml-auto text-xs text-red-700 hover:underline disabled:opacity-60">
                      Remove seat
                    </button>
                  ) : null}
                </li>
              ))}
              {p.invites.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 py-2 text-sm" data-testid="seat-invite">
                  <span className="text-ink-700">{i.email}</span>
                  <span className="rounded-full border border-dashed border-surface-300 px-2 py-0.5 text-[11px] text-ink-500">Invited · {ROLE_LABEL[i.role] ?? i.role}</span>
                  {p.isOwner ? (
                    <button type="button" onClick={() => remove({ invite_id: i.id })} disabled={removing === i.id} className="ml-auto text-xs text-red-700 hover:underline disabled:opacity-60">
                      Revoke
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>

          {p.isOwner ? (
            <section className="rounded-2xl border border-surface-200 bg-white p-5" data-testid="team-invite">
              <h2 className="text-base font-semibold text-ink-900">Invite a seat</h2>
              <p className="mt-1 text-xs text-ink-500">They receive a magic link; the seat is theirs once they sign in with this address and accept.</p>
              <form onSubmit={sendInvite} className="mt-3 flex flex-wrap items-end gap-2">
                <label className="text-xs text-ink-700">
                  Email
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-64 rounded border border-surface-300 px-2 py-1.5 text-sm" placeholder="colleague@fund.vc" data-testid="invite-email" />
                </label>
                <label className="text-xs text-ink-700">
                  Role
                  <select value={role} onChange={(e) => setRole(e.target.value)} className="mt-1 block rounded border border-surface-300 px-2 py-1.5 text-sm">
                    {Object.entries(ROLE_LABEL).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="submit" disabled={invite.kind === "busy" || full} className="inline-flex min-h-9 items-center rounded-lg bg-action px-3 py-1.5 text-xs font-semibold text-on-action hover:bg-action-hover disabled:opacity-60" data-testid="invite-submit">
                  {invite.kind === "busy" ? "Sending…" : "Send invite"}
                </button>
              </form>
              {full ? (
                <p className="mt-2 text-xs text-amber-800" data-testid="seat-limit">
                  Your plan&apos;s seats are all in use. {p.upgradeHint}{" "}
                  <Link href="/pricing?segment=evaluator" className="text-brand-700 hover:underline">
                    See plans
                  </Link>
                </p>
              ) : null}
              {invite.kind === "limit" ? (
                <p className="mt-2 text-xs text-amber-800" role="alert" data-testid="seat-limit">
                  {invite.message} {invite.hint}{" "}
                  <Link href="/pricing?segment=evaluator" className="text-brand-700 hover:underline">
                    Upgrade
                  </Link>
                </p>
              ) : null}
              {invite.kind === "ok" ? (
                <p className="mt-2 text-xs text-emerald-800" role="status" data-testid="invite-sent">
                  Invite {invite.sent ? "emailed" : "created (email not sent — share the link)"} to {invite.email}.{" "}
                  {invite.url ? <code className="break-all rounded bg-surface-100 px-1 py-0.5 text-[11px]">{invite.url}</code> : null}
                </p>
              ) : null}
              {invite.kind === "error" ? (
                <p className="mt-2 text-xs text-red-700" role="alert">
                  {invite.message}
                </p>
              ) : null}
            </section>
          ) : (
            <p className="text-xs text-ink-500">Only the organisation owner can invite or remove seats.</p>
          )}
        </>
      ) : null}
    </div>
  );
}
