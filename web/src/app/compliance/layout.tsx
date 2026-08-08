// /compliance/* layout — G8-P6 chrome backfill.
//
// Wraps all standalone /compliance/[tool] pages with WorkspaceLayout so
// they gain the sidebar, topbar, and new workspace footer added in G8-P5.
// Each child page still does its own per-page auth check; this layout adds
// only the chrome shell.

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const dynamic = "force-dynamic";

interface Props {
  children: ReactNode;
}

export default async function ComplianceLayout({ children }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/compliance");
  }

  return (
    <WorkspaceLayout
      user={{
        email: user.email,
        displayName: user.displayName ?? null,
        avatarUrl: user.avatarUrl ?? null,
        role: user.role ?? undefined,
      }}
    >
      {children}
    </WorkspaceLayout>
  );
}
