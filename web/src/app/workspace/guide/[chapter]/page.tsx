/**
 * /workspace/guide/[chapter] — Track B B2 + B3 + B4 in-app surface for the
 * 12-chapter startup journey guide (1–4 B2, 5–8 B3, 9–12 B4).
 *
 * Server component. Auth-gated: unauthenticated visitors are redirected to
 * /auth/login?next=/workspace/guide/<slug>. Rendered inside WorkspaceLayout
 * so the sidebar and header stay consistent with the rest of /workspace.
 *
 * Content comes from the same pure lib the marketing surface reads
 * (web/src/lib/guide/startup-journey.ts), so copy stays synchronised across
 * both surfaces.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import { PageTracker } from "@/components/analytics/page-tracker";
import { ChapterProgressRibbon } from "@/components/guide/chapter-progress-ribbon";
import { AbsLookupPanel } from "@/components/guide/abs-lookup-panel";
import { LandingPagePreviewPanel } from "@/components/guide/landing-page-preview-panel";
import { Ga4PlanPanel } from "@/components/guide/ga4-plan-panel";
import {
  allChapterSlugs,
  getAdjacentChapters,
  getChapter,
  type Chapter,
} from "@/lib/guide/startup-journey";
import { getLocale, type Locale } from "@/lib/i18n";
import { getCurrentProjectIsSandbox } from "@/lib/projects";

interface RouteParams {
  chapter: string;
}

export function generateStaticParams(): RouteParams[] {
  return allChapterSlugs().map((slug) => ({ chapter: slug }));
}

export const metadata: Metadata = {
  title: "Startup Journey Guide",
  description: "Step-by-step guide through the 12-phase founder journey inside BlockID.",
  robots: { index: false, follow: false },
};

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-700">
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
    <div className="space-y-8">
      <p className="text-base text-ink-700">{t(c.summary)}</p>

      <section>
        <h2 className="text-lg font-semibold text-ink-800">
          {locale === "vi" ? "Founder làm gì" : "What the founder does"}
        </h2>
        <p className="mt-2 text-sm text-ink-700">{t(c.founderAction)}</p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-800">
          {locale === "vi" ? "Agents được kích hoạt" : "Agents invoked"}
        </h2>
        <Bullets items={list(c.agentsInvoked)} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-800">
          {locale === "vi"
            ? "Đầu ra kỳ vọng & cách đọc"
            : "Expected outputs & how to interpret"}
        </h2>
        <Bullets items={list(c.expectedOutputs)} />
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink-800">
          {locale === "vi" ? "Bẫy thường gặp" : "Common pitfalls"}
        </h2>
        <Bullets items={list(c.commonPitfalls)} />
      </section>

      {c.sections?.map((s) => (
        <section key={s.id}>
          <h2 className="text-lg font-semibold text-ink-800">{t(s.heading)}</h2>
          <Bullets items={list(s.body)} />
        </section>
      ))}

      {c.slug === "03-market-research" ? (
        <AbsLookupPanel locale={locale} variant="workspace" />
      ) : null}

      {c.slug === "04-mvp" ? (
        <LandingPagePreviewPanel locale={locale} variant="workspace" />
      ) : null}

      {c.slug === "07-growth" ? (
        <Ga4PlanPanel locale={locale} variant="workspace" />
      ) : null}

      {c.qualifyingTests ? (
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">
            {locale === "vi"
              ? "Checklist điều kiện Div 83A"
              : "Div 83A qualifying-tests checklist"}
          </p>
          <p className="mt-1 text-[11px] text-amber-800">
            {locale === "vi"
              ? "Thông tin chung. Không phải tư vấn pháp lý hay thuế. Xác nhận đủ điều kiện với đại lý thuế đã đăng ký."
              : "General information only. Not legal or tax advice. Confirm eligibility with a registered tax agent."}
          </p>
          <Bullets items={list(c.qualifyingTests)} />
        </section>
      ) : null}

      <section className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
          {locale === "vi" ? "Ví dụ trên BlockID.au" : "BlockID.au showcase"}
        </p>
        <p className="mt-2 text-sm text-emerald-900">{t(c.showcaseExample)}</p>
      </section>

      <section className="rounded-lg border border-surface-200 bg-white p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
          {locale === "vi" ? "Bước tiếp theo" : "Next step"}
        </p>
        <p className="mt-2 text-sm text-ink-700">{t(c.cta)}</p>
      </section>
    </div>
  );
}

export default async function WorkspaceGuideChapterPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { chapter } = await params;
  const c = getChapter(chapter);
  if (!c) notFound();

  const user = await getCurrentUser();
  if (!user) redirect(`/auth/login?next=/workspace/guide/${c.slug}`);


  const isSandbox = await getCurrentProjectIsSandbox();
  const locale = await getLocale();
  const t = (v: { en: string; vi: string }) => (locale === "vi" ? v.vi : v.en);
  const { previous, next } = getAdjacentChapters(c.slug);

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <PageTracker
        page="workspace-guide-chapter"
        chapter={c.phase}
        locale={locale}
        source="onboarding"
      />
      <div className="mx-auto max-w-3xl p-6">
        <ChapterProgressRibbon phase={c.phase} locale={locale} variant="workspace" />
        <header className="mb-6">
          <p className="text-xs font-medium uppercase tracking-wide text-emerald-600">
            {locale === "vi"
              ? `Phase ${c.phase} · ${c.phaseLabel.vi}`
              : `Phase ${c.phase} · ${c.phaseLabel.en}`}
          </p>
          <h1 className="mt-1 text-2xl font-bold text-ink-800">{t(c.title)}</h1>
        </header>

        <ChapterBody c={c} locale={locale} />

        <nav className="mt-10 grid gap-3 border-t border-surface-200 pt-6 md:grid-cols-2">
          {previous ? (
            <Link
              href={`/workspace/guide/${previous.slug}`}
              className="rounded-lg border border-surface-200 p-3 text-left transition hover:border-emerald-400"
            >
              <span className="text-[11px] uppercase tracking-wide text-ink-500">
                {locale === "vi" ? "Chương trước" : "Previous"}
              </span>
              <p className="mt-0.5 text-sm font-semibold text-ink-800">
                {t(previous.title)}
              </p>
            </Link>
          ) : (
            <div />
          )}
          {next ? (
            <Link
              href={`/workspace/guide/${next.slug}`}
              className="rounded-lg border border-surface-200 p-3 text-right transition hover:border-emerald-400"
            >
              <span className="text-[11px] uppercase tracking-wide text-ink-500">
                {locale === "vi" ? "Chương sau" : "Next"}
              </span>
              <p className="mt-0.5 text-sm font-semibold text-ink-800">
                {t(next.title)}
              </p>
            </Link>
          ) : (
            <div className="rounded-lg border border-dashed border-surface-300 p-3 text-right text-xs text-ink-500">
              {locale === "vi"
                ? "Chương cuối. Sau thoái vốn: workspace mới hoặc vai đại lý."
                : "Final chapter. After exit: new workspace or reseller role."}
            </div>
          )}
        </nav>
      </div>
    </WorkspaceLayout>
  );
}
