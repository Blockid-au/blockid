import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import {
  getEmailPreferences,
  ensureEmailPreferences,
} from "@/lib/email-preferences";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { NotificationsClient } from "./notifications-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/workspace/notifications");

  // Ensure preferences exist
  const token = await ensureEmailPreferences(user.email, user.id);
  const prefs = await getEmailPreferences(user.email);

  return (
    <WorkspaceLayout user={user}>
      <div className="p-6 max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-ink-800">
            Notification Preferences
          </h1>
          <p className="text-sm text-ink-700 mt-1">
            Choose which emails you would like to receive from BlockID.
          </p>
        </div>

        <NotificationsClient
          token={token}
          initialPrefs={
            prefs
              ? {
                  weekly_reports: prefs.weekly_reports,
                  product_updates: prefs.product_updates,
                  promotions: prefs.promotions,
                  svi_alerts: prefs.svi_alerts,
                  payment_receipts: prefs.payment_receipts,
                  unsubscribed_all: prefs.unsubscribed_all,
                }
              : {
                  weekly_reports: true,
                  product_updates: true,
                  promotions: true,
                  svi_alerts: true,
                  payment_receipts: true,
                  unsubscribed_all: false,
                }
          }
        />
      </div>
    </WorkspaceLayout>
  );
}
