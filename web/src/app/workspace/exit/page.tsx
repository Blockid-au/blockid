import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ExitClient } from "./exit-client";

export const metadata: Metadata = {
  title: "Exit Modeling | BlockID",
  description: "Model acquisition, IPO, and buyout scenarios for your startup.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ExitPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/exit");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Exit Modeling</h1>
          <p className="text-sm text-ink-700 mt-1">
            Model exit scenarios and see per-shareholder payouts with CGT estimates.
          </p>
        </div>
        <ExitClient />
      </div>
    </WorkspaceLayout>
  );
}
