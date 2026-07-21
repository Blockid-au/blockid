// /admin/reseller-loop — Live dashboard for the autonomous reseller goal
// loop. Reads /api/admin/reseller-loop/status every 15 seconds and renders:
//   • current snapshot (verbatim from the show-next-tick.sh output)
//   • timeline of the last N ticks (start/end + phase + deploy result)
//   • completion state (once the loop has auto-stopped)
//
// Admin-gated. Non-admin users get redirected by the layout at
// web/src/app/admin/layout.tsx.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import ResellerLoopLiveClient from "./client";

export const dynamic = "force-dynamic";

export default async function ResellerLoopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/reseller-loop");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink-900">
            Autonomous Reseller Loop — Live
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Refreshes every 15 s. Reads <code className="rounded bg-surface-100 px-1">/tmp/blockid-reseller-monitor.txt</code>
            + <code className="rounded bg-surface-100 px-1">reseller-monitor.jsonl</code>
            + <code className="rounded bg-surface-100 px-1">reseller-goal-history.jsonl</code>.
          </p>
        </header>
        <ResellerLoopLiveClient />
      </div>
    </div>
  );
}
