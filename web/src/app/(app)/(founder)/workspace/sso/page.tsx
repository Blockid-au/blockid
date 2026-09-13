// /workspace/sso — Single Sign-On (SAML / OIDC).
// S31-B (2026-09-13): honest "not available yet" surface. The previous page
// promised "Coming Soon — Estimated: Q4 2026" with "Upgrade to Enterprise" → /workspace/billing and offered an
// upgrade button under a feature that does not exist. SSO is a third-party identity-provider integration and is deferred; it is not sold on any plan today.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { NotAvailableYet } from "@/components/workspace/not-available-yet";
import { Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "Single Sign-On | Workspace | BlockID",
  description: "SAML 2.0 / OIDC single sign-on for your workspace is not available yet.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function SSOPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/sso");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <NotAvailableYet
        feature="sso"
        title="Single Sign-On"
        icon={Shield}
        userEmail={user.email}
        reason="Signing your team in through a corporate identity provider (SAML 2.0 / OIDC) needs a partner integration we have not built. Nothing on any plan grants it today, so we do not sell it. Team members can be invited by email and sign in with a password, Google, or a magic link."
        alternatives={[
          { href: "/workspace/team", label: "Invite team members" },
          { href: "/workspace/settings", label: "Account and sign-in settings" },
        ]}
      />
    </WorkspaceLayout>
  );
}
