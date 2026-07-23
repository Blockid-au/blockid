/**
 * /invites/[token] — invitee-facing acceptance screen.
 *
 * Q4 Multi-project #3 (iteration-13 T4). Shows the project name + offered
 * role, requires the invitee to sign in, then flips the invite via POST
 * /api/projects/members/accept.
 *
 * Token disclosure: rendering the project name to an unauthenticated
 * viewer is OK — the URL already carries the token, so anyone with the
 * link can see the project. Signing in is the gate that binds the row.
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { AcceptInviteClient } from "./accept-invite-client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Project invite",
  description: "Accept an invitation to collaborate on a BlockID project.",
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
}

type InviteContext = {
  token: string;
  email: string;
  role: string;
  status: "invited" | "accepted" | "revoked";
  projectName: string;
};

async function loadInvite(token: string): Promise<InviteContext | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("project_members")
    .select("user_email, role, status, project_id, projects(name)")
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return null;

  // Supabase returns the joined projects row as an object or array
  // depending on FK cardinality inference. Handle both.
  const proj = Array.isArray(data.projects) ? data.projects[0] : data.projects;
  return {
    token,
    email: data.user_email as string,
    role: data.role as string,
    status: data.status as "invited" | "accepted" | "revoked",
    projectName: (proj?.name as string) ?? "your project",
  };
}

export default async function InvitePage({ params }: PageProps) {
  const { token } = await params;
  const invite = await loadInvite(token);
  if (!invite) notFound();

  const user = await getCurrentUser();

  const nextUrl = `/invites/${encodeURIComponent(token)}`;

  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-4 py-10">
      <div className="w-full rounded-xl border border-surface-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-medium uppercase tracking-[0.2em] text-gold-600">
          Project invite
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-ink-800 sm:text-3xl">
          You&apos;ve been invited to {invite.projectName}
        </h1>
        <dl className="mt-4 grid grid-cols-[110px_1fr] gap-y-2 text-sm">
          <dt className="text-ink-500">Invited email</dt>
          <dd className="font-medium text-ink-800">{invite.email}</dd>
          <dt className="text-ink-500">Role</dt>
          <dd className="font-medium text-ink-800">{invite.role}</dd>
          <dt className="text-ink-500">Status</dt>
          <dd className="font-medium text-ink-800">{invite.status}</dd>
        </dl>

        {invite.status === "revoked" && (
          <p className="mt-6 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            This invite has been revoked by the project owner. Ask them for a
            new one.
          </p>
        )}
        {invite.status === "accepted" && (
          <p className="mt-6 rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800">
            This invite has already been accepted. Head to your{" "}
            <Link href="/workspace/projects" className="underline">
              workspace
            </Link>{" "}
            to switch into the project.
          </p>
        )}

        {invite.status === "invited" && !user && (
          <div className="mt-6 space-y-3">
            <p className="text-sm text-ink-600">
              Sign in as{" "}
              <span className="font-medium text-ink-800">{invite.email}</span>{" "}
              to accept.
            </p>
            <Link
              href={`/auth/login?next=${encodeURIComponent(nextUrl)}`}
              className="inline-flex w-full items-center justify-center rounded-md bg-ink-800 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-ink-900"
            >
              Sign in to accept
            </Link>
          </div>
        )}

        {invite.status === "invited" && user && (
          <AcceptInviteClient
            token={invite.token}
            expectedEmail={invite.email}
            currentEmail={user.email}
          />
        )}
      </div>
    </main>
  );
}
