import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { RoadmapSteps } from "@/components/workspace/roadmap-steps";

export const dynamic = "force-dynamic";

export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/roadmap");
  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">Growth Roadmap</h1>
          <p className="text-sm text-slate-500 mt-1">Complete these steps to grow your SVI score and attract investors.</p>
        </div>
        <RoadmapSteps completedSteps={[1]} />
      </div>
    </WorkspaceLayout>
  );
}
