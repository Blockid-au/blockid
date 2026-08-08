// Reseller console layout — gated by the `reseller.console` entitlement.
// Any user without the entitlement is redirected to the dashboard.
//
// G8-P6: Now wraps children with WorkspaceLayout for chrome parity
// with advisor/accelerator/lp portals (per docs/plans/reseller-module-plan.md
// § C.1 "Reuse WorkspaceLayout"). The header copy moved here so the
// outer shell sits above the WorkspaceLayout main area.
//
// Nav group is added conditionally in web/src/components/workspace/nav-groups.ts
// (P4.2 — deferred until this scaffold is in place).

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";

export const dynamic = "force-dynamic";

interface Props {
  children: ReactNode;
}

export default async function ResellerLayout({ children }: Props) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/auth/login?next=/reseller");
  }

  // AppUser doesn't carry `segment` — the entitlement engine only reads
  // plan + id. Segment is derived elsewhere (from account_type). We pass a
  // stable placeholder "founder" since `reseller.console` is plan-gated,
  // not segment-gated.
  const allowed = await can(
    { id: user.id, plan: user.plan ?? "free", segment: "founder" },
    "reseller.console",
  );
  if (!allowed) {
    redirect("/dashboard/svi");
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
