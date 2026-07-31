import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { FeedbackClient, type FeedbackRow, type FeedbackStats } from "./feedback-client";

export const metadata: Metadata = {
  title: "Feedback — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminFeedbackPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/feedback");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const supabase = getSupabaseAdmin();
  let rows: FeedbackRow[] = [];
  let stats: FeedbackStats = {
    total: 0,
    rewarded: 0,
    creditsGranted: 0,
    avgScore: 0,
    last7dCount: 0,
    last7dCredits: 0,
  };

  if (supabase) {
    const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const since7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data } = await supabase
      .from("user_feedback")
      .select("id, user_id, email, feedback, category, page, ai_score, ai_summary, credits_awarded, status, created_at")
      .gte("created_at", since30)
      .order("ai_score", { ascending: false })
      .limit(200);

    rows = (data ?? []) as FeedbackRow[];

    if (rows.length > 0) {
      const rewarded = rows.filter((r) => Number(r.credits_awarded) > 0);
      const sumScore = rows.reduce((s, r) => s + Number(r.ai_score || 0), 0);
      const sumCredits = rows.reduce((s, r) => s + Number(r.credits_awarded || 0), 0);
      const last7 = rows.filter((r) => r.created_at >= since7);
      stats = {
        total: rows.length,
        rewarded: rewarded.length,
        creditsGranted: Math.round(sumCredits * 100) / 100,
        avgScore: Math.round((sumScore / rows.length) * 10) / 10,
        last7dCount: last7.length,
        last7dCredits: Math.round(last7.reduce((s, r) => s + Number(r.credits_awarded || 0), 0) * 100) / 100,
      };
    }
  }

  return (
    <FeedbackClient
      user={{ email: user.email, displayName: user.displayName }}
      initialRows={rows}
      stats={stats}
    />
  );
}
