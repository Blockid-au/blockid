import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { listGrants, listPrograms } from "@/lib/funding/data";
import { FundingReviewClient } from "./funding-review-client";

export const metadata: Metadata = {
  title: "AU Funding Review — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

// /admin/funding — review queue for au_grants + au_programs (migration 0311).
// Reads from the tables (never the seed JSON — the nightly `git reset --hard`
// would discard fs edits, and the refresh cron writes to Postgres). Edits go
// through PATCH /api/admin/funding/[kind]/[id]. T0239 / G11 sprint S2.
export default async function AdminFundingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/funding");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const [grants, programs] = await Promise.all([
    listGrants({ excludeNonMatching: false, limit: 1000 }),
    listPrograms({ limit: 1000 }),
  ]);

  return (
    <FundingReviewClient
      user={{ email: user.email, displayName: user.displayName ?? null }}
      grants={grants}
      programs={programs}
    />
  );
}
