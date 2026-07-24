import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ESIC_DISCLAIMER,
  type ESICResult,
} from "@/lib/compliance/esic-eligibility";

export const metadata: Metadata = {
  title: "ESIC eligibility | BlockID",
  description:
    "Early Stage Innovation Company self-check status under Division 360 of the Income Tax Assessment Act 1997.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface EsicRow {
  is_esic: boolean | null;
  points_100: number | null;
  result_json: ESICResult | null;
  assessed_at: string | null;
}

async function loadLatest(
  userId: string,
  projectId: string | null,
): Promise<EsicRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("compliance_esic_assessments")
    .select("is_esic, points_100, result_json, assessed_at")
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("assessed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as EsicRow | null) ?? null;
}

export default async function EsicCompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/esic");

  const project = await getActiveProject(user.id);
  const row = await loadLatest(user.id, project?.id ?? null);
  const result = row?.result_json ?? null;

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-3xl p-6 space-y-6">
        <header className="space-y-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            AU compliance
          </p>
          <h1 className="text-2xl font-semibold text-foreground">
            ESIC eligibility
          </h1>
          <p className="text-sm text-muted-foreground">
            Division 360 <em>Income Tax Assessment Act 1997</em> — investors in
            a qualifying ESIC receive a 20% carry-forward tax offset (capped at
            A$200k) plus a 10-year CGT exemption on the qualifying shares.
          </p>
        </header>

        {row ? (
          <section
            aria-label="Latest ESIC assessment"
            data-testid="esic-latest-snapshot"
            className="rounded-2xl border border-border bg-background p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Latest self-assessment
              </h2>
              {row.assessed_at ? (
                <p className="text-xs text-muted-foreground">
                  {new Date(row.assessed_at).toLocaleString("en-AU")}
                </p>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Overall</dt>
                <dd className="font-medium text-foreground">
                  {row.is_esic ? "ESIC (qualifies)" : "Not yet qualifying"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">100-point score</dt>
                <dd className="font-medium text-foreground">
                  {row.points_100 ?? 0} / 100
                </dd>
              </div>
              {result ? (
                <>
                  <div>
                    <dt className="text-muted-foreground">Early-stage test</dt>
                    <dd className="font-medium text-foreground">
                      {result.eligible_early_stage ? "Pass" : "Fail"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Principles test</dt>
                    <dd className="font-medium text-foreground">
                      {result.eligible_innovation_principles ? "Pass" : "Fail"}
                    </dd>
                  </div>
                </>
              ) : null}
            </dl>
            {result?.gaps && result.gaps.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Gaps
                </p>
                <ul className="mt-1 list-disc pl-4 text-sm text-foreground">
                  {result.gaps.map((g) => (
                    <li key={g}>{g}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            {result?.recommendations && result.recommendations.length > 0 ? (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase text-muted-foreground">
                  Recommendations
                </p>
                <ul className="mt-1 list-disc pl-4 text-sm text-foreground">
                  {result.recommendations.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </section>
        ) : (
          <section
            data-testid="esic-empty-state"
            className="rounded-2xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground"
          >
            You haven&apos;t run the ESIC self-assessment yet. The worksheet
            walks the two Div 360 limbs (early-stage + innovation) and stores
            the result against your active project.
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/workspace/esic-assessment"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            {row ? "Re-run self-assessment" : "Run the self-assessment"}
          </Link>
          <Link
            href="/guide/09-funding"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-100"
          >
            Read Chapter 9 — Funding-ready
          </Link>
        </div>

        <p className="text-xs text-muted-foreground">{ESIC_DISCLAIMER}</p>
      </div>
    </div>
  );
}
