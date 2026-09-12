// /workspace/settings — Account settings (S24-B, 2026-09-12).
// Hosts the "Delete account" section the Privacy Policy's removal right
// (clause 8) points at; profile details, password and notification
// preferences stay on /workspace/profile.

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { GRACE_DAYS, getDeletionStatus } from "@/lib/privacy/deletion-request";
import { DeleteAccountSection, type DeletionStatusView } from "./delete-account-section";

export const metadata: Metadata = {
  title: "Account settings",
  description: "Manage your BlockID account, data and deletion.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/** Pure: shape the section's initial props from the status row (exported for the colocated test). */
export function toDeletionView(status: Awaited<ReturnType<typeof getDeletionStatus>>, isAdmin: boolean): DeletionStatusView {
  return {
    pending: status?.pending ?? false,
    requestedAt: status?.requestedAt ?? null,
    scheduledFor: status?.scheduledFor ?? null,
    hasPassword: status?.hasPassword ?? false,
    erased: status?.erased ?? false,
    graceDays: GRACE_DAYS,
    isAdmin,
  };
}

/** Pure: read the two query flags the emails deep-link with. */
export function readFlags(sp: Record<string, string | string[] | undefined>): { reauthToken: string | null; flag: string | null } {
  const t = sp.delete_token;
  const f = sp.deletion;
  return {
    reauthToken: typeof t === "string" && t.length >= 16 ? t : null,
    flag: f === "cancelled" || f === "invalid" ? f : null,
  };
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/settings");
  const sp = await searchParams;
  const { reauthToken, flag } = readFlags(sp);

  const isSandbox = await getCurrentProjectIsSandbox();
  const db = getSupabaseAdmin();
  const status = db ? await getDeletionStatus(db, user.id) : null;
  const view = toDeletionView(status, user.role === "admin");

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-bold text-ink-800">Account settings</h1>
          <p className="text-sm text-ink-700 mt-1">
            Profile, password and notifications live on <Link href="/workspace/profile" className="underline">My Profile</Link>. Export a copy of your data from the{" "}
            <Link href="/workspace/audit-log" className="underline">audit log</Link>. This page handles your account itself.
          </p>
        </div>

        <section className="bg-white border border-surface-200 shadow-sm rounded-2xl p-6">
          <h2 className="text-base font-semibold text-ink-800 mb-1">Your data</h2>
          <p className="text-xs text-ink-600">
            You own your data; BlockID stores it only to process it for you and to give the AI the best context for your case. Retention periods are in the{" "}
            <Link href="/legal/privacy" className="underline">Privacy Policy</Link> (clause 4). Access and correction requests: <a href="mailto:privacy@blockid.au" className="underline">privacy@blockid.au</a>.
          </p>
        </section>

        <DeleteAccountSection initial={view} reauthToken={reauthToken} flag={flag} />
      </div>
    </WorkspaceLayout>
  );
}
