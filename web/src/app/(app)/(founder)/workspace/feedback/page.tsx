import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { FeedbackForm } from "./feedback-form";

export const metadata: Metadata = {
  title: "Feedback & Credits | BlockID",
  description: "Share feedback and earn credits.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface FeedbackRow {
  id: string;
  category: string;
  rating: number;
  ai_score: number | null;
  ai_summary: string | null;
  credits_awarded: number | null;
  status: string;
  created_at: string;
}

async function getSubmissions(userId: string): Promise<FeedbackRow[]> {
  const supabase = getSupabaseAdmin();
  if (!supabase) return [];

  const { data } = await supabase
    .from("feedback_submissions")
    .select("id, category, rating, ai_score, ai_summary, credits_awarded, status, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (data ?? []) as FeedbackRow[];
}

const CATEGORY_LABELS: Record<string, string> = {
  product: "Product",
  ux: "User Experience",
  feature: "Feature Request",
  bug: "Bug Report",
  other: "Other",
};

export default async function FeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/feedback");

  const isSandbox = await getCurrentProjectIsSandbox();
  const submissions = await getSubmissions(user.id);

  const totalCredits = submissions
    .filter((s) => s.status === "scored")
    .reduce((sum, s) => sum + (s.credits_awarded ?? 0), 0);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-3xl mx-auto space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-xl font-bold text-ink-800">Feedback & Credits</h1>
          <p className="text-sm text-ink-600 mt-1">
            Share your thoughts to help us improve — and earn credits in return.
            Our AI reviews each submission and awards 5–25 credits based on quality.
          </p>
        </div>

        {/* Stats */}
        {submissions.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="rounded-lg border border-ink-100 bg-ink-50 p-4 text-center">
              <div className="text-2xl font-bold text-ink-800">{submissions.length}</div>
              <div className="text-xs text-ink-500 mt-0.5">Submissions</div>
            </div>
            <div className="rounded-lg border border-ink-100 bg-ink-50 p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{totalCredits}</div>
              <div className="text-xs text-ink-500 mt-0.5">Credits Earned</div>
            </div>
            <div className="rounded-lg border border-ink-100 bg-ink-50 p-4 text-center col-span-2 sm:col-span-1">
              <div className="text-2xl font-bold text-ink-800">
                {submissions.filter((s) => s.status === "scored").length}
              </div>
              <div className="text-xs text-ink-500 mt-0.5">Reviewed</div>
            </div>
          </div>
        )}

        {/* Submission Form */}
        <div className="rounded-lg border border-ink-200 bg-white p-6 shadow-sm">
          <h2 className="text-base font-semibold text-ink-800 mb-4">
            Submit Feedback
          </h2>
          <FeedbackForm />
        </div>

        {/* History */}
        {submissions.length > 0 && (
          <div>
            <h2 className="text-base font-semibold text-ink-800 mb-3">
              Your Submissions
            </h2>
            <div className="space-y-3">
              {submissions.map((s) => (
                <div
                  key={s.id}
                  className="rounded-lg border border-ink-100 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-700">
                          {CATEGORY_LABELS[s.category] ?? s.category}
                        </span>
                        <span className="text-xs text-yellow-500">
                          {"★".repeat(s.rating)}
                          <span className="text-ink-200">
                            {"★".repeat(5 - s.rating)}
                          </span>
                        </span>
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            s.status === "scored"
                              ? "bg-green-50 text-green-700"
                              : s.status === "failed"
                              ? "bg-red-50 text-red-700"
                              : "bg-amber-50 text-amber-700"
                          }`}
                        >
                          {s.status === "scored"
                            ? "Reviewed"
                            : s.status === "failed"
                            ? "Failed"
                            : "Pending"}
                        </span>
                      </div>
                      {s.ai_summary && (
                        <p className="mt-2 text-xs text-ink-600 italic">
                          &ldquo;{s.ai_summary}&rdquo;
                        </p>
                      )}
                      <p className="mt-1 text-xs text-ink-400">
                        {new Date(s.created_at).toLocaleDateString("en-AU", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                    {s.credits_awarded != null && s.status === "scored" && (
                      <div className="shrink-0 text-right">
                        <div className="text-lg font-bold text-brand-600">
                          +{s.credits_awarded}
                        </div>
                        <div className="text-xs text-ink-400">credits</div>
                      </div>
                    )}
                  </div>
                  {s.ai_score != null && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 rounded-full bg-ink-100 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-brand-500"
                          style={{ width: `${s.ai_score}%` }}
                        />
                      </div>
                      <span className="text-xs text-ink-500 shrink-0">
                        AI score: {s.ai_score}/100
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </WorkspaceLayout>
  );
}
