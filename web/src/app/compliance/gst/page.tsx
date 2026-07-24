import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  GST_DISCLAIMER,
  GST_THRESHOLD_AUD,
  type GSTResult,
} from "@/lib/compliance/gst-threshold";

export const metadata: Metadata = {
  title: "GST registration threshold | BlockID",
  description:
    "Track whether your rolling 12-month turnover crosses the A$75,000 GST registration threshold set by the ATO.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface GstRow {
  result_json: GSTResult | null;
  is_above_threshold: boolean | null;
  registered_for_gst: boolean | null;
  urgency: string | null;
  computed_at: string | null;
}

async function loadLatest(
  userId: string,
  projectId: string | null,
): Promise<GstRow | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;
  const { data } = await supabase
    .from("compliance_gst_status")
    .select(
      "result_json, is_above_threshold, registered_for_gst, urgency, computed_at",
    )
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("computed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as GstRow | null) ?? null;
}

function formatAud(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return "—";
  return `A$${value.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;
}

export default async function GstCompliancePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/compliance/gst");

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
            GST registration threshold
          </h1>
          <p className="text-sm text-muted-foreground">
            <em>A New Tax System (Goods and Services Tax) Act 1999</em> — you
            must register for GST within 21 days of realising your rolling
            12-month turnover has crossed{" "}
            <strong>{formatAud(GST_THRESHOLD_AUD)}</strong>. Both actual
            trailing-12mo and projected next-12mo turnover count.
          </p>
        </header>

        {row && result ? (
          <section
            aria-label="Latest GST assessment"
            data-testid="gst-latest-snapshot"
            className="rounded-2xl border border-border bg-background p-4"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold text-foreground">
                Latest snapshot
              </h2>
              {row.computed_at ? (
                <p className="text-xs text-muted-foreground">
                  {new Date(row.computed_at).toLocaleString("en-AU")}
                </p>
              ) : null}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Trailing 12mo</dt>
                <dd className="font-medium text-foreground">
                  {formatAud(result.actual_12mo_turnover_aud)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Projected next 12mo</dt>
                <dd className="font-medium text-foreground">
                  {formatAud(result.projected_12mo_turnover_aud)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Registered</dt>
                <dd className="font-medium text-foreground">
                  {row.registered_for_gst ? "Yes" : "No"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Urgency</dt>
                <dd className="font-medium text-foreground">
                  {result.urgency}
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-sm text-foreground">{result.reasoning}</p>
          </section>
        ) : (
          <section
            data-testid="gst-empty-state"
            className="rounded-2xl border border-dashed border-border bg-background p-4 text-sm text-muted-foreground"
          >
            No GST snapshot yet. POST your monthly turnover history and
            projection to <code>/api/compliance/gst-threshold</code> to record
            the first snapshot; a founder-facing form is planned in a future
            tick.
          </section>
        )}

        <div className="flex flex-wrap gap-3">
          <Link
            href="/guide/06-revenue"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Read Chapter 6 — Revenue
          </Link>
          <a
            href="https://www.ato.gov.au/businesses-and-organisations/gst-excise-and-indirect-taxes/gst/registering-for-gst"
            rel="noopener noreferrer"
            target="_blank"
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-100"
          >
            ATO — Registering for GST
          </a>
        </div>

        <p className="text-xs text-muted-foreground">{GST_DISCLAIMER}</p>
      </div>
    </div>
  );
}
