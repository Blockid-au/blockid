/**
 * TrustBand — the compact "who stands behind this score" band (G21 P0-A).
 *
 * Advisor feedback 2026-09-20: trust is the product, and a site that names
 * its operator differently on different pages loses it. This band renders
 * the same four facts on every page that mounts it — operating entity,
 * ACN / ABN, methodology version, support — from `trustRows()` in
 * `lib/site/legal-entity`, followed by four short trust bullets:
 *
 *   1. privacy & evidence controls           → /legal/privacy
 *   2. score disclaimer (general information, not financial product advice —
 *      the sentences come from `DISCLAIMER_SURFACES.general_all`, never a
 *      new wording)
 *   3. append-only audit trail               → /methodology#audit
 *   4. founder consent & data ownership      (`DATA_PRINCIPLE_SENTENCE`, verbatim)
 *
 * Mounted above the closing `CtaBand` on /product, /pricing, /methodology
 * and the /solutions/* persona pages (the home page and
 * /solutions/accelerator mount it from their own lanes). Sits on the
 * `sunken` ground with `RHYTHM.sm` so it reads as a quiet fact strip, not
 * a second hero. Tokens only (no raw hex — `template.test.tsx` pins it);
 * every link is ≥ 44 px and carries `FOCUS_RING`; the grid collapses to one
 * column under `sm` so nothing overflows at 375 px.
 *
 * Server component.
 */

import Link from "next/link";
import { FileCheck2, ScrollText, ShieldCheck, UserCheck, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { DISCLAIMER_SURFACES } from "@/lib/legal/surfaces";
import { trustRows } from "@/lib/site/legal-entity";
import { SVI_VERSION } from "@/lib/svi-analysis";
import { DATA_PRINCIPLE_SENTENCE } from "@/lib/valuation-certificate/types";
import { CONTAINER, EYEBROW, FOCUS_RING, MOTION, RHYTHM, TONE_CLASS, headingId } from "./primitives";

export const TRUST_BAND_ID = "trust";

/**
 * The score disclaimer, derived from the registered "General Site Footer"
 * surface rather than re-worded here: the two sentences that say what the
 * content is (general information) and what it is not (financial product
 * advice / AFSL). The operator sentence and the Terms/Privacy pointer are
 * dropped because the band already carries the entity rows and the links.
 */
export function scoreDisclaimerText(): string {
  const body = DISCLAIMER_SURFACES.general_all.body_md.replace(/\*\*/g, "");
  const sentences = body.split(/(?<=\.)\s+/);
  return sentences
    .filter(
      (s) =>
        /general information/i.test(s) || /financial product advice/i.test(s),
    )
    .join(" ")
    .trim();
}

export interface TrustBullet {
  icon: LucideIcon;
  title: string;
  body: string;
  href?: string;
  linkLabel?: string;
}

/** The four bullets, exported so the colocated test can pin their sources. */
export function trustBullets(): TrustBullet[] {
  return [
    {
      icon: ShieldCheck,
      title: "Privacy and evidence controls",
      body:
        "Evidence is stored in Australia under the Privacy Act 1988 (Cth); every document, link and connector is scoped to the startup that supplied it.",
      href: "/legal/privacy",
      linkLabel: "Privacy policy",
    },
    {
      icon: FileCheck2,
      title: "Score disclaimer",
      body: scoreDisclaimerText(),
      href: "/legal/disclaimers",
      linkLabel: "All disclaimers",
    },
    {
      icon: ScrollText,
      title: "Append-only audit trail",
      body:
        "Every score, evidence change and re-run is written to a hash-chained ledger that is never edited in place — a reviewer can replay how a number was reached.",
      href: "/methodology#audit",
      linkLabel: "How the audit trail works",
    },
    {
      icon: UserCheck,
      title: "Founder consent and data ownership",
      body: DATA_PRINCIPLE_SENTENCE,
    },
  ];
}

export interface TrustBandProps {
  /** Section id (default `trust`) — the heading is `${id}-heading`. */
  id?: string;
  eyebrow?: string;
  title?: string;
  /** Methodology version shown in the rows; defaults to the live `SVI_VERSION`. */
  sviVersion?: string;
  className?: string;
}

export function TrustBand({
  id = TRUST_BAND_ID,
  eyebrow = "Who stands behind the score",
  title = "One operator, one methodology, one audit trail.",
  sviVersion = SVI_VERSION,
  className,
}: TrustBandProps) {
  const rows = trustRows(sviVersion);
  const bullets = trustBullets();
  return (
    <section
      id={id}
      aria-labelledby={headingId(id)}
      data-testid="trust-band"
      className={cn("scroll-mt-20 border-t border-line-subtle", TONE_CLASS.sunken, RHYTHM.sm, className)}
    >
      <div className={CONTAINER}>
        <p className={EYEBROW}>{eyebrow}</p>
        <h2
          id={headingId(id)}
          className="mt-2 font-display text-xl font-semibold tracking-tight text-balance text-primary sm:text-2xl"
        >
          {title}
        </h2>

        {/* Entity rows — the same four facts on every page. */}
        <dl
          aria-label="Operating entity and methodology"
          className="mt-6 grid grid-cols-1 gap-x-8 gap-y-3 rounded-xl border border-line-subtle bg-surface p-5 shadow-1 sm:grid-cols-2 lg:grid-cols-4"
        >
          {rows.map((row) => (
            <div key={row.label} className="min-w-0">
              <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">{row.label}</dt>
              <dd
                className="mt-1 break-words text-sm font-medium text-primary [overflow-wrap:anywhere]"
                data-trust-row={row.label}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>

        {/* Trust bullets — four short facts, each with one link at most. */}
        <ul aria-label="Trust controls" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {bullets.map((b) => {
            const Icon = b.icon;
            return (
              <li key={b.title} className="flex min-w-0 gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent-soft text-accent"
                >
                  <Icon strokeWidth={1.75} className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-primary">{b.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-secondary [overflow-wrap:anywhere]">{b.body}</p>
                  {b.href && b.linkLabel ? (
                    <Link
                      href={b.href}
                      className={cn(
                        "mt-1 inline-flex min-h-11 items-center text-xs font-medium text-action hover:text-action-hover",
                        MOTION,
                        FOCUS_RING,
                      )}
                    >
                      {b.linkLabel}
                    </Link>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

export default TrustBand;
