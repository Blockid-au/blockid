import { getPreferencesByToken } from "@/lib/email-preferences";
import { UnsubscribeClient } from "./unsubscribe-client";

export const dynamic = "force-dynamic";

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  const masked =
    local.length <= 2
      ? local[0] + "***"
      : local[0] + "***" + local[local.length - 1];
  return `${masked}@${domain}`;
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const token = typeof params.token === "string" ? params.token : null;
  const category = typeof params.category === "string" ? params.category : null;
  const done = params.done === "1";

  if (!token) {
    return (
      <div className="min-h-svh bg-[#0B1220] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#0F172A] border border-[#1F2A44] rounded-2xl p-8 text-center">
          <h1 className="text-xl font-semibold text-[#F8FAFC] mb-3">
            Invalid Link
          </h1>
          <p className="text-[#94A3B8] text-sm">
            This unsubscribe link is invalid or has expired. If you need to
            manage your email preferences, sign in to your account.
          </p>
        </div>
      </div>
    );
  }

  const prefs = await getPreferencesByToken(token);

  if (!prefs) {
    return (
      <div className="min-h-svh bg-[#0B1220] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-[#0F172A] border border-[#1F2A44] rounded-2xl p-8 text-center">
          <h1 className="text-xl font-semibold text-[#F8FAFC] mb-3">
            Token Not Found
          </h1>
          <p className="text-[#94A3B8] text-sm">
            We could not find preferences for this token. It may have been
            removed. Please sign in to manage your email preferences.
          </p>
        </div>
      </div>
    );
  }

  return (
    <UnsubscribeClient
      token={token}
      maskedEmail={maskEmail(prefs.email)}
      initialPrefs={{
        weekly_reports: prefs.weekly_reports,
        product_updates: prefs.product_updates,
        promotions: prefs.promotions,
        svi_alerts: prefs.svi_alerts,
        payment_receipts: prefs.payment_receipts,
        unsubscribed_all: prefs.unsubscribed_all,
      }}
      category={category}
      done={done}
    />
  );
}
