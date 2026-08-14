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
import { hasActiveResellerMembership } from "@/lib/reseller/scope";
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

  // Access is granted when EITHER
  //   (a) the user's plan bundles the `reseller.console` entitlement
  //       (i.e. plan = 'reseller_admin' — the dedicated reseller-only plan), or
  //   (b) the user has an active `reseller_admins` row.
  //
  // (b) matters because reseller owners often keep a founder plan (growth /
  // enterprise) so they can also run their own startup on the same account.
  // Prior to this check, such users successfully logged in but were 307ed away
  // from /reseller because their plan lacked `reseller.console` — the
  // reported "reseller login bug".
  const [planAllowed, memberAllowed] = await Promise.all([
    can(
      { id: user.id, plan: user.plan ?? "free", segment: "founder" },
      "reseller.console",
    ),
    hasActiveResellerMembership(user.id),
  ]);
  if (!planAllowed && !memberAllowed) {
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
