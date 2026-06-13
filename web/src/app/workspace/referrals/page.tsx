import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ReferralsClient } from "./referrals-client";

export const metadata: Metadata = {
  title: "Referral Program | BlockID",
  description: "Invite founders and earn credits.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ReferralsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/referrals");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Referral Program</h1>
          <p className="text-sm text-ink-600 mt-1">
            Invite fellow founders and earn credits every time they sign up.
          </p>
        </div>
        <ReferralsClient />
      </div>
    </WorkspaceLayout>
  );
}
