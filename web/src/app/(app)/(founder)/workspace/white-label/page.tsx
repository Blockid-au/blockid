// /workspace/white-label — White-label branding configuration.
// Nav-linked; ships with WorkspaceLayout so the sidebar renders correctly.
// Scale + Enterprise tier feature. Full configuration panel under development.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { Palette } from "lucide-react";

export const metadata: Metadata = {
  title: "White-label | Workspace | BlockID",
  description:
    "Apply your own branding — logo, colours, domain — across your BlockID workspace. Available on Scale and Enterprise plans.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WhiteLabelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/white-label");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 mb-4">
            <Palette className="w-7 h-7 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-ink-900">White-label</h1>
          <p className="mt-2 text-sm text-ink-600">
            Apply your own brand — custom logo, colour palette, and domain — across your BlockID workspace.
            Available on Scale and Enterprise plans.
          </p>
          {/* EN/VI copy */}
          <p className="mt-1 text-xs text-ink-400">
            Áp dụng thương hiệu của bạn — logo, bảng màu và tên miền riêng. Tính năng dành cho gói Scale và Enterprise.
          </p>
        </div>

        <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-700">Coming Soon — Scale &amp; Enterprise</p>
          <p className="mt-2 text-sm text-ink-500">
            The white-label configuration panel is under development. Once live,
            you'll be able to upload your logo, set brand colours, configure a
            custom domain, and remove BlockID attribution from client-facing
            reports and investor data rooms.
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Bảng cấu hình white-label đang được phát triển và sẽ sớm khả dụng.
          </p>
          <p className="mt-4 text-xs text-ink-400">Estimated: Q4 2026</p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/workspace/billing"
            className="inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 mr-3"
          >
            Upgrade Plan
          </Link>
          <Link
            href="/workspace/branding"
            className="inline-flex items-center rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50 mr-3"
          >
            Custom Branding
          </Link>
          <Link
            href="/workspace"
            className="inline-flex items-center rounded-md border border-ink-300 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            Back to Workspace
          </Link>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
