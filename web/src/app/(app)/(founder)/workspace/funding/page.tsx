/**
 * /workspace/funding — Grant & Program Finder / Money Radar in the founder
 * workspace (T0244, plan §4f + §4i D-2). Sidebar leaf: Validate › Discover.
 *
 * Soft feature gate on `grant_finder`:
 *   • free founders — the 3-question intake (prefilled from `projects`,
 *     `project_grant_profiles`, latest SVI snapshot) with the free preview
 *     and the A$3 (3 credits) / Starter paywall (`FundingIntake` →
 *     `FundingPaywall` credits rail);
 *   • paid founders — tabs Grants · Programs · Events · Timeline · Capital
 *     map · Alerts fed by the latest `funding_reports` row for the active
 *     startup, plus the intake underneath to (re)run a report.
 *
 * `?tab=` picks the initial tab; `?draft=<ref>` is the "Draft application"
 * stub from the report cards (acknowledged, no drafting logic yet).
 */

import type { Metadata } from "next";
import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { Coins, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { FundingIntake } from "@/components/funding/funding-intake";
import { FundingDisclaimer } from "@/components/funding/funding-disclaimer";
import { getActiveProject, getCurrentProjectIsSandbox } from "@/lib/projects";
import { listGrants, listPrograms } from "@/lib/funding/data";
import { parseFundingIntake, NOT_INCORPORATED } from "@/lib/funding/intake";
import { latestVerifiedAt } from "@/lib/funding/directory";
import {
  CAPITAL_MAP_SECTIONS,
  MONEY_RADAR_ALERT_KINDS,
  intakePrefillFor,
  latestFundingReportForUser,
  listCapitalMapRows,
  listEventPrograms,
} from "@/lib/funding/workspace";
import { capitalForCity } from "@/lib/funding/seed-map";
import { FundingWorkspace, isFundingTab, type CapitalMapSection } from "./funding-workspace";
import { MoneyRadarTile } from "@/components/dashboard/money-radar-tile";
import { getMoneyRadarTileData } from "@/lib/funding/tile-data";

export const metadata: Metadata = {
  title: "Grant & Program Finder | BlockID",
  description: "The Australian grants, programs and events your startup qualifies for, with a 12-month timeline and deadline alerts.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<{ tab?: string | string[]; draft?: string | string[] }>;
}

function first(v: string | string[] | undefined): string | null {
  return (Array.isArray(v) ? v[0] : v) ?? null;
}

export default async function WorkspaceFundingPage({ searchParams }: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/funding");

  const sp = await searchParams;
  const tabParam = first(sp.tab);
  const draftRef = first(sp.draft);

  const [isSandbox, included, project] = await Promise.all([
    getCurrentProjectIsSandbox(),
    can({ id: user.id, plan: user.plan ?? "free", segment: "founder" }, "grant_finder"),
    getActiveProject(user.id).catch(() => null),
  ]);

  const [prefill, grants, programs] = await Promise.all([
    intakePrefillFor(user, project),
    listGrants({ status: "open" }),
    listPrograms({ status: "open" }),
  ]);
  const openGrantCount = grants.length;
  const openProgramCount = programs.length;

  let workspace: ReactNode = null;
  let tile: ReactNode = null;
  if (included) {
    const row = await latestFundingReportForUser(user.id, project?.id ?? null);
    // Same tile as /dashboard, compact, on the paid page (T0248 D-2). The
    // report + catalogue are already in hand; a failed read just hides it.
    const radarOn = await can({ id: user.id, plan: user.plan ?? "free", segment: "founder" }, "money_radar").catch(() => false);
    const data = await getMoneyRadarTileData(user, project, { hasMoneyRadar: radarOn, report: row, grants, programs }).catch(() => null);
    tile = data ? <MoneyRadarTile data={data} compact className="mb-6" /> : null;
    const intake = row ? parseFundingIntake(row.intake) : null;
    const state = intake?.ok ? (intake.intake.state === NOT_INCORPORATED ? intake.intake.based_state ?? null : intake.intake.state) : (prefill.state ?? null);
    const city = intake?.ok ? intake.intake.city ?? null : null;
    const capitalGuess = city || (state && state !== NOT_INCORPORATED) ? capitalForCity(city, state) : "Remote";
    // "Remote" = no usable location → show every capital's events rather than none.
    const capital = capitalGuess === "Remote" ? null : capitalGuess;
    const [events, capitalRows] = await Promise.all([listEventPrograms(capital), listCapitalMapRows()]);
    const capitalMap: CapitalMapSection[] = CAPITAL_MAP_SECTIONS.map((s) => ({
      ...s,
      rows: s.type in capitalRows ? capitalRows[s.type as keyof typeof capitalRows] : [],
    }));
    const meta = (row?.meta ?? {}) as { today?: string; actions?: string[] };
    workspace = (
      <FundingWorkspace
        report={
          row
            ? {
                id: row.id,
                created_at: row.created_at,
                today: meta.today ?? null,
                state: state && state !== NOT_INCORPORATED ? state : null,
                grants: Array.isArray(row.grant_matches) ? row.grant_matches : [],
                programs: Array.isArray(row.program_matches) ? row.program_matches : [],
                timeline: Array.isArray(row.timeline) ? row.timeline : [],
                actions: meta.actions ?? [],
                project_id: row.project_id,
              }
            : null
        }
        events={events}
        capitalMap={capitalMap}
        alertKinds={MONEY_RADAR_ALERT_KINDS}
        initialTab={isFundingTab(tabParam) ? tabParam : "grants"}
        draftRef={draftRef}
      />
    );
  }

  const verified = latestVerifiedAt([...grants, ...programs]);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox} startupName={project?.name} currentPhase={project?.stage ?? 0}>
      <div className="mx-auto max-w-5xl" data-workspace-funding data-plan-included={included ? "1" : "0"}>
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-action">Validate · Discover</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-primary sm:text-3xl">Grant &amp; Program Finder</h1>
          <p className="mt-2 max-w-2xl text-sm text-secondary">
            {project ? `For ${project.name}: ` : ""}
            {openGrantCount} grants and {openProgramCount} programs are open across Australia right now. Find non-dilutive money before
            you sell equity.
          </p>
          {!included ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-line-subtle bg-surface-raised px-4 py-3 text-sm" data-paywall-hint>
              <span className="inline-flex items-center gap-2 text-primary">
                <Coins className="h-4 w-4 text-action" aria-hidden /> Full report: <strong>A$3</strong> (3 credits) per run
              </span>
              <span className="text-tertiary">or</span>
              <span className="inline-flex items-center gap-2 text-primary">
                <ShieldCheck className="h-4 w-4 text-bull" aria-hidden /> included in <strong>Starter A$29/mo</strong> with weekly Money Radar alerts
              </span>
              <Link href="/pricing" className="ml-auto font-semibold text-action">
                Compare plans →
              </Link>
            </div>
          ) : null}
        </header>

        {tile}
        {workspace}

        <section className={included ? "mt-10 border-t border-line-subtle pt-8" : ""} aria-label="Run a match">
          <FundingIntake
            openGrantCount={openGrantCount}
            openProgramCount={openProgramCount}
            initial={prefill}
            projectId={project?.id ?? null}
            variant="workspace"
          />
        </section>

        <FundingDisclaimer lastVerifiedAt={verified} className="mt-8" />
      </div>
    </WorkspaceLayout>
  );
}
