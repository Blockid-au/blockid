// Shared, pure derivation of the investor reverse-match inputs (T0251) from
// the founder's latest Money Radar report + intake prefill + project row.
//
// Used by /workspace/funding (events + capital-map location) and by the
// /workspace/investors Matches tab (S-IA2 — the investor panel moved off the
// funding tabs), so both surfaces derive the same `state` / `capital` /
// InvestorMatchProject from the same inputs. No "server-only": nothing here
// touches the DB — the callers load the row / prefill / SVI themselves.

import { parseFundingIntake, NOT_INCORPORATED, type IntakeParse } from "@/lib/funding/intake";
import { capitalForCity } from "@/lib/funding/seed-map";
import type { FundingReportRow } from "@/lib/funding/reports";
import type { InvestorMatchProject } from "@/lib/funding/investor-match";

export interface FundingLocation {
  /** Parsed intake of the latest report; null when the founder has no report row. */
  intake: IntakeParse | null;
  /** AU state code (or `NOT_INCORPORATED`) from the report intake, else the prefill. */
  state: string | null;
  city: string | null;
  /** Founder's nearest capital ("Sydney"); null = no usable location ("Remote"). */
  capital: string | null;
}

/** Location + parsed intake for a founder's latest report, falling back to the intake prefill's state. */
export function fundingLocationFor(row: Pick<FundingReportRow, "intake"> | null, prefillState: string | null | undefined): FundingLocation {
  const intake = row ? parseFundingIntake(row.intake) : null;
  const state = intake?.ok
    ? intake.intake.state === NOT_INCORPORATED
      ? intake.intake.based_state ?? null
      : intake.intake.state
    : prefillState ?? null;
  const city = intake?.ok ? intake.intake.city ?? null : null;
  const capitalGuess = city || (state && state !== NOT_INCORPORATED) ? capitalForCity(city, state) : "Remote";
  // "Remote" = no usable location → show every capital's events rather than none.
  const capital = capitalGuess === "Remote" ? null : capitalGuess;
  return { intake, state, city, capital };
}

/** State for the match — never the `not_incorporated` sentinel. */
export function matchStateFor(state: string | null): string | null {
  return state && state !== NOT_INCORPORATED ? state : null;
}

/** The `matchInvestorsForProject` input built from the project + report intake + latest SVI. */
export function investorMatchProjectFor(
  project: { id: string; name: string; industry: string | null; stage: number } | null,
  location: Pick<FundingLocation, "intake" | "state">,
  svi: number | null,
): InvestorMatchProject {
  const intake = location.intake?.ok ? location.intake.intake : null;
  return {
    id: project?.id ?? null,
    name: project?.name ?? "Your startup",
    industry: project?.industry ?? intake?.industry_tags?.[0] ?? null,
    stage: intake ? intake.stage : project?.stage ?? null,
    state: matchStateFor(location.state),
    svi,
  };
}
