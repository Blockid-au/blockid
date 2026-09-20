// Colocated test for /solutions/accelerator and its /vi mirror — the BlockID
// Cohort page (G21 P0-C): the H1, the opening lines, the six-stage workflow
// with only shipped bullets, "Humans make the decision", the paid Cohort
// Validation Pilot block at `#pilot` (two offer cards from PILOT_SKUS, the
// contact fallback when the price is not minted, the checkout button when it
// is), the Cohort 25 / Cohort 100 rungs after it, no free / comped pilot
// copy, and the SEO contract (S8-A).
//
// The marketing shell mounts NavV2 → useRouter(), which throws outside an
// app-router context, so it is mocked to a pass-through.

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { PILOT_SKUS, formatPilotPrice } from "@/lib/pricing/pilot-skus";
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import {
  ACCELERATOR_PILOT_ANCHOR,
  SAMPLE_COHORT_HREF,
  buildAcceleratorProps,
  buildAdvisorProps,
  buildInvestorProps,
} from "../evaluator-page-props";
import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import SolutionsAcceleratorPage, { generateMetadata } from "./page";
import ViSolutionsAcceleratorPage from "../../../vi/solutions/accelerator/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

const H1_EN = "Turn your next startup intake into a comparable, evidence-backed cohort.";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/solutions/accelerator — props (G21 P0-C)", () => {
  const props = buildAcceleratorProps(EN, "en");

  it("hero: the FI H1 + sub, primary → #pilot, secondary → the sample cohort", () => {
    expect(props.headline).toBe(H1_EN);
    expect(props.personaLine).toBe(
      "Score applicants consistently, identify the companies that need deeper review, target mentor support and show sponsors measurable progress from intake to demo day.",
    );
    expect(props.primaryCtaLabel).toBe("Book a paid pilot");
    expect(props.primaryCtaHref).toBe(ACCELERATOR_PILOT_ANCHOR);
    expect(props.secondaryCtaLabel).toBe("View sample cohort");
    expect(props.secondaryCtaHref).toBe(SAMPLE_COHORT_HREF);
  });

  it("opening lines: three problems, one resolution", () => {
    expect(props.problem?.lines).toEqual([
      "Your applicants arrive in different formats.",
      "Your reviewers use different judgement.",
      "Your founders receive different feedback.",
    ]);
    expect(props.problem?.resolution).toBe("BlockID creates one consistent assessment layer.");
  });

  it("six stages in order, two shipped bullets each, none of the P2 features (CSV import, overrides, filters, custom-weight scoring)", () => {
    expect(props.journey?.map((s) => s.headline)).toEqual(["Intake", "Assessment", "Selection", "Program", "Demo day", "Sponsor reporting"]);
    const bullets = props.journey!.flatMap((s) => s.bullets);
    expect(bullets).toHaveLength(12);
    const text = bullets.join("\n");
    expect(text).toMatch(/\/apply\/<slug>/);
    expect(text).toMatch(/deck upload/i);
    expect(text).toMatch(/consent/i);
    expect(text).toMatch(/confidence level/i);
    expect(text).toMatch(/sortable cohort table/i);
    expect(text).toMatch(/Decision and conviction/);
    expect(text).toMatch(/Progress radar/i);
    expect(text).toMatch(/Investor Dossier/);
    expect(text).toMatch(/quarterly sponsor report/i);
    expect(text).toMatch(/CSV export/);
    expect(text).not.toMatch(/CSV import|override|filter|custom[- ]weight/i);
    expect(text).not.toMatch(/coming soon|roadmap|P2/);
  });

  it("'Humans make the decision' statement, verbatim", () => {
    expect(props.statement?.title).toBe("Humans make the decision");
    expect(props.statement?.body).toBe("BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.");
  });

  it("the paid pilot block: copy from the catalogue, eight inclusions, six metrics, Cohort 25 / 100 after, unconfigured by default", () => {
    const pilot = props.pilotOffer!;
    expect(pilot.copy.title).toBe("BlockID Cohort Validation Pilot");
    expect(pilot.copy.includes).toHaveLength(8);
    expect(pilot.copy.metrics).toHaveLength(6);
    expect(pilot.copy.metrics.join("\n")).toMatch(/Review time per startup/);
    expect(pilot.copy.metrics.join("\n")).toMatch(/renewal intent/i);
    expect(pilot.configured).toEqual({ cohort_pilot_25: false, cohort_pilot_50: false });
    expect(pilot.returnPath).toBe("/solutions/accelerator#pilot");
    expect(pilot.copy.afterTiers?.map((t) => t.name)).toEqual(["Cohort 25", "Cohort 100"]);
    expect(pilot.copy.afterTiers?.[0]?.price).toBe("{cohortAnnualPrice} a year");
    expect(pilot.copy.afterTiers?.[1]?.price).toBe("{cohort100AnnualPrice} a year");
    expect(pilot.copy.afterTiers?.[0]?.href).toContain("plan=accelerator_starter");
    expect(pilot.copy.afterTiers?.[1]?.href).toContain("plan=accelerator_growth");
  });

  it("no free / comped pilot copy, no PhD, no literal price outside tokens, no old journey", () => {
    const p = buildAcceleratorProps(EN, "en");
    const text = JSON.stringify([
      p.headline, p.personaLine, p.emotionalLine, p.outcomeLine, p.primaryCtaLabel, p.secondaryCtaLabel,
      p.problem, p.benefits, p.journey, p.statement, p.pilotOffer?.copy, p.faqs.map((f) => [f.q, f.a]),
    ]);
    expect(text).not.toMatch(/free pilot|comped|letter of intent|LOI|Five pilots|60 applicants|admin grant|no card required/i);
    expect(text).not.toMatch(/PhD/);
    expect(text.replace(/\{[a-zA-Z0-9]+\}/g, "")).not.toMatch(/A\$\s?\d/);
    expect(text).not.toMatch(/Day 0-30|Day 31-60/);
  });

  it("the Vietnamese twin carries the same structure (six stages, eight inclusions, six metrics, two rungs)", () => {
    const p = buildAcceleratorProps(VI, "vi");
    expect(p.headline).toBe("Biến đợt tuyển sinh startup tiếp theo thành một khoá có thể so sánh, dựa trên bằng chứng.");
    expect(p.primaryCtaHref).toBe(ACCELERATOR_PILOT_ANCHOR);
    expect(p.journey).toHaveLength(6);
    expect(p.pilotOffer?.copy.includes).toHaveLength(8);
    expect(p.pilotOffer?.copy.metrics).toHaveLength(6);
    expect(p.pilotOffer?.copy.afterTiers).toHaveLength(2);
    expect(p.pilotOffer?.returnPath).toBe("/vi/solutions/accelerator#pilot");
    expect(p.problem?.lines).toHaveLength(3);
  });

  it("investor and advisor personas do not carry the pilot block", () => {
    expect(buildInvestorProps(EN).pilotOffer).toBeUndefined();
    expect(buildAdvisorProps(EN).pilotOffer).toBeUndefined();
  });
});

describe("/solutions/accelerator — rendered (EN)", () => {
  it("H1, #pilot section, two offer cards with the SKU prices inc. GST, contact fallback links, metrics, Cohort 25 / 100 with catalogue prices, no token left", async () => {
    const out = await html(await SolutionsAcceleratorPage());
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain(H1_EN);
    expect(out).toMatch(/<section[^>]*id="pilot"/);
    expect(out).toContain('data-testid="pilot-offer"');
    expect(out.match(/data-testid="pilot-offer-card"/g)).toHaveLength(2);
    expect(out).toContain('data-sku="cohort_pilot_25"');
    expect(out).toContain('data-sku="cohort_pilot_50"');
    expect(out).toContain(formatPilotPrice("cohort_pilot_25"));
    expect(out).toContain(formatPilotPrice("cohort_pilot_50"));
    expect(out).toContain("inc. GST");
    expect(out).toContain("quote before you pay");
    // price env vars are unset in the unit run → both buttons are contact links
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_25"');
    expect(out).toContain('data-testid="pilot-buy-cohort_pilot_50"');
    expect(out.match(/data-pilot-mode="contact"/g)).toHaveLength(2);
    expect(out).toContain('href="/contact?topic=pilot"');
    expect(out).toContain('data-testid="pilot-metrics"');
    expect(out).toContain('data-testid="pilot-after"');
    const cohort25 = GENERATED_PLANS_BY_ID.accelerator_starter!.annual_price_aud_cents / 100;
    const cohort100 = GENERATED_PLANS_BY_ID.accelerator_growth!.annual_price_aud_cents / 100;
    expect(out).toContain(`A$${cohort25.toLocaleString("en-AU")} a year`);
    expect(out).toContain(`A$${cohort100.toLocaleString("en-AU")} a year`);
    expect(out).toContain('data-testid="solutions-problem"');
    expect(out).toContain('data-testid="solutions-statement"');
    expect(out).toContain("Humans make the decision");
    expect(out).toContain(`href="${SAMPLE_COHORT_HREF}"`);
    expect(out).not.toMatch(/\{[a-zA-Z0-9]+\}/);
    expect(out).not.toMatch(/free pilot|Free cohort scoring/i);
    // the six stages carry only shipped bullets
    expect(out).not.toMatch(/CSV import/);
    // the two pilot amounts and the two Cohort figures are the only A$ on the page
    const amounts = new Set([...out.matchAll(/A\$([\d,]+)/g)].map((m) => m[1]));
    expect([...amounts].sort()).toEqual(
      [
        String(PILOT_SKUS.cohort_pilot_25.amountInclGstCents / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
        String(PILOT_SKUS.cohort_pilot_50.amountInclGstCents / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ","),
        cohort25.toLocaleString("en-AU"),
        cohort100.toLocaleString("en-AU"),
      ].sort(),
    );
  });

  it("renders the Vietnamese mirror with the same #pilot block", async () => {
    const out = await html(await ViSolutionsAcceleratorPage());
    expect(out).toMatch(/<section[^>]*id="pilot"/);
    expect(out.match(/data-testid="pilot-offer-card"/g)).toHaveLength(2);
    expect(out).toContain(formatPilotPrice("cohort_pilot_25"));
    expect(out).toContain('href="/contact?topic=pilot"');
    expect(out).not.toMatch(/\{[a-zA-Z0-9]+\}/);
  });
});

describe("/solutions/accelerator — SEO (S8-A)", () => {
  it("metadata: ≤ 60 title without a doubled brand, 140–160 description, hreflang pair, OG image", async () => {
    const meta = await generateMetadata();
    expect(String(meta.title)).toBe("Turn your next intake into a comparable cohort");
    expect(`${String(meta.title)} | BlockID.au`.length).toBeLessThanOrEqual(60);
    expect(String(meta.description).length).toBeGreaterThanOrEqual(140);
    expect(String(meta.description).length).toBeLessThanOrEqual(160);
    expect(meta.alternates?.canonical).toBe("https://blockid.au/solutions/accelerator");
    expect(meta.alternates?.languages?.vi).toBe("https://blockid.au/vi/solutions/accelerator");
    expect((meta.openGraph as { images?: unknown[] }).images).toHaveLength(1);
  });

  it("emits exactly one FAQPage (the visible FAQ) and one BreadcrumbList, both valid; one H1", async () => {
    const out = await html(await SolutionsAcceleratorPage());
    const blocks = extractJsonLd(out);
    expect(blocks.filter((b) => b["@type"] === "FAQPage")).toHaveLength(1);
    expect(blocks.filter((b) => b["@type"] === "BreadcrumbList")).toHaveLength(1);
    for (const b of blocks) expect(validateJsonLd(b), String(b["@type"])).toEqual({ ok: true, errors: [] });
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    const vi = await html(await ViSolutionsAcceleratorPage());
    expect(JSON.stringify(extractJsonLd(vi).find((b) => b["@type"] === "BreadcrumbList"))).toContain("https://blockid.au/vi/solutions/accelerator");
  });
});
