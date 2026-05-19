import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/profile");
  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-50">My Profile</h1>
          <p className="text-sm text-slate-500 mt-1">Manage your account and startup details.</p>
        </div>
        <div className="rounded-2xl border border-ink-700 bg-ink-900 p-6 space-y-4">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-brand-700 flex items-center justify-center text-xl font-bold text-white">
                {(user.displayName ?? user.email)[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-slate-50 font-semibold text-base">{user.displayName ?? "—"}</p>
              <p className="text-slate-400 text-sm">{user.email}</p>
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-medium text-brand-400 bg-brand-900/40 px-2 py-0.5 rounded-full border border-brand-700/40">
                {user.role}
              </span>
            </div>
          </div>
          <div className="border-t border-ink-700 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Plan</span>
              <span className="text-slate-200 font-medium">{user.plan ?? "Free"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Member since</span>
              <span className="text-slate-200">{new Date(user.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          </div>
        </div>
      </div>
    </WorkspaceLayout>
  );
}
