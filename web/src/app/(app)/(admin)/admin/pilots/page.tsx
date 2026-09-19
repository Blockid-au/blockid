// /admin/pilots — evaluator pilot enablement (G16-C). Admin only (same
// inline guard as /admin/credits). Reads the ledger + counts through
// lib/pilots/service and the last 20 /pilot applications from the jsonl;
// the client component does the start / end-early calls.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { readApplications } from "@/lib/pilots/applications";
import { resolvePilotsRoot } from "@/lib/pilots/ledger";
import { DEFAULT_PILOT_DAYS, PILOT_MAX_APPLICANTS, PILOT_TIER, defaultPilotCredits, programListPrice } from "@/lib/pilots/offer";
import { listPilots } from "@/lib/pilots/service";
import { PilotsClient } from "./pilots-client";

export const metadata: Metadata = {
  title: "Pilots — Admin",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPilotsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/pilots");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  const [initial, applications] = await Promise.all([listPilots(), resolvePilotsRoot().then((root) => readApplications(root, 20))]);

  return (
    <PilotsClient
      user={{ email: user.email, displayName: user.displayName ?? null }}
      initial={initial}
      applications={applications}
      defaults={{ days: DEFAULT_PILOT_DAYS, credits: defaultPilotCredits(), maxApplicants: PILOT_MAX_APPLICANTS, programPrice: programListPrice(), tier: PILOT_TIER }}
    />
  );
}
