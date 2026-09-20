import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function WorkspacePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace");
  // Fallback only — the `(founder)` layout already sent /workspace to
  // /dashboard as a real 307 (G20-sweep: thrown here it would land after
  // workspace/loading.tsx streamed and become a CSP-blocked meta refresh).
  redirect("/dashboard");
}
