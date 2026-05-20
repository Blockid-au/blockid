import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
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
      <>
        <Navbar />
        <main className="min-h-svh bg-surface-100 flex items-center justify-center px-4 pt-28 pb-16">
          <div className="max-w-md w-full bg-white border border-surface-200 rounded-2xl p-8 text-center shadow-sm">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900 mb-3">
              Invalid Link
            </h1>
            <p className="text-ink-600 text-sm">
              This unsubscribe link is invalid or has expired. If you need to
              manage your email preferences, sign in to your account.
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  const prefs = await getPreferencesByToken(token);

  if (!prefs) {
    return (
      <>
        <Navbar />
        <main className="min-h-svh bg-surface-100 flex items-center justify-center px-4 pt-28 pb-16">
          <div className="max-w-md w-full bg-white border border-surface-200 rounded-2xl p-8 text-center shadow-sm">
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-ink-900 mb-3">
              Token Not Found
            </h1>
            <p className="text-ink-600 text-sm">
              We could not find preferences for this token. It may have been
              removed. Please sign in to manage your email preferences.
            </p>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <>
    <Navbar />
    <main className="min-h-svh bg-surface-100 pt-28 pb-16">
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
    </main>
    <Footer />
    </>
  );
}
