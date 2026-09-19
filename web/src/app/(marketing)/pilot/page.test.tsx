// Colocated test for /pilot (G16-C). Pins: indexable metadata with the
// canonical, the offer v2 terms (30 d · ≤ 60 · cap 5 · admin grant · no
// card), the four "in return" items, "not included", the 7 success criteria
// verbatim from lib/pilots/offer (t2 § 3), the data sentence verbatim, the
// form with the honeypot + every field, the Program price from plans-v2 (no
// literal), never "PhD". The marketing shell mounts NavV2 → useRouter(), so
// it is mocked; the client form renders to static HTML.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { PLANS_V2, formatAud } from "@/lib/plans-v2";
import { DATA_PRINCIPLE_SENTENCE, PILOT_CAP, PILOT_MAX_APPLICANTS, DEFAULT_PILOT_DAYS, PILOT_SUCCESS_CRITERIA, PILOT_IN_RETURN, PILOT_NOT_INCLUDED, programListPrice, defaultPilotCredits } from "@/lib/pilots/offer";
import { HONEYPOT_FIELD } from "@/lib/pilots/applications";
import PilotPage, { generateMetadata } from "./page";
import { defaultIntakeMonth } from "./pilot-apply-form";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");

describe("/pilot metadata (F-3: public + indexable)", () => {
  it("indexable, canonical /pilot, title + description carry the offer figures", async () => {
    const m = await generateMetadata();
    expect(m.robots).toEqual({ index: true, follow: true });
    expect(m.alternates?.canonical).toBe("https://blockid.au/pilot");
    expect(String(m.title)).toContain("free cohort scoring");
    expect(String(m.description)).toContain(`${PILOT_MAX_APPLICANTS} applicants`);
    expect(String(m.description)).toContain(`${DEFAULT_PILOT_DAYS} days`);
    expect(String(m.description)).toContain(`${PILOT_CAP} pilots`);
  });
});

describe("/pilot page", () => {
  it("renders the offer v2 terms, in-return, not-included, the 7 criteria and the data sentence verbatim", async () => {
    const out = await html(<PilotPage />);
    expect(out).toContain("<h1");
    expect(out).toContain("Free cohort scoring for one intake");
    expect(out).toContain('data-testid="pilot-terms"');
    expect(out).toContain(`up to ${PILOT_MAX_APPLICANTS} applicants`);
    expect(out).toContain(`${DEFAULT_PILOT_DAYS} days from the first batch run`);
    expect(out).toContain(`${PILOT_CAP} pilots. The sixth pays list price.`);
    expect(out).toContain("admin credit grant");
    expect(out).toContain("no card required");
    expect(out).toContain("No Stripe coupon");
    for (const s of PILOT_IN_RETURN) expect(out).toContain(esc(s));
    for (const s of PILOT_NOT_INCLUDED) expect(out).toContain(esc(s));
    expect(out).toContain('data-testid="pilot-criteria"');
    expect(PILOT_SUCCESS_CRITERIA).toHaveLength(7);
    for (const c of PILOT_SUCCESS_CRITERIA) {
      expect(out).toContain(`data-criterion="${c.n}"`);
      expect(out).toContain(esc(c.criterion));
      expect(out).toContain(esc(c.passMark));
    }
    expect(out).toContain(`data-testid="pilot-data-principle">${esc(DATA_PRINCIPLE_SENTENCE)}<`);
    expect(out).not.toMatch(/PhD/);
  });

  it("every A$ figure comes from plans-v2 (Program list price) — never a stale literal", async () => {
    const out = await html(<PilotPage />);
    const program = PLANS_V2.find((p) => p.id === "investor_vc_small")!;
    expect(programListPrice()).toBe(formatAud(program.monthly_aud));
    expect(out).toContain(esc(`${programListPrice()}/mo`));
    expect(out).not.toContain("A$5.50");
    expect(defaultPilotCredits()).toBe(180);
  });

  it("the application form renders with the honeypot and the six fields, posting nothing inline (CSP)", async () => {
    const out = await html(<PilotPage />);
    expect(out).toContain('data-testid="pilot-apply-form"');
    expect(out).toContain(`name="${HONEYPOT_FIELD}"`);
    expect(out).toContain('tabindex="-1"');
    for (const name of ["program_name", "contact_name", "email", "cohort_size", "intake_month", "message"]) expect(out).toContain(`name="${name}"`);
    expect(out).toContain('type="month"');
    expect(out).not.toContain("<script");
    expect(out).toContain('id="apply"');
    expect(out).toContain('href="#apply"');
  });

  it("defaultIntakeMonth is two months out, YYYY-MM, year rollover safe", () => {
    expect(defaultIntakeMonth(new Date("2026-09-19T00:00:00Z"))).toBe("2026-11");
    expect(defaultIntakeMonth(new Date("2026-11-30T00:00:00Z"))).toBe("2027-01");
    expect(defaultIntakeMonth(new Date("2026-12-01T00:00:00Z"))).toBe("2027-02");
  });
});
