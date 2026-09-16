/**
 * InvestorMatchesPanel — the investor reverse-match panel (T0251, plan §4h
 * Growth row), rendered by the /workspace/investors Matches tab (S-IA2 —
 * moved off the /workspace/funding tabs). Server-safe: no hooks, no state;
 * the caller loads `matchInvestorsForProject(...)` and the Growth gate.
 *
 * Starter sees the locked card (copy.ts `growth.investorsLocked`); Growth
 * sees the ranked investors or the never-blank empty state (queue line + a
 * programs-directory link for the founder's capital).
 */

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, Lock, Mail, Users } from "lucide-react";
import type { InvestorMatch } from "@/lib/funding/investor-match";
import { FUNDING_COPY } from "@/lib/funding/copy";
import { capitalSlug } from "@/lib/funding/directory";

export interface InvestorMatchesPanelProps {
  /** Growth extras unlocked (`hasGrowthExtras`); false → the locked card. */
  unlocked: boolean;
  investors: InvestorMatch[];
  /** Founder's nearest capital ("Sydney") for the empty-state programs link; null → the directory index. */
  capital: string | null;
}

const UPGRADE_HREF = "/pricing?feature=report.premium&from=/workspace/investors";

function LockedCard({ title, body, icon }: { title: string; body: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-6" data-growth-locked>
      <p className="inline-flex items-center gap-2 font-semibold text-primary">
        {icon} {title} <Lock className="h-3.5 w-3.5 text-tertiary" aria-hidden />
      </p>
      <p className="mt-1 text-sm text-secondary">{body}</p>
      <Link href={UPGRADE_HREF} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-action">
        See Growth <ArrowRight className="h-3.5 w-3.5" aria-hidden />
      </Link>
    </div>
  );
}

export function InvestorMatchesPanel({ unlocked, investors, capital }: InvestorMatchesPanelProps) {
  if (!unlocked) {
    return (
      <section aria-label="Investors who match" data-investors>
        <LockedCard
          title={FUNDING_COPY.growth.investorsTitle}
          body={FUNDING_COPY.growth.investorsLocked}
          icon={<Users className="h-4 w-4 text-action" aria-hidden />}
        />
      </section>
    );
  }
  // Never-blank rule: zero opted-in investors → the queue line + a way to meet
  // investors in person via the programs directory for the founder's capital.
  const programsHref = capital ? `/funding/programs/${capitalSlug(capital)}` : "/funding/programs";
  return (
    <section aria-label="Investors who match" data-investors data-count={investors.length}>
      <p className="text-sm text-secondary">{FUNDING_COPY.growth.investorsIntro}</p>
      {investors.length === 0 ? (
        <div className="mt-4 rounded-2xl border border-dashed border-line-subtle bg-surface-sunken p-5 text-sm text-secondary" data-no-investors>
          <p>{FUNDING_COPY.growth.noInvestors}</p>
          <Link href={programsHref} className="mt-3 inline-flex items-center gap-1 font-semibold text-action" data-no-investors-programs>
            {FUNDING_COPY.growth.noInvestorsBrowse} <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </Link>
        </div>
      ) : (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {investors.map((inv) => (
            // Card shows name, firm, thesis and the preference axes only — the
            // investor's email is never on the wire (InvestorMatch has no such field).
            <li key={inv.investor_id} className="rounded-2xl border border-line-subtle bg-surface p-4" data-investor={inv.investor_id} data-score={inv.score}>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-primary" data-investor-name>{inv.name}</p>
                  {inv.firm ? <p className="text-xs text-secondary" data-investor-firm>{inv.firm}</p> : null}
                </div>
                <span className="rounded-full bg-action/10 px-2 py-0.5 text-xs font-semibold text-action">Fit {inv.score}</span>
              </div>
              {inv.thesis ? <p className="mt-2 text-sm text-secondary" data-investor-thesis>“{inv.thesis}”</p> : null}
              <ul className="mt-2 space-y-1 text-xs text-secondary">
                {inv.reasons.map((r) => (
                  <li key={r}>· {r}</li>
                ))}
                {inv.gaps.map((g) => (
                  <li key={`gap-${g}`} className="text-tertiary">· Outside their {g} preference</li>
                ))}
              </ul>
              {inv.cheque_band && inv.cheque_band !== "any" ? (
                <p className="mt-2 text-xs text-tertiary">Cheque: {inv.cheque_band.replace(/_/g, " ")}</p>
              ) : null}
              <a
                href={inv.intro_href}
                className="mt-3 inline-flex items-center gap-1 rounded-lg border border-line-subtle px-3 py-1.5 text-xs font-semibold text-primary"
                data-request-intro
              >
                <Mail className="h-3.5 w-3.5" aria-hidden /> {FUNDING_COPY.growth.requestIntro}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default InvestorMatchesPanel;
