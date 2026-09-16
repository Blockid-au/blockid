// Block 3 · Money on the table — G13-W3-IA3 (spec §B.1 row 3, §B.4 row 3).
//
// Reads the Money Radar tile data (`lib/funding/tile-data.ts`, unchanged):
// grants matched, programs open, capital sources, the A$ behind the top
// matches and the nearest deadline. One CTA: "See matches" →
// /workspace/funding (grants) with an investors link underneath.
//
// Empty state (project lacks industry / state → `no_profile`, or the read
// failed): "Tell us your industry and state to match N grants and M
// programs." → Complete profile → /onboarding?step=2.
//
// Hidden for a member (non-owner) — the page does not mount it (§B.4).

import { Banknote } from "lucide-react";
import type { MoneyRadarTileData } from "@/lib/funding/tile-data";
import { LandingBlock, LandingCta, type LandingContext } from "./landing-grid";
import { formatAud } from "./next-best-action";

export interface MoneyOnTheTableProps {
  ctx: LandingContext;
  data: MoneyRadarTileData | null;
  /** Caller-pays note for a member (kept from the tile). */
  creditNote?: string | null;
}

export function moneyEmptyCopy(data: MoneyRadarTileData | null): string {
  const grants = data?.counts.grants ?? 0;
  const programs = data?.counts.programs ?? 0;
  if (grants > 0 || programs > 0) return `Tell us your industry and state to match ${grants} grants and ${programs} programs.`;
  return "Tell us your industry and state to match the open Australian grants and programs.";
}

/** A$ behind the visible top matches (grants + funded programs); 0 when unknown. */
export function addressableAud(data: MoneyRadarTileData | null): number {
  if (!data) return 0;
  return data.top3.reduce((sum, m) => sum + (typeof m.amount_max_aud === "number" ? m.amount_max_aud : 0), 0);
}

export function MoneyOnTheTable({ ctx, data, creditNote }: MoneyOnTheTableProps) {
  const empty = !data || data.state === "no_profile";
  if (empty) {
    return (
      <LandingBlock
        name="money-on-the-table"
        order={3}
        title="Money on the table"
        icon={Banknote}
        span="third"
        empty
        cta={
          <LandingCta block="money-on-the-table" href="/onboarding?step=2" ctx={ctx} action="complete_profile" testId="landing-money-cta">
            Complete profile
          </LandingCta>
        }
      >
        <p className="text-sm leading-relaxed text-secondary">{moneyEmptyCopy(data)}</p>
      </LandingBlock>
    );
  }

  const total = addressableAud(data);
  const deadline = data.next_deadlines[0] ?? null;
  const top = data.top3[0] ?? null;

  return (
    <LandingBlock
      name="money-on-the-table"
      order={3}
      title="Money on the table"
      icon={Banknote}
      span="third"
      aside={total > 0 ? <span data-landing-money-total className="text-sm font-bold tabular-nums text-bull">{formatAud(total)}</span> : null}
      cta={
        <div className="flex flex-col gap-2">
          <LandingCta block="money-on-the-table" href="/workspace/funding" ctx={ctx} action="see_matches" testId="landing-money-cta">
            See matches
          </LandingCta>
          <LandingCta block="money-on-the-table" href="/workspace/investors" ctx={ctx} action="see_investors" variant="link">
            Investors who match →
          </LandingCta>
          {creditNote ? <p className="text-[11px] text-tertiary">{creditNote}</p> : null}
        </div>
      }
    >
      <dl className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-xl bg-surface-sunken px-2 py-2">
          <dd className="text-lg font-bold tabular-nums text-primary" data-landing-grants>{data.counts.grants}</dd>
          <dt className="text-[10px] uppercase tracking-wide text-tertiary">Grants</dt>
        </div>
        <div className="rounded-xl bg-surface-sunken px-2 py-2">
          <dd className="text-lg font-bold tabular-nums text-primary" data-landing-programs>{data.counts.programs}</dd>
          <dt className="text-[10px] uppercase tracking-wide text-tertiary">Programs</dt>
        </div>
        <div className="rounded-xl bg-surface-sunken px-2 py-2">
          <dd className="text-lg font-bold tabular-nums text-primary" data-landing-capital>{data.counts.capital}</dd>
          <dt className="text-[10px] uppercase tracking-wide text-tertiary">Capital</dt>
        </div>
      </dl>
      {top ? (
        <p className="mt-3 truncate text-xs text-secondary" title={top.why}>
          Top match: <span className="font-medium text-primary">{top.name}</span>
        </p>
      ) : null}
      {deadline ? (
        <p className="mt-1 text-xs text-secondary" data-landing-deadline>
          Next deadline: {deadline.name} · {deadline.date_label}
        </p>
      ) : (
        <p className="mt-1 text-xs text-tertiary">{data.next_step}</p>
      )}
    </LandingBlock>
  );
}
