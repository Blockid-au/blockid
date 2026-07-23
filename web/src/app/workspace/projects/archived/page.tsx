import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getUserArchivedProjects,
  getCurrentProjectIsSandbox,
} from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ArchivedProjectsClient } from "./archived-client";

export const metadata: Metadata = {
  title: "Archived Projects",
  description:
    "Restore archived startups before their retention window expires.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * /workspace/projects/archived — retention-aware listing surface.
 *
 * Renders only rows where `archived_at IS NOT NULL` (server-scoped by
 * `getUserArchivedProjects`) with a days-to-purge countdown and a Restore
 * CTA that hits the existing DELETE /api/projects/[id]/archive endpoint.
 *
 * Companion to the retention cron (iter-18 T1): the cron enforces the
 * 90-day purge window, this page surfaces it so founders can rescue a
 * workspace before it disappears.
 */
export default async function ArchivedProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/projects/archived");

  const [archivedProjects, isSandbox] = await Promise.all([
    getUserArchivedProjects(user.id),
    getCurrentProjectIsSandbox(),
  ]);

  // Serialise to plain shapes the client component can render.
  const rows = archivedProjects.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    industry: p.industry,
    archivedAt: p.archivedAt,
  }));

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <ArchivedProjectsClient rows={rows} />
    </WorkspaceLayout>
  );
}
