import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { requireTierForPage } from "@/lib/entitlements/require-tier-for-page";
import { CleanRoomClient } from "./clean-room-client";

export const metadata: Metadata = {
  title: "Clean-Room Preparation | BlockID",
  description: "Prepare a clean room for M&A or strategic due diligence where the buyer is a competitor — clean team, document classification, redaction, access tiers, NDA, logging and destruction, backed by your data room.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function CleanRoomPage() {
  // Same floor as the sidebar row (Growth+, Exit subgroup) and as the data
  // room's trust settings, which the computed rows read.
  await requireTierForPage({ minTier: "growth", fromPath: "/workspace/clean-room" });

  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/clean-room");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-brand-600 font-semibold">Exit · strategic sale</p>
          <h1 className="mt-1 text-xl font-bold text-ink-800">Clean-room preparation</h1>
          <p className="text-sm text-ink-700 mt-1 max-w-2xl">
            When the buyer competes with you, diligence runs through a clean room: a named clean team, an anonymised first pass, per-recipient access, an NDA plus a clean-team agreement, a log, and certified destruction at the end. This guide walks the seven stages and reads your{" "}
            <Link href="/workspace/data-room" className="text-brand-600 underline">
              data room
            </Link>{" "}
            for the controls it can prove. See also{" "}
            <Link href="/workspace/exit" className="text-brand-600 underline">
              Exit Modelling
            </Link>{" "}
            and{" "}
            <Link href="/workspace/listing-readiness" className="text-brand-600 underline">
              Listing readiness
            </Link>
            .
          </p>
        </div>
        <CleanRoomClient />
      </div>
    </WorkspaceLayout>
  );
}
