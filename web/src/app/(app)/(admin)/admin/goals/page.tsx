import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { GoalsClient } from "./goals-client";

export const metadata: Metadata = {
  title: "CEO Goals — BlockID.au",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/admin/goals");

  const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
  if (!isAdmin) redirect("/dashboard");

  return <GoalsClient />;
}
