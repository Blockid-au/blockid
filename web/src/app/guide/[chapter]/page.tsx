/**
 * /guide/[chapter] — Track B B2 + B3 + B4 marketing surface for the 12-chapter
 * startup journey guide (chapters 1–4 shipped in B2, 5–8 in B3, 9–12 in B4).
 *
 * Server component. Reads the chapter body from the pure content lib at
 * web/src/lib/guide/startup-journey.ts and renders EN or VI copy based on the
 * blockid_lang cookie. generateStaticParams keeps this on the static-first
 * path; force-dynamic is intentionally NOT set so Next can cache the render.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ChapterProgressRibbon } from "@/components/guide/chapter-progress-ribbon";
import { AbsLookupPanel } from "@/components/guide/abs-lookup-panel";
import {
  allChapterSlugs,
  getAdjacentChapters,
  getChapter,
  type Chapter,
  type ChapterSlug,
} from "@/lib/guide/startup-journey";
import { getLocale, type Locale } from "@/lib/i18n";

const SITE_URL = "https://blockid.au";

interface RouteParams {
  chapter: string;
}

export function generateStaticParams(): RouteParams[] {
  return allChapterSlugs().map((slug) => ({ chapter: slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { chapter } = await params;
  const c = getChapter(chapter);
  if (!c) return {};
  const url = `${SITE_URL}/guide/${c.slug}`;
  const title = `${c.title.en} — BlockID Startup Journey`;
  const description = c.summary.en;
  return {
    title,
    description,
    keywords: [
      "startup journey guide",
      "founder playbook",
      c.phaseLabel.en.toLowerCase(),
      "blockid guide",
    ],
    openGraph: {
      title,
      description,
      type: "article",
      url,
      siteName: "BlockID",
      locale: "en_AU",
    },
    twitter: { card: "summary_large_image", title, description },
    alternates: { canonical: url },
    robots: { index: true, follow: true },
  };
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-slate-700 dark:text-slate-300">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function ChapterBody({ c, locale }: { c: Chapter; locale: Locale }) {
  const t = (v: { en: string; vi: string }) => (locale === "vi" ? v.vi : v.en);
  const list = (v: { en: string[]; vi: string[] }) =>
    locale === "vi" ? v.vi : v.en;
  return (
    <>
      <p className="text-lg text-slate-700 dark:text-slate-300">{t(c.summary)}</p>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {locale === "vi" ? "Founder làm gì" : "What the founder does"}
        </h2>
        <p className="mt-3 text-sm text-slate-700 dark:text-slate-300">
          {t(c.founderAction)}
        </p>
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {locale === "vi" ? "Agents được kích hoạt" : "Agents invoked"}
        </h2>
        <Bullets items={list(c.agentsInvoked)} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {locale === "vi"
            ? "Đầu ra kỳ vọng & cách đọc"
            : "Expected outputs & how to interpret"}
        </h2>
        <Bullets items={list(c.expectedOutputs)} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
          {locale === "vi" ? "Bẫy thường gặp" : "Common pitfalls"}
        </h2>
        <Bullets items={list(c.commonPitfalls)} />
      </section>

      {c.sections?.map((s) => (
        <section key={s.id} className="mt-10">
          <h2 className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            {t(s.heading)}
          </h2>
          <Bullets items={list(s.body)} />
        </section>
      ))}

      {c.slug === "03-market-research" ? (
        <AbsLookupPanel locale={locale} variant="marketing" />
      ) : null}

      {c.qualifyingTests ? (
        <section className="mt-10 rounded-lg border border-amber-200 bg-amber-50 p-6 dark:border-amber-900/40 dark:bg-amber-950/20">
          <h2 className="text-xl font-semibold text-amber-900 dark:text-amber-200">
            {locale === "vi"
              ? "Checklist điều kiện Div 83A"
              : "Div 83A qualifying-tests checklist"}
          </h2>
          <p className="mt-2 text-xs text-amber-800 dark:text-amber-300">
            {locale === "vi"
              ? "Thông tin chung. Không phải tư vấn pháp lý hay thuế. Xác nhận đủ điều kiện với đại lý thuế đã đăng ký."
              : "General information only. Not legal or tax advice. Confirm eligibility with a registered tax agent."}
          </p>
          <Bullets items={list(c.qualifyingTests)} />
        </section>
      ) : null}

      <section className="mt-10 rounded-lg border border-emerald-200 bg-emerald-50 p-6 dark:border-emerald-900/40 dark:bg-emerald-950/30">
        <h2 className="text-base font-semibold text-emerald-900 dark:text-emerald-200">
          {locale === "vi"
            ? "Trên workspace showcase của BlockID.au"
            : "On BlockID.au's showcase workspace"}
        </h2>
        <p className="mt-2 text-sm text-emerald-800 dark:text-emerald-300">
          {t(c.showcaseExample)}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href="/showcase/blockid"
            className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300"
          >
            {locale === "vi" ? "Xem showcase" : "View the showcase"}
          </Link>
          <Link
            href="/guide/reports"
            className="rounded-md border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100 dark:text-emerald-300"
          >
            {locale === "vi" ? "Thư viện báo cáo" : "Browse the report library"}
          </Link>
        </div>
      </section>

      <section className="mt-10 rounded-lg border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {locale === "vi" ? "Bước tiếp theo" : "Next step"}
        </p>
        <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">{t(c.cta)}</p>
      </section>
    </>
  );
}

function ChapterNav({
  slug,
  locale,
}: {
  slug: ChapterSlug;
  locale: Locale;
}) {
  const { previous, next } = getAdjacentChapters(slug);
  const t = (v: { en: string; vi: string }) => (locale === "vi" ? v.vi : v.en);
  return (
    <nav className="mt-12 grid gap-4 border-t border-slate-200 pt-8 md:grid-cols-2 dark:border-slate-800">
      {previous ? (
        <Link
          href={`/guide/${previous.slug}`}
          className="rounded-lg border border-slate-200 p-4 text-left transition hover:border-emerald-400 dark:border-slate-800"
        >
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {locale === "vi" ? "Chương trước" : "Previous"}
          </span>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t(previous.title)}
          </p>
        </Link>
      ) : (
        <div />
      )}
      {next ? (
        <Link
          href={`/guide/${next.slug}`}
          className="rounded-lg border border-slate-200 p-4 text-right transition hover:border-emerald-400 dark:border-slate-800"
        >
          <span className="text-xs uppercase tracking-wide text-slate-400">
            {locale === "vi" ? "Chương sau" : "Next"}
          </span>
          <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t(next.title)}
          </p>
        </Link>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-right text-sm text-slate-500 dark:border-slate-700">
          {locale === "vi"
            ? "Bạn đã đến chương cuối. Sau thoái vốn, mở workspace mới ở Chương 1 hoặc chuyển sang vai đại lý."
            : "You've reached the final chapter. After exit, open a new workspace at Chapter 1 or move into the reseller/accelerator role."}
        </div>
      )}
    </nav>
  );
}

export default async function GuideChapterPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { chapter } = await params;
  const c = getChapter(chapter);
  if (!c) notFound();
  const locale = await getLocale();
  const t = (v: { en: string; vi: string }) => (locale === "vi" ? v.vi : v.en);
  return (
    <>
      <PageTracker page="guide-chapter" chapter={c.phase} locale={locale} />
      <Navbar />
      <main className="mx-auto max-w-3xl px-4 py-12 md:py-16">
        <ChapterProgressRibbon phase={c.phase} locale={locale} variant="marketing" />
        <header className="mb-10">
          <p className="text-sm font-medium uppercase tracking-wide text-emerald-600">
            {locale === "vi"
              ? `Phase ${c.phase} · ${c.phaseLabel.vi}`
              : `Phase ${c.phase} · ${c.phaseLabel.en}`}
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900 md:text-4xl dark:text-slate-100">
            {t(c.title)}
          </h1>
        </header>
        <ChapterBody c={c} locale={locale} />
        <ChapterNav slug={c.slug} locale={locale} />
      </main>
      <Footer />
    </>
  );
}
