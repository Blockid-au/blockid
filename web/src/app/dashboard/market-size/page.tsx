import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getActiveProject, getCurrentProjectIsSandbox } from "@/lib/projects";
import { WorkspaceLayout } from "@/components/workspace/workspace-layout";
import {
  estimateTamSamSom,
  searchByKeyword,
} from "@/lib/market/au-market-lookup";
import { MarketSizeTile } from "@/components/dashboard/market-size-tile";
import { normaliseIndustryKeyword } from "@/components/dashboard/market-size-tile.helpers";

// P3c — /dashboard/market-size deep-link.
//
// Server-only. Reads the founder's active project.industry (or an explicit
// ?keyword= / ?anzsic= override), calls the pure ABS-lookup helper, and
// renders the MarketSizeTile. Mirrors the /dashboard/exit-readiness
// (P12b-tile) posture so both chapter-anchor tiles behave the same for
// founders navigating between them.

export const metadata: Metadata = {
  title: "AU Market Size (TAM / SAM / SOM) | BlockID",
  description:
    "Chapter 3 (Market Research) anchor for total addressable, serviceable, and obtainable market — sourced from ABS 8155.0 / 8165.0 and IBISWorld industry reports.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams?: Promise<{
    keyword?: string;
    anzsic?: string;
    addressablePct?: string;
    targetSharePct?: string;
  }>;
}

function parsePct(raw: string | undefined, fallback: number): number {
  if (raw == null || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

export default async function MarketSizeDashboardPage({
  searchParams,
}: PageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/auth/login?next=/dashboard/market-size");

  const [isSandbox, project, sp] = await Promise.all([
    getCurrentProjectIsSandbox(),
    getActiveProject(user.id),
    searchParams,
  ]);

  // Priority: explicit ?anzsic= override → explicit ?keyword= override →
  // the founder's active-project industry field.
  const explicitAnzsic = (sp?.anzsic ?? "").trim();
  const explicitKeyword = (sp?.keyword ?? "").trim();
  const projectKeyword = normaliseIndustryKeyword(project?.industry ?? null);
  const keyword = explicitKeyword || projectKeyword;
  const addressablePct = parsePct(sp?.addressablePct, 0.2);
  const targetSharePct = parsePct(sp?.targetSharePct, 0.01);

  const result = estimateTamSamSom({
    anzsicCode: explicitAnzsic || undefined,
    keyword: keyword || undefined,
    addressablePct,
    targetSharePct,
  });

  // Sibling-class suggestions: only meaningful for keyword lookups (ANZSIC
  // callers already picked the class). Excludes the matched class so the
  // tile doesn't repeat itself.
  const suggestions =
    keyword && !explicitAnzsic
      ? searchByKeyword(keyword, 5)
          .filter((s) => s.anzsicCode !== result?.industry.anzsicCode)
          .slice(0, 4)
      : [];

  return (
    <WorkspaceLayout user={user} isSandbox={isSandbox}>
      <div className="mx-auto max-w-5xl px-6 pb-24 pt-6 space-y-6">
        <header>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
            Chapter 3 · Market Research
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-ink-800">
            AU market size (TAM / SAM / SOM)
          </h1>
          <p className="mt-2 text-sm text-ink-500">
            Anchor sizing for your ANZSIC 2006 class, sourced from ABS 8155.0
            Australian Industry + 8165.0 Counts of Australian Businesses and
            cross-checked against IBISWorld public industry-report summaries.
            Override the sector by appending{" "}
            <code className="rounded bg-surface-50 px-1 text-xs">?keyword=…</code>{" "}
            or{" "}
            <code className="rounded bg-surface-50 px-1 text-xs">?anzsic=…</code>{" "}
            to this URL.
          </p>
        </header>
        <MarketSizeTile
          result={result}
          suggestions={suggestions}
          keyword={keyword}
        />
      </div>
    </WorkspaceLayout>
  );
}
