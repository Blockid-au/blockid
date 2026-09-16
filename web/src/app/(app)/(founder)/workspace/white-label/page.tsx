// /workspace/settings/enterprise — White-label branding.
// S31-B (2026-09-13): honest "not available yet" surface. The previous page
// promised "Coming Soon — Estimated: Q4 2026 — Scale & Enterprise" (Scale was retired 2026-09-08) and offered an
// upgrade button under a feature that does not exist. Custom domains and attribution removal are deferred; the logo/colour branding that does exist lives at /workspace/settings/enterprise.
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { getCurrentProjectIsSandbox } from "@/lib/projects";
import { NotAvailableYet } from "@/components/workspace/not-available-yet";
import { Palette } from "lucide-react";

export const metadata: Metadata = {
  title: "White-label | Workspace | BlockID",
  description: "A custom domain and removal of BlockID attribution are not available yet. Logo and colour branding is on Growth.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function WhiteLabelPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/settings/enterprise");

  const isSandbox = await getCurrentProjectIsSandbox();

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <NotAvailableYet
        feature="white_label"
        title="White-label"
        icon={Palette}
        userEmail={user.email}
        reason="Serving your workspace and reports from your own domain, with BlockID attribution removed, is not built yet and is not on any plan. What exists today: your logo, colours and cover on every exported report and investor share page (Custom Branding, Growth plan and above)."
        alternatives={[
          { href: "/workspace/settings/enterprise", label: "Custom Branding — logo and colours on exports" },
          { href: "/pricing?feature=pdf_branding", label: "See which plan includes Custom Branding" },
        ]}
      />
    </WorkspaceLayout>
  );
}
