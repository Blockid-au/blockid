import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ADMIN_EMAIL, getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WalletClient } from "./wallet-client";
import { EquityDashboardClient } from "./equity-dashboard-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Wallet — BlockID.au",
  description: "Connect MetaMask to manage your BlockID equity tokens.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/equity/on-chain");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-5xl mx-auto">
        <WalletClient />
      </div>

      {/* S-IA2 — ex /workspace/equity-dashboard: ownership, token info,
          quick actions and on-chain activity for the synced share token. */}
      <section
        aria-labelledby="blockchain-sync-heading"
        className="p-6 max-w-6xl mx-auto border-t border-line-subtle"
      >
        <h2
          id="blockchain-sync-heading"
          className="text-sm font-semibold uppercase tracking-wider text-muted mb-4"
        >
          Blockchain sync
        </h2>
        <EquityDashboardClient
          isAdmin={user.email === ADMIN_EMAIL || user.role === "admin"}
        />
      </section>
    </WorkspaceLayout>
  );
}
