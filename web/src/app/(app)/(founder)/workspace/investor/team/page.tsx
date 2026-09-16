// /workspace/investor/team — seats of the caller's investor organisation
// (G13-W5-D3, S-D3; BA spec §A.5 E4.5 / F1 / F4). Server component: loads
// the team (org · members · open invites · seat limit from
// plans.usage_limits.seats — Scout 1 · Firm 3 · Program 5) and hands the
// invite form / accept banner / remove buttons to the client.
//
// `?invite=<token>` (the magic link from the seat invite email lands here
// after sign-in) → the client POSTs /api/investor/organisation/accept and
// shows the outcome. A signed-in non-evaluator may still ACCEPT (that is
// what makes them a seat); they only see the team once accepted.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { isEvaluatorUser } from "@/lib/evaluations";
import { getTeam, seatsUpgradeHint } from "@/lib/investor/organisations";
import { TeamClient } from "./team-client";

export const metadata: Metadata = {
  title: "Seats — Workspace — BlockID",
  description: "Invite colleagues as seats of your investor organisation so they open the same Investor Dossier, record their own assessment and see the firm's consensus.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ invite?: string | string[] }>;
}

const first = (v: string | string[] | undefined): string | null => (Array.isArray(v) ? v[0] : v) ?? null;

export default async function InvestorTeamPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  const params = await searchParams;
  const inviteToken = first(params?.invite);
  const token = inviteToken && /^[A-Za-z0-9_-]{16,64}$/.test(inviteToken) ? inviteToken : null;
  if (!user) redirect(`/auth/login?next=${encodeURIComponent(`/workspace/investor/team${token ? `?invite=${token}` : ""}`)}`);

  const [isSandbox, evaluator] = await Promise.all([getCurrentProjectIsSandbox(), isEvaluatorUser(user)]);
  const team = evaluator ? await getTeam({ id: user.id, plan: user.plan ?? null }) : null;

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-8" data-investor-team data-seats={team?.members.length ?? 0}>
        <nav className="text-sm text-ink-500">
          <Link href="/workspace/investor" className="hover:text-brand-600">
            Investor
          </Link>{" "}
          / <span className="text-ink-700">Seats</span>
        </nav>
        <header>
          <h1 className="text-2xl font-bold tracking-tight text-ink-900">Seats &amp; consensus</h1>
          <p className="mt-2 text-sm leading-relaxed text-ink-600">
            Every seat of your organisation opens the same Investor Dossier for each startup you evaluate, records their own assessment, and sees the firm&apos;s consensus (median rating per dimension, decision tally, disagreements to discuss). Seats are counted against your plan — Scout 1, Firm 3, Program 5.
          </p>
        </header>

        <TeamClient
          inviteToken={token}
          evaluator={evaluator}
          available={team?.available ?? false}
          org={team?.org ? { id: team.org.id, name: team.org.name, kind: team.org.kind, isPersonal: team.org.is_personal } : null}
          isOwner={team?.isOwner ?? false}
          members={team?.members ?? []}
          invites={(team?.invites ?? []).map((i) => ({ id: i.id, email: i.email, role: i.role, expiresAt: i.expiresAt }))}
          seats={team ? { limit: team.seats.unlimited ? null : team.seats.limit, used: team.seats.used } : { limit: 1, used: 1 }}
          upgradeHint={team ? seatsUpgradeHint(team.seats.unlimited ? Number.MAX_SAFE_INTEGER : team.seats.limit) : ""}
          viewerEmail={user.email}
        />

        {!evaluator && !token ? (
          <p className="rounded-2xl border border-dashed border-surface-300 bg-white px-6 py-8 text-sm text-ink-600" data-testid="team-gate">
            Seats belong to evaluator plans.{" "}
            <Link href="/pricing?segment=evaluator" className="text-brand-700 hover:underline">
              See evaluator plans
            </Link>{" "}
            — or open the invite link a colleague sent you to join their organisation.
          </p>
        ) : null}
      </div>
    </WorkspaceLayout>
  );
}
