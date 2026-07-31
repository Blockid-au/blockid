// Reseller console layout — gated by the `reseller.console` entitlement.
// Any user without the entitlement is redirected to the dashboard.
//
// The console re-uses the existing WorkspaceLayout shell for chrome parity
// with advisor/accelerator/lp portals (per docs/plans/reseller-module-plan.md
// § C.1 "Reuse WorkspaceLayout").
//
// Nav group is added conditionally in web/src/components/workspace/nav-groups.ts
// (P4.2 — deferred until this scaffold is in place).

import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";

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

  // Wrap in a minimal shell for now; P4 hardening will replace this with
  // the reused WorkspaceLayout + a dedicated `Reseller` nav group.
  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink-900">Reseller Console</h1>
          <p className="text-sm text-ink-600">
            Operational view of your attributed customers. Workspace content is never shown here.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
