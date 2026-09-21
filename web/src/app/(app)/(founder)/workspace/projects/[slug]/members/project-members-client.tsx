"use client";

/**
 * Client shell for /workspace/projects/[slug]/members.
 *
 * Presents the roster + invite form. Owner actions hit
 * /api/projects/[id]/members (POST/DELETE) and
 * /api/projects/[id]/members/[memberId] (PATCH role — S30-B). A revoked row
 * is re-invited in place via POST. The invite URL returned by
 * POST is surfaced verbatim for the owner to copy/paste — no email is
 * sent from this iteration (roadmap follow-up).
 */

import * as React from "react";
import type { ProjectMember, ProjectMemberRole } from "@/lib/project-members/scope";
import { ApiError, userErrorMessage } from "@/lib/ui/user-error";

interface Props {
  projectId: string;
  initialMembers: ProjectMember[];
}

const ROLES: { value: ProjectMemberRole; label: string; hint: string }[] = [
  { value: "viewer", label: "Viewer", hint: "Read-only access." },
  { value: "editor", label: "Editor", hint: "Can edit project data." },
  { value: "admin", label: "Admin", hint: "Full access except transfer of ownership." },
];

function statusLabel(status: ProjectMember["status"]): string {
  switch (status) {
    case "invited":
      return "Invited";
    case "accepted":
      return "Accepted";
    case "revoked":
      return "Revoked";
  }
}

function inviteLink(token: string): string {
  if (typeof window === "undefined") return `/invites/${token}`;
  return `${window.location.origin}/invites/${token}`;
}

export function ProjectMembersClient({ projectId, initialMembers }: Props) {
  const [members, setMembers] = React.useState<ProjectMember[]>(initialMembers);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<ProjectMemberRole>("viewer");
  const [submitting, setSubmitting] = React.useState(false);
  const [lastInviteUrl, setLastInviteUrl] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLastInviteUrl(null);
    setCopied(false);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, body), "Something went wrong. Please try again."));
        return;
      }
      setMembers((prev) => [...prev, body.member]);
      setLastInviteUrl(body.invite_url ?? inviteLink(body.member.token));
      setEmail("");
    } catch (err) {
      setError(userErrorMessage(err, "Failed to send invite"));
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevoke = async (memberId: string) => {
    if (!confirm("Revoke this member's access to the project?")) return;
    try {
      const res = await fetch(
        `/api/projects/${projectId}/members?memberId=${encodeURIComponent(memberId)}`,
        { method: "DELETE" },
      );
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, body), "Could not revoke access. Please try again."));
        return;
      }
      setMembers((prev) =>
        prev.map((m) => (m.id === memberId ? body.member : m)),
      );
    } catch (err) {
      console.error("[project-members] revoke", err);
      setError(userErrorMessage(err, "Could not revoke access. Please try again."));
    }
  };

  // S30-B (P2) — move a collaborator between viewer / editor / admin.
  const [roleBusyId, setRoleBusyId] = React.useState<string | null>(null);
  const handleRoleChange = async (memberId: string, nextRole: ProjectMemberRole) => {
    setError(null);
    setRoleBusyId(memberId);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/members/${encodeURIComponent(memberId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ role: nextRole }),
        },
      );
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, body), "Something went wrong. Please try again."));
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === memberId ? body.member : m)));
    } catch (err) {
      setError(userErrorMessage(err, "Failed to change role"));
    } finally {
      setRoleBusyId(null);
    }
  };

  // S30-B (P2) — a revoked address is re-invited in place (same row, fresh
  // link) at the role it last held; the new link is shown like a fresh invite.
  const handleReinvite = async (member: ProjectMember) => {
    setError(null);
    setLastInviteUrl(null);
    setCopied(false);
    setRoleBusyId(member.id);
    try {
      const res = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: member.userEmail, role: member.role }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(userErrorMessage(ApiError.fromBody(res.status, body), "Something went wrong. Please try again."));
        return;
      }
      setMembers((prev) => prev.map((m) => (m.id === member.id ? body.member : m)));
      setLastInviteUrl(body.invite_url ?? inviteLink(body.member.token));
    } catch (err) {
      setError(userErrorMessage(err, "Failed to re-invite"));
    } finally {
      setRoleBusyId(null);
    }
  };

  const copyInvite = async () => {
    if (!lastInviteUrl) return;
    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard denied — leave the URL visible for manual copy
    }
  };

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-surface-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-ink-800">Invite a member</h2>
        <p className="mt-1 text-sm text-ink-600">
          We&apos;ll generate a one-time invite link. Share it with the invitee —
          no email is sent yet.
        </p>

        <form onSubmit={handleInvite} className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_180px_auto]">
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-ink-700">Email</span>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="cofounder@example.com"
                className="rounded-md border border-surface-300 px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
              />
            </label>
            <label className="flex flex-col text-sm">
              <span className="mb-1 font-medium text-ink-700">Role</span>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as ProjectMemberRole)}
                className="rounded-md border border-surface-300 bg-white px-3 py-2 text-sm focus:border-gold-500 focus:outline-none"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-action px-4 py-2 min-h-11 text-sm font-semibold text-on-action shadow-sm hover:bg-action-hover disabled:opacity-50 sm:w-auto"
              >
                {submitting ? "Sending…" : "Create invite"}
              </button>
            </div>
          </div>
          <p className="text-xs text-ink-500">
            {ROLES.find((r) => r.value === role)?.hint}
          </p>

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}
        </form>

        {lastInviteUrl && (
          <div className="mt-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm">
            <p className="font-medium text-green-800">Invite ready</p>
            <p className="mt-1 text-green-700">
              Share this link — it&apos;s single-use. The invitee must sign in
              first.
            </p>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
              <code className="grow break-all rounded bg-white px-2 py-1 font-mono text-xs text-ink-800">
                {lastInviteUrl}
              </code>
              <button
                type="button"
                onClick={copyInvite}
                className="rounded-md border border-green-300 bg-white px-3 py-1 text-xs font-medium text-green-800 hover:bg-green-100"
              >
                {copied ? "Copied" : "Copy link"}
              </button>
            </div>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-surface-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-surface-200 px-5 py-3">
          <h2 className="text-lg font-semibold text-ink-800">Roster</h2>
          <span className="text-xs text-ink-500">
            {members.length} member{members.length === 1 ? "" : "s"}
          </span>
        </div>
        {members.length === 0 ? (
          <p className="px-5 py-6 text-sm text-ink-500">
            No members yet. Invite a co-founder above.
          </p>
        ) : (
          <ul className="divide-y divide-surface-200">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-ink-800">
                    {m.userEmail}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-500">
                    Role: <span className="font-medium">{m.role}</span> ·
                    Status: <span className="font-medium">{statusLabel(m.status)}</span>
                    {m.acceptedAt && (
                      <> · Joined {new Date(m.acceptedAt).toLocaleDateString()}</>
                    )}
                  </p>
                </div>
                {m.status !== "revoked" ? (
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-1.5 text-xs text-ink-600">
                      <span className="sr-only">Role for {m.userEmail}</span>
                      <select
                        aria-label={`Role for ${m.userEmail}`}
                        data-testid="member-role-select"
                        value={m.role}
                        disabled={roleBusyId === m.id}
                        onChange={(e) => handleRoleChange(m.id, e.target.value as ProjectMemberRole)}
                        className="rounded-md border border-surface-300 bg-white px-2 py-1.5 text-xs focus:border-gold-500 focus:outline-none disabled:opacity-50"
                      >
                        {ROLES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRevoke(m.id)}
                      className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      Revoke
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    data-testid="member-reinvite"
                    disabled={roleBusyId === m.id}
                    onClick={() => handleReinvite(m)}
                    className="rounded-md border border-surface-300 bg-white px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-surface-50 disabled:opacity-50"
                  >
                    {roleBusyId === m.id ? "Re-inviting…" : "Re-invite"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
