// /admin/tokens — HIDDEN (G20-F1, 2026-09-20; admin-only). Key: admin_tokens.
//
// The token console (tokens-client.tsx, in history) read a
// hard-coded local-chain factory address (the deterministic Anvil first
// deploy) and its create-company form said "coming soon". The private EVM
// explorer and the CLI are the working surface; the founder-facing on-chain
// page is /workspace/equity/on-chain.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Coins } from "lucide-react";
import { getCurrentUser, ADMIN_EMAIL } from "@/lib/auth";
import { NotOfferedCard } from "@/components/workspace/not-offered-card";
import { assertHidden, hiddenPageMetadata } from "@/components/workspace/hidden-feature-page";

export const metadata: Metadata = hiddenPageMetadata("Token management");
export const dynamic = "force-dynamic";

export default async function AdminTokensPage() {
  assertHidden("admin_tokens", "/admin/tokens");
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/tokens");
  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  return (
    <main className="min-h-screen bg-surface px-4 py-12">
      <NotOfferedCard
        feature="admin_tokens"
        title="Token management"
        icon={Coins}
        reason="The in-app token console is not offered: its factory address is a local-chain placeholder and company creation was never wired. Mint and inspect tokens through the explorer and the CLI."
        alternatives={[
          { href: "/workspace/equity/on-chain", label: "On-chain equity (founder view)" },
          { href: "/admin", label: "Admin panel" },
        ]}
        backHref="/admin"
        backLabel="Back to Admin"
      />
    </main>
  );
}
