import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import {
  getActiveExperiments,
  getCreditBurn30d,
  getCronHealth24h,
  getDeployHealth24h,
  getGrowth7d,
  getReleaseInfo,
  getSecurityPosture,
} from "@/lib/ops-metrics";
import { SandboxScopeChip } from "@/components/admin/sandbox-scope-chip";
// D3-CISO-05: sandbox scope chip is display-only on /admin/ops — deploy /
// cron / posture rollups are infrastructure-scoped, not tenant-scoped.
// no sandbox column on ops-metrics inputs — chip is display-only for future consistency
import { OpsDashboardClient } from "./ops-dashboard-client";

export const metadata: Metadata = {
  title: "Ops — BlockID Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminOpsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/ops");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const [
    release,
    deployHealth,
    creditBurn,
    cronHealth,
    experiments,
    growth,
    posture,
  ] = await Promise.all([
    getReleaseInfo(),
    getDeployHealth24h(),
    getCreditBurn30d(),
    getCronHealth24h(),
    getActiveExperiments(),
    getGrowth7d(),
    getSecurityPosture(),
  ]);

  return (
    <>
      <div className="mx-auto max-w-7xl px-6 pt-4">
        <SandboxScopeChip
          scope="all"
          note="Chip-only — ops metrics are infra-scoped, not tenant-scoped."
        />
      </div>
      <OpsDashboardClient
        user={{ email: user.email, displayName: user.displayName ?? null }}
        release={release}
        deployHealth={deployHealth}
        creditBurn={creditBurn}
        cronHealth={cronHealth}
        experiments={experiments}
        growth={growth}
        posture={posture}
      />
    </>
  );
}
