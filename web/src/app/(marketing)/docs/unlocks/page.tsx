/**
 * /docs/unlocks — "What unlocks when" (G8-P8).
 *
 * Founder-facing view of the phase × plan sidebar matrix and the phase exit
 * criteria. Both tables render from `web/content/generated/unlock-matrix.json`,
 * which `node scripts/docs/render-unlock-matrix.mjs` derives from the live
 * nav catalogue + gate engine and `scripts/docs/unlock-matrix.test.ts` pins,
 * so this page and `docs/user/menu-walkthrough.md` cannot drift from the
 * sidebar. English copy only — Vietnamese comes from the runtime translator.
 *
 * Static: the JSON is bundled, nothing is fetched.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { MarketingHero } from "@/components/marketing/marketing-hero";
import { MarketingSection } from "@/components/marketing/marketing-section";
import { MarketingCtaStrip } from "@/components/marketing/marketing-cta-strip";
import { BreadcrumbListJsonLd } from "@/components/seo/breadcrumb-json-ld";
import { WebPageJsonLd } from "@/components/seo/json-ld";
import { fitDescription, pageMetadata, SITE_URL } from "@/lib/seo/page-meta";
import rawMatrix from "../../../../../content/generated/unlock-matrix.json";

const PATH = "/docs/unlocks";
const TITLE = "What unlocks when: phases, plans and tools";
const DESCRIPTION = fitDescription([
  "Which BlockID tools appear at each of the 12 growth phases on Free, Starter, Growth, the Startup Package and the Evaluator plans",
  "And the evidence that clears each phase gate",
]);

// S8-A: no hand-written brand suffix (the root template appends it), OG
// image carried, WebPage + BreadcrumbList JSON-LD below.
export const metadata: Metadata = pageMetadata({ title: TITLE, description: DESCRIPTION, path: PATH, ogType: "article" });

// Shape of `unlock-matrix.json` (see scripts/docs/unlock-matrix.mts).
type GroupState = "visible" | "hidden_phase" | "hidden_segment" | "later_preview" | "empty";
interface GroupCell {
  id: string;
  label: string;
  state: GroupState;
  visibleItems: number;
  upgradeItems: number;
  addOnItems: number;
}
interface LockedRow {
  group: string;
  label: string;
  reason: "upgrade" | "add-on";
  minPlan?: string;
}
interface Column {
  id: string;
  label: string;
  planName: string;
  tier: string;
  segment: string;
  lockedRows: LockedRow[];
}
interface PhaseRow {
  id: string;
  order: number;
  labelEn: string;
  labelVi: string;
  sidebarPhase: number;
}
interface UnlockRule {
  id: string;
  order: number;
  labelEn: string;
  labelVi: string;
  requiredQuality: string;
  requiredCriteria: Array<{ key: string; title: string; titleVi: string }>;
  dimensionFloors: Array<{ dimension: string; label: string; floor: number }>;
  nextPhase: string | null;
  nextPhaseLabelEn: string | null;
  groupsUnlockedOnExit: string[];
}
interface UnlockMatrix {
  columns: Column[];
  phases: PhaseRow[];
  steps: Record<string, Record<string, GroupCell[]>>;
  rules: UnlockRule[];
}

const matrix = rawMatrix as unknown as UnlockMatrix;

const STATE_NOTE: Record<GroupCell["state"], string> = {
  visible: "open",
  later_preview: "previewed under “Later phases”",
  hidden_phase: "hidden until this phase",
  hidden_segment: "not for this audience",
  empty: "no rows for this audience",
};

function cellsFor(sidebarPhase: number, columnId: string): GroupCell[] {
  return matrix.steps[String(sidebarPhase)]?.[columnId] ?? [];
}

function Chip({ cell }: { cell: GroupCell }) {
  if (cell.state === "later_preview") {
    return (
      <span
        title={STATE_NOTE[cell.state]}
        className="inline-flex items-center rounded-full border border-dashed border-line px-2 py-0.5 text-[11px] text-muted"
      >
        Later: {cell.label}
      </span>
    );
  }
  const notes: string[] = [];
  if (cell.upgradeItems > 0) notes.push(`${cell.upgradeItems} upgrade`);
  if (cell.addOnItems > 0) notes.push(`${cell.addOnItems} add-on`);
  return (
    <span
      title={`${cell.visibleItems} rows${notes.length ? ` · ${notes.join(", ")} dimmed` : ""}`}
      className="inline-flex items-center gap-1 rounded-full border border-line-subtle bg-surface px-2 py-0.5 text-[11px] text-primary"
    >
      {cell.label}
      {notes.length > 0 ? <span className="text-muted">({notes.join(", ")})</span> : null}
    </span>
  );
}

function MatrixCell({ cells }: { cells: GroupCell[] }) {
  const shown = cells.filter((c) => c.state === "visible" || c.state === "later_preview");
  if (shown.length === 0) return <span className="text-muted">—</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {shown.map((c) => (
        <Chip key={c.id} cell={c} />
      ))}
    </span>
  );
}

export default function UnlocksPage() {
  const columns = matrix.columns;
  return (
    <MarketingShell>
      <BreadcrumbListJsonLd
        items={[
          { name: "Home", href: "/" },
          { name: "Docs", href: "/docs" },
          { name: "What unlocks when", href: PATH },
        ]}
      />
      <WebPageJsonLd url={`${SITE_URL}${PATH}`} name={TITLE} description={DESCRIPTION} />
      <MarketingHero
        eyebrow="Docs · Progressive unlock"
        title="What unlocks when: the tools each phase and plan opens"
        subtitle="The BlockID sidebar grows with your startup. This page shows exactly which groups appear at each of the 12 growth phases on every plan, and the evidence that clears each phase gate — generated from the same rules the app runs."
        primaryCta={{ href: "/dashboard", label: "See my next unlock" }}
        secondaryCta={{ href: "/pricing", label: "Compare plans" }}
      />

      <MarketingSection kicker="How gates work" title="Gates are advisory">
        <div className="space-y-4 text-base leading-relaxed text-secondary">
          <p>
            Gates are advisory: you can move on manually; the badge and investor-facing
            trust score follow the evidence. Nothing in the product stops you stepping into
            the next phase — but the phase badge on your profile and the trust score an
            evaluator sees are computed from what you have actually evidenced, not from the
            phase you declared.
          </p>
          <p>
            Two different locks look different on purpose. A group your phase has not reached
            is <strong className="text-primary">hidden</strong> — no clutter, it appears the moment
            you get there. A row your plan does not include stays{" "}
            <strong className="text-primary">visible but dimmed</strong> with an Upgrade chip (or an
            Add-on pill for purchasable features such as Share Management), so you can see
            what a higher plan opens before you pay for it. Hidden never means blocked: a link
            you already hold still resolves.
          </p>
        </div>
      </MarketingSection>

      <MarketingSection kicker="Table 1" title="Phase × plan — what the sidebar shows">
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-secondary">
          Each growth phase belongs to one of six workflow steps (Ideate → Validate → Build →
          Fundraise → Grow → Exit); a sidebar group opens when its step is reached. A chip
          names an open group; <em>(n upgrade)</em> counts rows dimmed with an Upgrade chip on
          that plan, <em>(n add-on)</em> rows with an Add-on pill. Groups missing from a cell are
          hidden — by phase, or because they belong to a different audience.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line-subtle">
          <table className="w-full min-w-[1100px] text-left text-xs" data-testid="unlock-matrix-table">
            <thead className="bg-surface-sunken text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">
                  #
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Phase
                </th>
                {columns.map((c) => (
                  <th key={c.id} scope="col" className="px-3 py-3 font-semibold" title={`${c.planName} · ${c.segment}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.phases.map((p) => (
                <tr key={p.id} className="border-t border-line-subtle align-top">
                  <td className="px-3 py-3 font-mono tabular-nums text-muted">{p.order}</td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-primary">{p.labelEn}</span>
                    <span className="block font-mono text-[11px] text-muted">{p.id}</span>
                  </td>
                  {columns.map((c) => (
                    <td key={c.id} className="px-3 py-3">
                      <MatrixCell cells={cellsFor(p.sidebarPhase, c.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul className="mt-4 space-y-1 text-xs leading-relaxed text-muted">
          <li>
            Before your first SVI run the sidebar treats you as pre-phase: Home, Validate and
            Account, plus a &ldquo;Later phases&rdquo; preview of Scale &amp; Exit. Run one analysis and
            the table above applies.
          </li>
          <li>
            <strong className="text-secondary">Package</strong> is the one-off Startup Package: the Free
            menu plus the Startup Package row and the Money Finder features. Rows that need
            Starter or above stay dimmed until you subscribe.
          </li>
          <li>
            <strong className="text-secondary">Evaluators</strong> (Scout / Firm / Program) never see the
            founder Validate, Build or Scale &amp; Exit groups; they get Roles → Investor / Advisor /
            Accelerator instead.
          </li>
        </ul>
      </MarketingSection>

      <MarketingSection kicker="Table 2" title="How to unlock the next level">
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-secondary">
          Every phase has an exit gate built from the same 13 evidence criteria that feed your
          SVI score. A phase is cleared when each required criterion is rated at least{" "}
          <strong className="text-primary">{matrix.rules[0]?.requiredQuality ?? "good"}</strong> (on the ladder
          incomplete → basic → good → strong → exceptional) and every SVI dimension floor is met.
          The dashboard &ldquo;Next unlock&rdquo; card scores this for you, with partial credit and the
          top three blockers ranked worst-first.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line-subtle">
          <table className="w-full min-w-[820px] text-left text-sm" data-testid="unlock-rules-table">
            <thead className="bg-surface-sunken text-[11px] uppercase tracking-wider text-muted">
              <tr>
                <th scope="col" className="px-3 py-3 font-semibold">
                  #
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Phase
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Required evidence
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  SVI dimension floor
                </th>
                <th scope="col" className="px-3 py-3 font-semibold">
                  Appears when you move on
                </th>
              </tr>
            </thead>
            <tbody>
              {matrix.rules.map((r) => (
                <tr key={r.id} className="border-t border-line-subtle align-top">
                  <td className="px-3 py-3 font-mono tabular-nums text-muted">{r.order}</td>
                  <td className="px-3 py-3">
                    <span className="font-semibold text-primary">{r.labelEn}</span>
                    <span className="block text-xs text-muted">{r.labelVi}</span>
                  </td>
                  <td className="px-3 py-3 text-secondary">
                    {r.requiredCriteria.length >= 13
                      ? "All 13 criteria"
                      : r.requiredCriteria.map((c) => c.title).join(", ")}
                  </td>
                  <td className="px-3 py-3 text-secondary">
                    {r.dimensionFloors.length === 0
                      ? "—"
                      : r.dimensionFloors
                          .map((f) => `${f.label} (${f.dimension.toUpperCase()}) ≥ ${f.floor}`)
                          .join(", ")}
                  </td>
                  <td className="px-3 py-3 text-secondary">
                    {r.nextPhase === null
                      ? "Final phase — everything is already open"
                      : r.groupsUnlockedOnExit.length > 0
                        ? `${r.groupsUnlockedOnExit.join(", ")} (at ${r.nextPhaseLabelEn})`
                        : "Nothing new — same groups as the next phase"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-muted">
          FTV = Founder &amp; Team · MPC = Market &amp; Problem · PTD = Product &amp; Technical · TRE =
          Traction &amp; Revenue · CGH = Cap Table &amp; Governance · IRI = Investor Readiness · LCO =
          Legal &amp; Compliance. &ldquo;Nothing new&rdquo; is an honest answer: consecutive phases in the same
          workflow step share a sidebar, so the new tools opened at the step&rsquo;s first phase.
        </p>
      </MarketingSection>

      <MarketingSection kicker="Per plan" title="What an upgrade opens" tone="elevated">
        <p className="mb-6 max-w-3xl text-sm leading-relaxed text-secondary">
          The dimmed rows each plan sees once every phase group is open, and the plan that
          turns them on.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {columns.map((c) => (
            <details key={c.id} className="rounded-2xl border border-line-subtle bg-surface p-4">
              <summary className="cursor-pointer text-sm font-semibold text-primary">
                {c.label} <span className="font-normal text-muted">— {c.lockedRows.length} dimmed rows</span>
              </summary>
              {c.lockedRows.length === 0 ? (
                <p className="mt-3 text-xs text-muted">Every row is open on this plan.</p>
              ) : (
                <ul className="mt-3 space-y-1 text-xs text-secondary">
                  {c.lockedRows.map((row) => (
                    <li key={`${row.group}:${row.label}`} className="flex justify-between gap-3">
                      <span>
                        <span className="text-muted">{row.group} ·</span> {row.label}
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted">
                        {row.reason === "add-on" ? "add-on" : row.minPlan ? `needs ${row.minPlan}` : "upgrade"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          ))}
        </div>
        <p className="mt-6 text-xs text-muted">
          Source of truth: the workspace nav catalogue and phase-gate engine in the BlockID
          codebase, rendered by <code className="font-mono">scripts/docs/render-unlock-matrix.mjs</code>.
          Engineers: see the{" "}
          <Link href="/docs" className="underline decoration-line underline-offset-2 hover:text-primary">
            platform docs index
          </Link>
          .
        </p>
      </MarketingSection>

      <MarketingCtaStrip
        headline="See where you stand today"
        primary={{ href: "/dashboard", label: "Open my dashboard" }}
        secondary={{ href: "/pricing", label: "Compare plans" }}
      />
    </MarketingShell>
  );
}
