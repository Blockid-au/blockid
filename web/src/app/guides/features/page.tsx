import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { TourIcon } from "@/components/product-tour/tour-media";
import { listFeatureTours } from "@/lib/product-tour/feature-tours";

const TITLE = "Feature guides — BlockID product tour";
const DESCRIPTION =
  "Step-by-step guides for every core BlockID feature — onboarding, SVI scoring, data room, reseller portal, dashboard navigation and exit readiness.";
const URL = "https://blockid.au/guides/features";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    type: "website",
    url: URL,
    siteName: "BlockID",
    locale: "en_AU",
  },
};

export default function FeatureGuidesIndexPage() {
  const tours = listFeatureTours();
  return (
    <>
      <PageTracker page="guides/features" />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-6xl px-6">
          <header className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
              Product tour · Feature guides
            </p>
            <h1 className="mt-3 text-4xl md:text-5xl font-semibold tracking-tight text-ink-800">
              Learn every BlockID feature in under 5 minutes each
            </h1>
            <p className="mt-4 text-base md:text-lg leading-relaxed text-ink-600">
              Each feature has an in-product spotlight and a mirrored, deep-linkable
              guide page here. Read at your own pace, or launch the spotlight from
              the matching workspace screen.
            </p>
          </header>

          <section className="mt-12 grid gap-4 md:grid-cols-2">
            {tours.map((t) => (
              <Link
                key={t.slug}
                href={"/guides/features/" + t.slug}
                className="group rounded-2xl border border-surface-200 bg-white p-6 hover:border-brand-300 hover:shadow-md transition"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-50 text-brand-700">
                    <TourIcon icon={t.icon} className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold text-ink-800 group-hover:text-brand-700">
                      {t.name.en}
                    </h2>
                    <p className="mt-1 text-sm text-ink-600 leading-relaxed">
                      {t.summary.en}
                    </p>
                    <p className="mt-3 text-xs uppercase tracking-wider text-ink-500">
                      {t.steps.length} steps · ~{t.estimatedMinutes} min
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
