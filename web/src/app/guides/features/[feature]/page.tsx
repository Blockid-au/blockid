import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { TourIcon, TourMedia } from "@/components/product-tour/tour-media";
import {
  featureTourSlugs,
  getFeatureTour,
} from "@/lib/product-tour/feature-tours";

const SITE_URL = "https://blockid.au";

interface RouteParams {
  feature: string;
}

export function generateStaticParams(): RouteParams[] {
  return featureTourSlugs().map((slug) => ({ feature: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { feature } = await params;
  const tour = getFeatureTour(feature);
  if (!tour) return {};
  const url = SITE_URL + "/guides/features/" + tour.slug;
  const title = tour.name.en + " — BlockID feature guide";
  return {
    title,
    description: tour.summary.en,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: tour.summary.en,
      type: "article",
      url,
      siteName: "BlockID",
      locale: "en_AU",
    },
  };
}

export default async function FeatureGuidePage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { feature } = await params;
  const tour = getFeatureTour(feature);
  if (!tour) notFound();

  return (
    <>
      <PageTracker page={"guides/features/" + tour.slug} />
      <Navbar />
      <main id="main" className="flex-1 pt-32 md:pt-40 pb-24">
        <div className="mx-auto max-w-4xl px-6">
          <nav aria-label="Breadcrumb" className="text-xs text-ink-500">
            <Link href="/guides/features" className="hover:text-ink-700">
              Feature guides
            </Link>
            <span className="mx-2" aria-hidden>
              /
            </span>
            <span className="text-ink-700">{tour.name.en}</span>
          </nav>

          <header className="mt-4 flex items-start gap-4">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand-50 text-brand-700 shrink-0">
              <TourIcon icon={tour.icon} className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gold-600 font-medium">
                Feature guide · {tour.steps.length} steps · ~{tour.estimatedMinutes} min
              </p>
              <h1 className="mt-2 text-3xl md:text-4xl font-semibold tracking-tight text-ink-800">
                {tour.name.en}
              </h1>
              <p className="mt-3 text-base leading-relaxed text-ink-600 max-w-2xl">
                {tour.summary.en}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={tour.route}
                  className="inline-flex items-center rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium text-white hover:bg-ink-700"
                >
                  Launch in-app
                </Link>
                <Link
                  href="/guides/features"
                  className="inline-flex items-center rounded-lg border border-surface-300 bg-white px-4 py-2 text-sm font-medium text-ink-800 hover:bg-surface-50"
                >
                  All feature guides
                </Link>
              </div>
            </div>
          </header>

          <ol className="mt-12 space-y-10">
            {tour.steps.map((step, i) => (
              <li
                key={step.id}
                id={step.id}
                className="rounded-2xl border border-surface-200 bg-white p-6 md:p-8"
              >
                <p className="text-[11px] uppercase tracking-wider text-ink-500">
                  Step {i + 1} of {tour.steps.length}
                </p>
                <h2 className="mt-2 text-xl md:text-2xl font-semibold text-ink-800">
                  {step.title.en}
                </h2>
                {step.media ? (
                  <div className="mt-4">
                    <TourMedia media={step.media} label={step.title.en} />
                  </div>
                ) : null}
                <p className="mt-4 text-sm md:text-base leading-relaxed text-ink-700">
                  {step.body.en}
                </p>
                {step.cta ? (
                  <div className="mt-4">
                    <Link
                      href={step.cta.href}
                      className="inline-flex items-center rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
                    >
                      {step.cta.label.en}
                    </Link>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>

          <p className="mt-12 text-xs text-ink-500 leading-relaxed">
            Prefer to learn in-product? Open the linked screen above — the same
            walkthrough surfaces as a bottom-anchored spotlight and remembers
            your progress across sessions.
          </p>
        </div>
      </main>
      <Footer />
    </>
  );
}
