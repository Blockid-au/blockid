// /admin/uptime-guardian — Live view of the 24/7 uptime guardian.
// Refreshes every 30s. Admin-gated.

import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/reseller/require-admin";
import UptimeGuardianClient from "./client";

export const dynamic = "force-dynamic";

export default async function UptimeGuardianPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/uptime-guardian");
  if (!isAdmin(user)) redirect("/dashboard/svi");

  return (
    <div className="min-h-screen bg-surface-50">
      <div className="mx-auto max-w-6xl p-6">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold text-ink-900">
            24/7 Uptime Guardian — Live
          </h1>
          <p className="mt-1 text-sm text-ink-600">
            Refreshes every 30 s from{" "}
            <code className="rounded bg-surface-100 px-1">
              web/content/reports/uptime-guardian.jsonl
            </code>{" "}
            (produced by{" "}
            <code className="rounded bg-surface-100 px-1">
              scripts/cron/uptime-24x7-guardian.sh
            </code>{" "}
            every 2 min).
          </p>
        </header>
        <UptimeGuardianClient />
      </div>
    </div>
  );
}
