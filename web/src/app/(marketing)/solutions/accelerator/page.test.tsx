// Colocated test for /solutions/accelerator and its /vi mirror — the BlockID
// Cohort page (G21 P0-C; G25 retired the paid pilot): the H1, the opening
// lines, the six-stage workflow with only shipped bullets, "Humans make the
// decision", the Cohort offer block at `#cohort` (eight inclusions, six
// metrics, no amount), the Cohort 25 / Cohort 100 rungs at `#plans` (the
// sold ladder's card-required trial links), NO pilot of any kind — no
// `#pilot`, no A$1,500 / A$2,500, no contact fallback, no coupon — and the
// SEO contract (S8-A).
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
import { GENERATED_PLANS_BY_ID } from "@/config/pricing/plans.generated";
import {
  ACCELERATOR_START_COHORT_HREF,
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

  it("hero: the FI H1 + sub, primary 'Start a cohort' → the Cohort 25 annual trial sign-up, secondary → the sample cohort", () => {
    expect(props.headline).toBe(H1_EN);
    expect(props.personaLine).toBe(
      "Score applicants consistently, identify the companies that need deeper review, target mentor support and show sponsors measurable progress from intake to demo day.",
    );
    expect(props.primaryCtaLabel).toBe("Start a cohort");
    expect(props.primaryCtaHref).toBe(ACCELERATOR_START_COHORT_HREF);
    expect(ACCELERATOR_START_COHORT_HREF).toBe("/signup?segment=evaluator&plan=accelerator_starter&trial=1&interval=annual");
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

  it("six stages in order, three shipped bullets each — the P2 state (CSV import, confidence / verification / change columns, filters, shortlist, overrides with reason codes, snapshots, Cohort Report PDF / CSV, demo-day pack, onboarding metrics)", () => {
    expect(props.journey?.map((s) => s.headline)).toEqual(["Intake", "Assessment", "Selection", "Program", "Demo day", "Sponsor reporting"]);
    const bullets = props.journey!.flatMap((s) => s.bullets);
    expect(bullets).toHaveLength(18);
    const text = bullets.join("\n");
    expect(text).toMatch(/\/apply\/<slug>/);
    expect(text).toMatch(/deck upload/i);
    expect(text).toMatch(/consent/i);
    expect(text).toMatch(/Import an existing cohort as CSV/);
    expect(text).toMatch(/confidence level/i);
    expect(text).toMatch(/verification/i);
    expect(text).toMatch(/change since the last snapshot/i);
    expect(text).toMatch(/Cohort snapshots/);
    expect(text).toMatch(/filter by stage, sector/i);
    expect(text).toMatch(/Shortlist, decision and conviction/);
    expect(text).toMatch(/override a dimension score with a reason code/);
    expect(text).toMatch(/Feedback letters to non-selected applicants/);
    expect(text).toMatch(/Progress radar/i);
    expect(text).toMatch(/mentor-gap list/i);
    expect(text).toMatch(/BlockID Dossier/);
    expect(text).toMatch(/demo-day pack/i);
    expect(text).toMatch(/Cohort Report assembled from the cohort record/);
    expect(text).toMatch(/PDF and CSV export of the Cohort Report/);
    expect(text).toMatch(/Onboarding success metrics/);
    expect(text).not.toMatch(/pilot/i);
    // The retired names never come back; nothing is promised.
    expect(text).not.toMatch(/quarterly sponsor report|Investor Dossier|custom[- ]weight/i);
    expect(text).not.toMatch(/coming soon|roadmap|P2\b/);
  });

  it("'Humans make the decision' statement, verbatim", () => {
    expect(props.statement?.title).toBe("Humans make the decision");
    expect(props.statement?.body).toBe("BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.");
  });

  it("the Cohort offer block (G25): copy from the catalogue, eight inclusions, six metrics, no amount; the two rungs with token prices and the trial sign-up links", () => {
    const offer = props.cohortOffer!;
    expect(offer.title).toBe("What a Cohort plan delivers");
    expect(offer.includes).toHaveLength(8);
    expect(offer.metrics).toHaveLength(6);
    expect(offer.metrics.join("\n")).toMatch(/Review time per startup/);
    expect(offer.metrics.join("\n")).toMatch(/renewal intent/i);
    expect(JSON.stringify(offer)).not.toMatch(/pilot|A\$\s?\d/i);
    const tiers = props.tiers!;
    expect(tiers.items.map((t) => t.name)).toEqual(["Cohort 25", "Cohort 100"]);
    expect(tiers.items[0]?.price).toBe("{cohortAnnualPrice} a year");
    expect(tiers.items[1]?.price).toBe("{cohort100AnnualPrice} a year");
    expect(tiers.items[0]?.href).toBe(ACCELERATOR_START_COHORT_HREF);
    expect(tiers.items[1]?.href).toContain("plan=accelerator_growth");
    expect(tiers.items[1]?.href).toContain("trial=1");
    expect(props.pilotOffer).toBeUndefined();
  });

  it("no pilot of any kind, no coupon, no PhD, no literal price outside tokens, no old journey", () => {
    const p = buildAcceleratorProps(EN, "en");
    const text = JSON.stringify([
      p.headline, p.personaLine, p.emotionalLine, p.outcomeLine, p.primaryCtaLabel, p.secondaryCtaLabel,
      p.problem, p.benefits, p.journey, p.statement, p.cohortOffer, p.tiers, p.faqs.map((f) => [f.q, f.a]),
    ]);
    expect(text).not.toMatch(/pilot|coupon|credit(ed)? against|free pilot|comped|letter of intent|LOI|Five pilots|60 applicants|admin grant|no card required/i);
    expect(text).not.toMatch(/PhD/);
    expect(text.replace(/\{[a-zA-Z0-9]+\}/g, "")).not.toMatch(/A\$\s?\d/);
    expect(text).not.toMatch(/Day 0-30|Day 31-60/);
  });

  it("the Vietnamese twin carries the same structure (six stages, eight inclusions, six metrics, two rungs) and no 'thí điểm'", () => {
    const p = buildAcceleratorProps(VI, "vi");
    expect(p.headline).toBe("Biến đợt tuyển sinh startup tiếp theo thành một khoá có thể so sánh, dựa trên bằng chứng.");
    expect(p.primaryCtaLabel).toBe("Bắt đầu một khoá");
    expect(p.primaryCtaHref).toBe(ACCELERATOR_START_COHORT_HREF);
    expect(p.journey).toHaveLength(6);
    expect(p.cohortOffer?.includes).toHaveLength(8);
    expect(p.cohortOffer?.metrics).toHaveLength(6);
    expect(p.tiers?.items).toHaveLength(2);
    expect(p.problem?.lines).toHaveLength(3);
    expect(JSON.stringify([p.cohortOffer, p.tiers, p.journey, p.faqs])).not.toMatch(/thí điểm|pilot/i);
  });

  it("investor and advisor personas do not carry the Cohort offer block", () => {
    expect(buildInvestorProps(EN).cohortOffer).toBeUndefined();
    expect(buildAdvisorProps(EN).cohortOffer).toBeUndefined();
  });
});

describe("/solutions/accelerator — rendered (EN)", () => {
  it("H1, #cohort offer (8 inclusions, 6 metrics), #plans with Cohort 25 / 100 catalogue prices and trial links, no #pilot / pilot price / contact fallback, no token left", async () => {
    const out = await html(await SolutionsAcceleratorPage());
    expect(out.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(out).toContain(H1_EN);
    expect(out).toMatch(/<section[^>]*id="cohort"/);
    expect(out).toContain('data-testid="cohort-offer"');
    expect(out).toContain('data-testid="cohort-offer-includes"');
    expect(out).toContain('data-testid="cohort-offer-metrics"');
    expect(out).toMatch(/<section[^>]*id="plans"/);
    expect(out).toContain('data-testid="solutions-tiers"');
    expect(out).toContain(`href="${ACCELERATOR_START_COHORT_HREF.replace(/&/g, "&amp;")}"`);
    expect(out).toContain("Start a cohort");
    expect(out).not.toMatch(/id="pilot"/);
    expect(out).not.toMatch(/pilot/i);
    expect(out).not.toContain("/contact?topic=pilot");
    expect(out).not.toContain("A$1,500");
    expect(out).not.toContain("A$2,500");
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
    // the two Cohort figures are the only A$ on the page (the sold ladder, unchanged)
    const amounts = new Set([...out.matchAll(/A\$([\d,]+)/g)].map((m) => m[1]));
    expect([...amounts].sort()).toEqual([cohort25.toLocaleString("en-AU"), cohort100.toLocaleString("en-AU")].sort());
  });

  it("renders the Vietnamese mirror with the same #cohort + #plans blocks and no 'thí điểm'", async () => {
    const out = await html(await ViSolutionsAcceleratorPage());
    expect(out).toMatch(/<section[^>]*id="cohort"/);
    expect(out).toMatch(/<section[^>]*id="plans"/);
    expect(out).toContain(`href="${ACCELERATOR_START_COHORT_HREF.replace(/&/g, "&amp;")}"`);
    expect(out).not.toMatch(/id="pilot"|thí điểm|pilot/i);
    expect(out).not.toContain("/contact?topic=pilot");
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
