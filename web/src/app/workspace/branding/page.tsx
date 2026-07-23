import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { can } from "@/lib/entitlements";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { BrandingClient } from "./branding-client";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

export const metadata: Metadata = {
  title: "Custom Branding | BlockID",
  description: "Customise reports with your logo and brand colours.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function BrandingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/branding");

  const isSandbox = await getCurrentProjectIsSandbox();

  const isPro =
    user.role === "admin" ||
    (await can(
      { id: user.id, plan: user.plan ?? "free", segment: "founder" },
      "white_label",
    ));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">Custom Branding</h1>
          <p className="text-sm text-ink-600 mt-1">
            Apply your logo and brand colours to SVI reports and investor
            share pages.
          </p>
        </div>
        <BrandingClient isPro={isPro} />
      </div>
    </WorkspaceLayout>
  );
}
