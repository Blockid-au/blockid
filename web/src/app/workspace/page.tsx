import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace");
  // Redirect authenticated users to dashboard
  redirect("/dashboard");
}
