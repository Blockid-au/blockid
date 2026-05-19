import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  Calculator,
  Download,
  Eye,
  Lightbulb,
  PieChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { Navbar } from "@/components/site/navbar";
import { Footer } from "@/components/site/footer";
import { Button } from "@/components/ui/button";
import {
  hydrateFounderPackBySlug,
  logFounderPackView,
  type HydratedFounderPack,
} from "@/lib/idea-phase/persist";
import { hashIp, clientIpFromHeaders } from "@/lib/iphash";
import { formatAud, formatPercent } from "@/lib/utils";

// /s/p/[slug] — public share page for a Founder Pack. Anyone with the URL
// can view (no auth gate at idea-phase per blueprint §3.4 / §8.1). Every
// render appends a row to founder_pack_views; the owner sees view_count on
// /dashboard.

export const dynamic = "force-dynamic";

function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(
    /\/$/,
    "",
  );
}

async function recordView(packId: string): Promise<void> {
  const h = await headers();
  const ipHash = hashIp(clientIpFromHeaders(h));
  await logFounderPackView({
    packId,
    ipHash,
    userAgent: h.get("user-agent")?.slice(0, 512) ?? null,
    referer: h.get("referer")?.slice(0, 512) ?? null,
  });
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const pack = await hydrateFounderPackBySlug(slug);
  const idea = pack?.ideaName || pack?.evaluation?.ideaName || "Founder Pack";
  return {
    title: `${idea} — Founder Pack · BlockID`,
    description:
      "AUD valuation, co-founder split and funding plan, bundled by BlockID.",
    robots: { index: false, follow: false },
  };
}

export default async function FounderPackSharePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ welcome?: string }>;
}) {
  const { slug } = await params;
  const sp = await searchParams;
  const pack = await hydrateFounderPackBySlug(slug);
  if (!pack) notFound();

  // Fire-and-forget — don't block render on telemetry.
  void recordView(pack.id);

  const isWelcome = sp.welcome === "1";
  const shareUrl = `${siteUrl()}/s/p/${slug}`;

  return (
    <>
      <Navbar />
      <main className="min-h-screen bg-white pt-28 pb-24 text-ink-700">
        <div className="mx-auto max-w-5xl px-6">
          {isWelcome && <WelcomeBanner />}

          <PackHero pack={pack} shareUrl={shareUrl} />

          <div className="mt-10 grid gap-6 md:grid-cols-3">
            <ValuationCard pack={pack} />
            <SplitCard pack={pack} />
            <FundingCard pack={pack} />
          </div>

          {pack.evaluation && pack.evaluation.suggestions.length > 0 && (
            <SuggestionsCard pack={pack} />
          )}

          {pack.split && <FoundersTable pack={pack} />}

          {pack.funding && <FundingDetailCard pack={pack} />}

          <NextStepsCard />
        </div>
      </main>
      <Footer />
    </>
  );
}

function WelcomeBanner() {
  return (
    <div className="mb-8 flex items-start gap-3 rounded-xl border border-brand-400/40 bg-brand-400/5 p-4">
      <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-brand-600" />
      <div>
        <p className="font-semibold text-brand-500">
          Your Founder Pack is saved.
        </p>
        <p className="mt-1 text-sm text-ink-500">
          Bookmark this URL — anyone you share it with can open it. View count
          and visitor activity show on your{" "}
          <Link
            href="/dashboard"
            className="text-brand-600 underline underline-offset-4 hover:text-brand-500"
          >
            dashboard
          </Link>
          .
        </p>
      </div>
    </div>
  );
}

function PackHero({
  pack,
  shareUrl,
}: {
  pack: HydratedFounderPack;
  shareUrl: string;
}) {
  const idea = pack.ideaName || pack.evaluation?.ideaName || "Untitled idea";
  return (
    <div className="rounded-3xl border border-surface-200 bg-white p-8">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-amber-300">
        <ShieldCheck className="h-4 w-4" />
        v0 · pre-incorporation draft
      </div>
      <h1 className="mt-3 text-3xl font-semibold tracking-tight text-ink-800 sm:text-5xl">
        {idea}
      </h1>
      <p className="mt-3 max-w-3xl text-base leading-relaxed text-ink-400 sm:text-lg">
        Founder Pack prepared by{" "}
        <span className="font-semibold text-ink-600">
          {pack.user.displayName || pack.user.email || "a BlockID founder"}
        </span>{" "}
        on {new Date(pack.createdAt).toLocaleDateString("en-AU")}. This is a
        working draft for self-reflection and conversations — not legal,
        financial or investment advice.
      </p>
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Link href={`/s/p/${pack.slug}/pdf`}>
          <Button variant="primary" size="md" className="h-11">
            <Download className="h-4 w-4" />
            Download PDF
          </Button>
        </Link>
        <Link href="/dashboard">
          <Button variant="secondary" size="md" className="h-11">
            View dashboard
          </Button>
        </Link>
        <span className="ml-auto inline-flex items-center gap-2 rounded-full border border-surface-200 bg-surface-100 px-3 py-1.5 text-xs font-medium text-ink-400">
          <Eye className="h-3.5 w-3.5" />
          {pack.viewCount} {pack.viewCount === 1 ? "view" : "views"}
        </span>
      </div>
      <p className="mt-5 break-all text-xs text-ink-8000">
        Share link: {shareUrl}
      </p>
    </div>
  );
}

function ValuationCard({ pack }: { pack: HydratedFounderPack }) {
  const ev = pack.evaluation;
  return (
    <Card>
      <CardEyebrow icon={Lightbulb}>Idea valuation</CardEyebrow>
      {ev ? (
        <>
          <p className="mt-2 text-2xl font-semibold text-ink-800">
            {formatAud(ev.valuationLowAud)} – {formatAud(ev.valuationHighAud)}
          </p>
          <p className="mt-1 text-sm text-ink-400">
            Mid-point {formatAud(ev.valuationMidAud)}
          </p>
          {ev.confidenceText && (
            <p className="mt-3 text-xs leading-relaxed text-ink-8000">
              {ev.confidenceText}
            </p>
          )}
        </>
      ) : (
        <EmptyHint label="Not evaluated yet." href="/tools/idea-valuation" />
      )}
    </Card>
  );
}

function SplitCard({ pack }: { pack: HydratedFounderPack }) {
  const sp = pack.split;
  return (
    <Card>
      <CardEyebrow icon={PieChart}>Co-founder split</CardEyebrow>
      {sp ? (
        <>
          <p className="mt-2 text-2xl font-semibold text-ink-800">
            {sp.founders.length}{" "}
            {sp.founders.length === 1 ? "founder" : "founders"}
          </p>
          <p className="mt-1 text-sm text-ink-400">
            Founders {formatPercent(sp.reserves.foundersPct, 0)} · ESOP{" "}
            {formatPercent(sp.reserves.esopPct, 0)}
          </p>
          <p className="mt-3 text-xs leading-relaxed text-ink-8000">
            {sp.vesting.cliffMonths}-mo cliff · {sp.vesting.totalMonths}-mo
            vesting
          </p>
        </>
      ) : (
        <EmptyHint label="No split yet." href="/tools/equity-split" />
      )}
    </Card>
  );
}

function FundingCard({ pack }: { pack: HydratedFounderPack }) {
  const fp = pack.funding;
  return (
    <Card>
      <CardEyebrow icon={TrendingUp}>Funding plan</CardEyebrow>
      {fp ? (
        <>
          <p className="mt-2 text-2xl font-semibold text-ink-800">
            {formatAud(fp.recommendedRaise ?? 0)}
          </p>
          <p className="mt-1 text-sm text-ink-400">recommended raise</p>
          <p className="mt-3 text-xs leading-relaxed text-ink-8000">
            Burn {formatAud(fp.monthlyBurnAud ?? 0)}/mo · Need{" "}
            {formatAud(fp.totalNeedAud ?? 0)}
          </p>
        </>
      ) : (
        <EmptyHint label="No plan yet." href="/tools/funding-plan" />
      )}
    </Card>
  );
}

function SuggestionsCard({ pack }: { pack: HydratedFounderPack }) {
  const ev = pack.evaluation!;
  return (
    <Card className="mt-6">
      <CardEyebrow icon={Sparkles}>
        Top suggestions to lift valuation
      </CardEyebrow>
      <ul className="mt-4 space-y-4">
        {ev.suggestions.slice(0, 3).map((s) => (
          <li key={s.title} className="flex gap-3">
            <span className="mt-1 inline-block h-2 w-2 shrink-0 rounded-full bg-brand-400" />
            <div>
              <p className="text-sm font-semibold text-ink-700">
                {s.title}
                <span className="ml-2 font-normal text-ink-8000">
                  ~ +{formatAud(s.upliftAud)}
                </span>
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-400">
                {s.detail}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function FoundersTable({ pack }: { pack: HydratedFounderPack }) {
  const sp = pack.split!;
  return (
    <Card className="mt-6 overflow-hidden p-0">
      <div className="px-6 pt-6">
        <CardEyebrow icon={PieChart}>Equity allocation</CardEyebrow>
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-100 text-xs uppercase tracking-wider text-ink-400">
            <tr>
              <th className="px-6 py-3 text-left font-semibold">Founder</th>
              <th className="px-6 py-3 text-left font-semibold">Role</th>
              <th className="px-6 py-3 text-right font-semibold">Points</th>
              <th className="px-6 py-3 text-right font-semibold">Equity</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-200/60">
            {sp.allocations.map((a) => (
              <tr key={a.id}>
                <td className="px-6 py-3 font-medium text-ink-700">
                  {a.name || "—"}
                </td>
                <td className="px-6 py-3 text-ink-500">{a.role}</td>
                <td className="px-6 py-3 text-right text-ink-500">
                  {Math.round(a.points)}
                </td>
                <td className="px-6 py-3 text-right font-semibold text-brand-600">
                  {formatPercent(a.pct, 1)}
                </td>
              </tr>
            ))}
            <tr className="bg-surface-100/40">
              <td className="px-6 py-3 text-sm font-semibold text-ink-500">
                ESOP reserve
              </td>
              <td className="px-6 py-3" />
              <td className="px-6 py-3" />
              <td className="px-6 py-3 text-right text-ink-500">
                {formatPercent(sp.reserves.esopPct, 1)}
              </td>
            </tr>
            {sp.reserves.firstHirePct > 0 && (
              <tr className="bg-surface-100/40">
                <td className="px-6 py-3 text-sm font-semibold text-ink-500">
                  First-hire reserve
                </td>
                <td className="px-6 py-3" />
                <td className="px-6 py-3" />
                <td className="px-6 py-3 text-right text-ink-500">
                  {formatPercent(sp.reserves.firstHirePct, 1)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function FundingDetailCard({ pack }: { pack: HydratedFounderPack }) {
  const fp = pack.funding!;
  return (
    <Card className="mt-6">
      <CardEyebrow icon={Calculator}>Funding scenarios</CardEyebrow>
      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Stat
          label="Pre-money"
          value={formatAud(fp.inputs.preMoneyAud)}
          hint={`ESOP ${formatPercent(fp.inputs.esopPct, 0)}`}
        />
        <Stat
          label="Runway target"
          value={`${fp.inputs.runwayMonths} mo`}
          hint={`Buffer ${formatPercent(fp.inputs.bufferPct, 0)}`}
        />
        <Stat
          label="Founder cash"
          value={formatAud(fp.result.founderCapitalPooledAud)}
          hint={`${fp.inputs.founders.length} founders`}
        />
      </div>

      {fp.result.scenarios && fp.result.scenarios.length > 0 && (
        <div className="mt-6 overflow-x-auto rounded-xl border border-surface-200">
          <table className="w-full text-sm">
            <thead className="bg-surface-100 text-xs uppercase tracking-wider text-ink-400">
              <tr>
                <th className="px-4 py-2 text-left font-semibold">Scenario</th>
                <th className="px-4 py-2 text-right font-semibold">Raise</th>
                <th className="px-4 py-2 text-right font-semibold">
                  Investor %
                </th>
                <th className="px-4 py-2 text-right font-semibold">
                  Founders %
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-200/60">
              {fp.result.scenarios.map((s) => (
                <tr key={s.label}>
                  <td className="px-4 py-2 text-ink-600">{s.label}</td>
                  <td className="px-4 py-2 text-right text-ink-500">
                    {formatAud(s.externalRaiseAud)}
                  </td>
                  <td className="px-4 py-2 text-right text-ink-500">
                    {formatPercent(s.investorPct, 1)}
                  </td>
                  <td className="px-4 py-2 text-right text-ink-500">
                    {formatPercent(s.founderPctAfter, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function NextStepsCard() {
  return (
    <Card className="mt-6 border-brand-500/40 bg-gradient-to-br from-white to-surface-100">
      <CardEyebrow icon={ShieldCheck}>When you incorporate</CardEyebrow>
      <p className="mt-3 text-base leading-relaxed text-ink-500">
        BlockID converts your Founder Pack into an{" "}
        <Link
          href="/score"
          className="font-semibold text-brand-600 underline underline-offset-4 hover:text-brand-500"
        >
          Investor-Ready Score
        </Link>{" "}
        and dataroom — one click, no re-typing. We&apos;ll keep this pack and
        bridge the inputs across.
      </p>
      <div className="mt-5">
        <Link href="/score">
          <Button variant="primary" size="md" className="h-11">
            Get my Investor-Ready Score
          </Button>
        </Link>
      </div>
    </Card>
  );
}

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-surface-200 bg-white p-6 ${className}`}
    >
      {children}
    </div>
  );
}

function CardEyebrow({
  icon: Icon,
  children,
}: {
  icon: typeof Sparkles;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-brand-600">
      <Icon className="h-4 w-4" />
      {children}
    </div>
  );
}

function EmptyHint({ label, href }: { label: string; href: string }) {
  return (
    <p className="mt-3 text-sm leading-relaxed text-ink-400">
      {label}{" "}
      <Link
        href={href}
        className="text-brand-600 underline underline-offset-4 hover:text-brand-500"
      >
        Open the tool →
      </Link>
    </p>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-surface-200 bg-surface-100/60 p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-8000">
        {label}
      </p>
      <p className="mt-2 text-lg font-semibold text-ink-800">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-400">{hint}</p>}
    </div>
  );
}
