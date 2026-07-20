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
  );
}
