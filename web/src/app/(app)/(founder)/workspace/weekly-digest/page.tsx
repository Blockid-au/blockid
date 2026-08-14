// /workspace/weekly-digest — Advisor weekly digest surface.
// Nav-linked; ships with WorkspaceLayout so the sidebar renders correctly
// while the full digest engine is under development.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { Send } from "lucide-react";

export const metadata: Metadata = {
  title: "Weekly Digest | Workspace | BlockID",
  description:
    "Auto-generated digest of your portfolio's week — advisor-curated highlights sent every Monday.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WeeklyDigestPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/weekly-digest");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 mb-4">
            <Send className="w-7 h-7 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-ink-900">Weekly Digest</h1>
          <p className="mt-2 text-sm text-ink-600">
            Auto-generated digest of your portfolio's week — advisor-curated highlights sent every Monday.
          </p>
          {/* EN/VI copy */}
          <p className="mt-1 text-xs text-ink-400">
            Bản tóm tắt hàng tuần — tổng hợp tự động các điểm nổi bật của danh mục, gửi mỗi thứ Hai.
          </p>
        </div>

        <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-700">Coming Soon</p>
          <p className="mt-2 text-sm text-ink-500">
            The Weekly Digest surface is under active development. Once live,
            you'll see curated highlights — portfolio performance, flagged
            action items, and advisor notes — ready to forward to stakeholders.
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Tính năng này đang được phát triển. Sẽ sớm ra mắt.
          </p>
          <p className="mt-4 text-xs text-ink-400">Estimated: Q3 2026</p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/workspace"
            className="inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
          >
            Back to Workspace
          </Link>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
