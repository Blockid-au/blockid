import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { WalletClient } from "./wallet-client";

export const metadata: Metadata = {
  title: "Wallet — BlockID.au",
  description: "Connect MetaMask to manage your BlockID equity tokens.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WalletPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/wallet");

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-5xl mx-auto">
        <WalletClient />
      </div>
    </WorkspaceLayout>
  );
}
