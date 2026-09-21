// /admin/pilots — the read-only ledger of past comped evaluator pilots
// (G16-C; retired by G25 on 2026-09-21 — no new pilots are offered). Admin
// only (same inline guard as /admin/credits). Reads the ledger + counts
// through lib/pilots/service and the last 20 applications the retired
// public form collected; the client component only does end-early calls.

import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { readApplications } from "@/lib/pilots/applications";
import { resolvePilotsRoot } from "@/lib/pilots/ledger";
import { PILOT_TIER, programListPrice } from "@/lib/pilots/offer";
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
      defaults={{ programPrice: programListPrice(), tier: PILOT_TIER }}
    />
  );
}
