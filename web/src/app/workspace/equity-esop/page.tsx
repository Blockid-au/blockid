import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EquityEsopClient } from "./equity-esop-client";

export const metadata: Metadata = {
  title: "Equity & ESOP",
  description: "Plan equity, design ESOP, and manage vesting for your AU startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EquityEsopPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/equity-esop");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-6xl mx-auto">
        <EquityEsopClient />
      </div>
    </WorkspaceLayout>
  );
}
