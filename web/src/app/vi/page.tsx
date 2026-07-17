import type { Metadata } from "next";
import { NavV2 } from "@/components/landing/nav-v2";
import { HeroSearch } from "@/components/landing/hero-search";
import { getMessages, t } from "@/lib/i18n/t";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
  const m = await getMessages("vi");
  return {
    title: t(m, "meta.home.title"),
    description: t(m, "meta.home.description"),
    robots: { index: true, follow: true },
    alternates: {
      canonical: "https://blockid.au/vi",
      languages: {
        en: "https://blockid.au/",
        vi: "https://blockid.au/vi",
        "x-default": "https://blockid.au/",
      },
    },
    openGraph: {
      title: t(m, "meta.home.title"),
      description: t(m, "meta.home.description"),
      url: "https://blockid.au/vi",
      siteName: "BlockID.au",
      type: "website",
      locale: "vi_VN",
    },
  };
}

export default async function ViHomePage() {
  const m = await getMessages("vi");

  return (
    <div data-theme="lux" lang="vi" className="bg-brand-navy min-h-screen">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-brand-gold focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-brand-navy"
      >
        {t(m, "nav.signin", "Skip to content")}
      </a>
      <NavV2 />
      <main id="main-content">
        <HeroSearch />
        <section
          aria-label="Vietnamese founder notice"
          className="mx-auto max-w-3xl px-6 pb-12 text-center"
        >
          <p className="text-sm text-brand-ink-muted">{t(m, "vi.hero.notice")}</p>
          <p className="mt-4 text-xs text-brand-ink-muted/70">
            Auschain PTY LTD · ACN 659 615 111 · ABN 79 659 615 111 · Sydney NSW
          </p>
        </section>
      </main>
    </div>
  );
}
