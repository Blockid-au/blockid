import Link from "next/link";
import { FileText, Clock, ArrowRight } from "lucide-react";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase";
import { SVI_STAGE_LABELS } from "@/lib/svi-analysis";
import { Button } from "@/components/ui/button";

// ---------------------------------------------------------------------------
// ReportHistory — server component that lists past SVI analyses for the
// logged-in user.  Each card links to /s/[slug] so the user can re-view any
// report without spending credits (read from cache).
// ---------------------------------------------------------------------------

interface AnalysisRow {
  id: string;
  total_svi: number;
  input_type: string | null;
  raw_input: string | null;
  svi_version: string | null;
  created_at: string;
  analysis_json: {
    stage?: number;
    stageLabel?: string;
    stageBonus?: number;
  } | null;
}

/** Map SVI score to a tier badge label. */
function tierLabel(svi: number): string {
  if (svi >= 200) return "Elite";
  if (svi >= 170) return "Outstanding";
  if (svi >= 140) return "Strong";
  if (svi >= 110) return "Above Average";
  if (svi >= 80) return "Average";
  return "Early";
}

/** Map SVI score to a tier badge colour. */
function tierColor(svi: number): string {
  if (svi >= 170) return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (svi >= 110) return "bg-brand-50 text-brand-700 border-brand-200";
  if (svi >= 80) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-surface-100 text-ink-600 border-surface-200";
}

/** Truncate raw input to a short snippet. */
function inputSnippet(raw: string | null, maxLen = 80): string {
  if (!raw) return "No input recorded";
  const clean = raw.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen).trimEnd() + "...";
}

export async function ReportHistory({ email }: { email: string }) {
  if (!isSupabaseConfigured()) return null;

  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data: rows, error } = await supabase
    .from("svi_analyses")
    .select("id, total_svi, input_type, raw_input, svi_version, created_at, analysis_json")
    .eq("email", email.toLowerCase().trim())
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("[blockid:report-history] query failed", error);
    return null;
  }

  const analyses = (rows as AnalysisRow[] | null) ?? [];

  return (
    <section className="mt-8 bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-brand-600" />
          <h2 className="text-lg font-semibold text-ink-800">Your Reports</h2>
        </div>
        {analyses.length > 0 && (
          <Link
            href="/score"
            className="text-sm font-medium text-brand-600 hover:text-brand-700"
          >
            + New analysis
          </Link>
        )}
      </div>

      {analyses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-200 px-6 py-10 text-center">
          <p className="text-base font-semibold text-ink-800">
            No reports yet
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm text-ink-600">
            Get your first SVI score — it takes 60 seconds and your first
            analysis is free.
          </p>
          <Link href="/score" className="mt-5 inline-block">
            <Button variant="primary" size="md" className="h-10">
              Get your first SVI score
            </Button>
          </Link>
        </div>
      ) : (
        <ul className="space-y-3">
          {analyses.map((a) => {
            const stage = a.analysis_json?.stage ?? 0;
            const stageLabel =
              a.analysis_json?.stageLabel ?? SVI_STAGE_LABELS[stage] ?? "Concept";

            return (
              <li key={a.id}>
                <Link
                  href={`/s/${a.id}`}
                  className="flex flex-col gap-2 rounded-xl border border-surface-200 bg-surface-100 px-4 py-3 transition-colors hover:border-brand-200 hover:bg-brand-50/30 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-bold text-ink-800">
                        SVI {a.total_svi}
                      </span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] ${tierColor(a.total_svi)}`}
                      >
                        {tierLabel(a.total_svi)}
                      </span>
                      <span className="rounded-full border border-surface-200 bg-white px-2.5 py-0.5 text-[10px] font-medium text-ink-600">
                        {stageLabel}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-xs text-ink-500">
                      {inputSnippet(a.raw_input)}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    <span className="flex items-center gap-1 text-xs text-ink-500">
                      <Clock className="h-3 w-3" />
                      {new Date(a.created_at).toLocaleDateString("en-AU", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                    <ArrowRight className="h-4 w-4 text-brand-600" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
