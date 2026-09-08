/**
 * OutcomeGrid — the bento of artefacts a single run produces.
 *
 * Replaces TwoPillarSplit. The old section told the visitor about our own
 * internal weighting ("AI evaluation, weighted 70%. Blockchain equity on
 * subscription, 30%") — a sentence from a strategy deck, not a reason to
 * type anything into the box. The weighting is still expressed here, but
 * visually: four evaluation tiles at full weight, and equity handled in its
 * own smaller band further down the page.
 *
 * Bento grid (ui-ux-pro-max "Bento Box Grid") is the right pattern because
 * the product is a *set* of deliverables from one input. Varying tile size
 * lets the score and the valuation lead without pushing the data room and
 * the action list off the page.
 *
 * Server component. Tokens only — no raw hex, no inline colour.
 */

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Tile {
  eyebrow: string;
  title: string;
  body: string;
  detail: string[];
  href: string;
  linkLabel: string;
  span: string;
}

const TILES: Tile[] = [
  {
    eyebrow: "The score",
    title: "A number you can defend line by line",
    body:
      "Eight dimensions, thirteen criteria, and the evidence behind each one — so when an investor asks why the market score is low, you have the answer instead of a shrug.",
    detail: [
      "Founder & team, market, product, traction",
      "Capital, risk, compliance, momentum",
      "Every criterion cites what it was scored on",
    ],
    href: "/guide/scn",
    linkLabel: "How the score is built",
    span: "lg:col-span-7",
  },
  {
    eyebrow: "The valuation",
    title: "Four methods, one honest range",
    body:
      "Berkus, the VC method, discounted cash flow and comparable companies run side by side. You see each number and where they disagree — which is usually the most useful part.",
    detail: ["Berkus", "VC method", "DCF", "Comparables"],
    href: "/reports/samples",
    linkLabel: "See a full valuation",
    span: "lg:col-span-5",
  },
  {
    eyebrow: "The next moves",
    title: "The five things to fix first",
    body:
      "Ranked by how much each one moves the valuation, and placed on a twelve-phase journey so you know what this quarter is for and what can wait.",
    detail: [],
    href: "/showcase/atlassian/growth-phases",
    linkLabel: "Walk the twelve phases",
    span: "lg:col-span-4",
  },
  {
    eyebrow: "The paperwork",
    title: "A data room that is already assembled",
    body:
      "The documents an investor asks for in week one, drafted from your own answers: cap table, model, register, risk notes. You edit; you do not start from a blank page.",
    detail: [],
    href: "/tools/data-room",
    linkLabel: "Open the data room",
    span: "lg:col-span-4",
  },
  {
    eyebrow: "The hand-over",
    title: "A written report, A$3",
    body:
      "Need it as a document rather than a screen? The one-click report is a one-off A$3 including GST, emailed as a PDF. No account, no subscription.",
    detail: [],
    href: "/one-click-report",
    linkLabel: "Get the A$3 report",
    span: "lg:col-span-4",
  },
];

function TileCard({ tile, lead }: { tile: Tile; lead: boolean }) {
  return (
    <article
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-line-subtle bg-surface-raised p-6 shadow-sm sm:p-7",
        tile.span,
      )}
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-muted">
        {tile.eyebrow}
      </p>
      <h3
        className={cn(
          "font-display font-bold tracking-tight text-primary",
          lead ? "text-xl sm:text-2xl" : "text-lg sm:text-xl",
        )}
      >
        {tile.title}
      </h3>
      <p className="text-sm leading-relaxed text-secondary">{tile.body}</p>

      {tile.detail.length > 0 && (
        <ul role="list" className="flex flex-wrap gap-2">
          {tile.detail.map((d) => (
            <li
              key={d}
              className="rounded-full border border-line-subtle bg-surface-sunken px-2.5 py-1 text-xs font-medium text-secondary"
            >
              {d}
            </li>
          ))}
        </ul>
      )}

      <Link
        href={tile.href}
        className="mt-auto inline-flex items-center gap-1.5 rounded-md pt-1 text-sm font-medium text-action transition-colors hover:text-action-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2 focus-visible:ring-offset-surface-raised"
      >
        {tile.linkLabel}
        <ArrowRight size={14} aria-hidden />
      </Link>
    </article>
  );
}

export function OutcomeGrid({ className }: { className?: string }) {
  return (
    <section
      aria-labelledby="outcome-heading"
      data-testid="outcome-grid"
      className={cn(
        "border-t border-line-subtle bg-surface-sunken py-14 sm:py-16",
        className,
      )}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.28em] text-muted">
            What comes back
          </p>
          <h2
            id="outcome-heading"
            className="font-display text-2xl font-bold tracking-tight text-primary sm:text-3xl"
          >
            One input. Everything you need to put a price on the business.
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-secondary sm:text-base">
            Not a summary of what you already told us. A score, a valuation
            range, a ranked list of what to do next, and the documents to show
            someone who asks.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {TILES.map((tile, i) => (
            <TileCard key={tile.title} tile={tile} lead={i < 2} />
          ))}
        </div>
      </div>
    </section>
  );
}

export default OutcomeGrid;
