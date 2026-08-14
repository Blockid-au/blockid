// /workspace/applications — Accelerator cohort application inbox.
// Nav-linked; ships with WorkspaceLayout so the sidebar renders correctly
// while the full application engine is under development.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { ClipboardCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Applications | Workspace | BlockID",
  description:
    "Track and review accelerator cohort applications in one centralised inbox.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ApplicationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/applications");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 mb-4">
            <ClipboardCheck className="w-7 h-7 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-ink-900">Applications</h1>
          <p className="mt-2 text-sm text-ink-600">
            Track and review accelerator cohort applications in one centralised inbox.
          </p>
          {/* EN/VI copy */}
          <p className="mt-1 text-xs text-ink-400">
            Theo dõi và xem xét đơn đăng ký tham gia cohort tăng tốc trong một hộp thư tập trung.
          </p>
        </div>

        <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-700">Coming Soon</p>
          <p className="mt-2 text-sm text-ink-500">
            The Applications inbox is under active development. Once live,
            accelerator managers can receive, score, and advance startup
            applications through a structured review pipeline.
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
