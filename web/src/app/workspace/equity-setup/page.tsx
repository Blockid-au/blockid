import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject } from "@/lib/projects";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { EquityWizard } from "./wizard-client";

export const metadata: Metadata = {
  title: "Equity Setup Wizard | BlockID",
  description:
    "Set up your startup equity structure — founders, vesting, ESOP, and share classes in minutes.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EquitySetupPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/equity-setup");

  // Check if the user already has a cap table with shareholders
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data: shareholders } = await supabase
      .from("shareholders")
      .select("id")
      .eq("account_id", user.id)
      .limit(1);

    if (shareholders && shareholders.length > 0) {
      // User already has a cap table — redirect them there
      redirect("/workspace/cap-table");
    }
  }

  // Read the active project from the cookie
  const store = await cookies();
  const projectSlug = store.get("blockid_project")?.value ?? undefined;
  const project = await getActiveProject(user.id, projectSlug);

  if (!project) {
    return (
      <WorkspaceLayout user={user}>
        <div className="p-6 max-w-3xl mx-auto">
          <div className="rounded-2xl border border-dashed border-surface-200 bg-white px-6 py-16 text-center">
            <p className="text-ink-600 font-medium">No project found.</p>
            <p className="text-ink-700 text-sm mt-1">
              Create a startup project first to set up your equity structure.
            </p>
            <a
              href="/workspace/projects?new=1"
              className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-brand-600 px-5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors"
            >
              Create Project
            </a>
          </div>
        </div>
      </WorkspaceLayout>
    );
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <EquityWizard
          email={user.email}
          userName={user.displayName ?? ""}
          projectId={project.id}
          projectName={project.name}
        />
      </div>
    </WorkspaceLayout>
  );
}
