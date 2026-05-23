import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { ProfileProgress } from "@/components/workspace/profile-progress";
import { BadgeShelf } from "@/components/workspace/badge-shelf";
import { PasswordForm } from "@/components/workspace/password-form";

export const metadata: Metadata = {
  title: "My Profile",
  description: "Manage your BlockID account and startup details.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/profile");

  // Check if user has an existing password
  let hasPassword = false;
  const supabase = getSupabaseAdmin();
  if (supabase) {
    const { data } = await supabase
      .from("app_users")
      .select("password_hash")
      .eq("id", user.id)
      .single();
    hasPassword = Boolean(data?.password_hash);
  }

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">My Profile</h1>
          <p className="text-sm text-ink-700 mt-1">Manage your account and startup details.</p>
        </div>
        <div className="bg-white border border-surface-200 shadow-sm rounded-2xl p-6 space-y-4">
          <div className="flex items-center gap-4">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-14 w-14 rounded-full" />
            ) : (
              <div className="h-14 w-14 rounded-full bg-brand-700 flex items-center justify-center text-xl font-bold text-white">
                {(user.displayName ?? user.email)[0].toUpperCase()}
              </div>
            )}
            <div>
              <p className="text-ink-800 font-semibold text-base">{user.displayName ?? "—"}</p>
              <p className="text-ink-600 text-sm">{user.email}</p>
              <span className="inline-block mt-1 text-[10px] uppercase tracking-wider font-medium text-brand-600 bg-brand-50 px-2 py-0.5 rounded-full border border-brand-200">
                {user.role}
              </span>
            </div>
          </div>
          <div className="border-t border-surface-200 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-ink-700">Plan</span>
              <span className="text-ink-800 font-medium">{user.plan ?? "Free"}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-ink-700">Member since</span>
              <span className="text-ink-800">{new Date(user.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}</span>
            </div>
          </div>
        </div>
        <div className="mt-6">
          <PasswordForm hasExistingPassword={hasPassword} />
        </div>
        <div className="mt-6">
          <BadgeShelf email={user.email} />
        </div>
        <ProfileProgress email={user.email} />
      </div>
    </WorkspaceLayout>
  );
}
