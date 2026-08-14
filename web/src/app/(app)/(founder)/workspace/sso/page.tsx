// /workspace/sso — SAML/OIDC Single Sign-On configuration surface.
// Nav-linked; ships with WorkspaceLayout so the sidebar renders correctly.
// Enterprise-tier feature. Full SAML metadata editor under development.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Single Sign-On | Workspace | BlockID",
  description:
    "Configure SAML 2.0 / OIDC single sign-on for your workspace. Available on Enterprise plans.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SSOPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/sso");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-brand-50 mb-4">
            <Shield className="w-7 h-7 text-brand-600" />
          </div>
          <h1 className="text-2xl font-bold text-ink-900">Single Sign-On</h1>
          <p className="mt-2 text-sm text-ink-600">
            Configure SAML 2.0 / OIDC SSO so your team signs in via your corporate identity provider.
            Available on Enterprise plans.
          </p>
          {/* EN/VI copy */}
          <p className="mt-1 text-xs text-ink-400">
            Cấu hình đăng nhập một lần SAML 2.0 / OIDC. Tính năng dành cho gói Enterprise.
          </p>
        </div>

        <div className="rounded-lg border border-ink-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-ink-700">Coming Soon — Enterprise Tier</p>
          <p className="mt-2 text-sm text-ink-500">
            The SSO configuration surface is under development. Once live,
            Enterprise workspace admins can upload IdP metadata, map attribute
            claims, and enforce SSO-only login for all members.
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Tính năng SSO đang được phát triển và sẽ sớm khả dụng cho gói Enterprise.
          </p>
          <p className="mt-4 text-xs text-ink-400">Estimated: Q4 2026</p>
        </div>

        <div className="mt-6 text-center">
          <Link
            href="/workspace/billing"
            className="inline-flex items-center rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 mr-3"
          >
            Upgrade to Enterprise
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
