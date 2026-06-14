import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { AdminTokensClient } from "./tokens-client";

export const metadata: Metadata = {
  title: "Token Management — Admin — BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminTokensPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/tokens");

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/admin");

  return (
    <AdminTokensClient
      user={{
        email: user.email,
        displayName: user.displayName ?? null,
      }}
    />
  );
}
