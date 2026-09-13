// Colocated render test for the acqui-hire pieces of the exit page (S26-B):
// the editable assumption fields (team size, per-engineer value with the AU
// range note, retention share + 2/3-year vesting, IP premium) and the
// breakdown card (team value, retention pool, equity consideration,
// vesting schedule, assumptions).

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { computeAcquiHirePrice } from "@/lib/exit-modeling";
import { ACQUI_HIRE_FORM_DEFAULTS, AcquiHireBreakdownCard, AcquiHireFields } from "./exit-client";

describe("AcquiHireFields", () => {
  it("renders every editable assumption with the defaults and the AU range note", () => {
    const html = renderToStaticMarkup(<AcquiHireFields form={ACQUI_HIRE_FORM_DEFAULTS} onChange={() => {}} />);
    expect(html).toContain('data-testid="acqui-hire-fields"');
    expect(html).toContain('data-testid="acqui-team-size"');
    expect(html).toContain('value="5"');
    expect(html).toContain('value="1000000"');
    expect(html).toContain("A$500K–A$1.5M per retained engineer");
    expect(html).toContain('data-testid="acqui-retention-pct"');
    expect(html).toContain('value="40"');
    expect(html).toContain("2 years");
    expect(html).toContain("3 years");
    expect(html).toContain('data-testid="acqui-ip-premium"');
    expect(html).toContain("Low or nil in most acqui-hires");
  });
});

describe("AcquiHireBreakdownCard", () => {
  it("shows the price build-up, the retention schedule and the assumptions", () => {
    const b = computeAcquiHirePrice({ teamSize: 4, perEngineerValueAud: 750_000, retentionBonusShare: 0.5, retentionYears: 2, ipPremiumAud: 200_000 });
    const html = renderToStaticMarkup(<AcquiHireBreakdownCard breakdown={b} />);
    expect(html).toContain('data-testid="acqui-hire-breakdown"');
    expect(html).toContain("Team (4 × $750.0K)");
    expect(html).toContain("$3.00M");
    expect(html).toContain("$200.0K");
    expect(html).toContain("Retention pool (50%, 2 yrs)");
    expect(html).toContain("−$1.60M");
    expect(html).toContain('data-testid="acqui-equity"');
    expect(html).toContain("Year 1: $800.0K");
    expect(html).toContain("Year 2: $800.0K");
    expect(html).toContain("(cum. $1.60M)");
    expect(html).toContain("Per-engineer retention value is an assumption");
    expect(html).toContain("A$200,000 is attributed to IP");
    expect(html).not.toMatch(/NaN/);
  });
});
