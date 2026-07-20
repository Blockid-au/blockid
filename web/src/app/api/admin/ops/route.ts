import { NextResponse } from "next/server";
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

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/admin/ops — JSON mirror of the /admin/ops dashboard.
// Same admin gate as the page — cookie-based; no Bearer token accepted here
// because this shares the /admin auth surface. External monitors curl it via
// the admin session cookie.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    release,
    deployHealth,
    creditBurn,
    cronHealth,
    experiments,
    growth,
    posture,
  });
}
