// Colocated test for /solutions/accelerator and its /vi mirror — the
// "Run a free pilot on your next intake" CTA (G12 traction T2, S6-C;
// Pricing v4 2026-09-16 moved it onto the Intake link SKU).
//
// The contact form does not read `?intent=` / `?plan=`, so the pilot button
// must land on the evaluator signup with the Intake link pre-selected. This
// suite pins the href, the label in both languages, and that the card
// renders on the accelerator page only (investor / advisor never show it).
//
// The marketing shell mounts NavV2 → useRouter(), which throws outside an
// app-router context, so it is mocked to a pass-through (same pattern as
// `../../compare/page.test.tsx`).

import { describe, expect, it, vi } from "vitest";
import { renderToReadableStream } from "react-dom/server";

vi.mock("@/components/marketing/marketing-shell", () => ({
  MarketingShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import en from "@/lib/i18n/messages/en.json";
import vi_ from "@/lib/i18n/messages/vi.json";
import type { Messages } from "@/lib/i18n/t";
import { EVALUATOR_TRIAL_PLAN_IDS, resolveSignupSegment } from "@/lib/plans/signup-plans";
import {
  ACCELERATOR_PILOT_HREF,
  buildAcceleratorProps,
  buildAdvisorProps,
  buildInvestorProps,
} from "../evaluator-page-props";
import { extractJsonLd, validateJsonLd } from "@/lib/seo/structured-data";
import SolutionsAcceleratorPage, { generateMetadata } from "./page";
import ViSolutionsAcceleratorPage from "../../../vi/solutions/accelerator/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

const PILOT_LABEL_EN = "Run a free pilot on your next intake";
const PILOT_LABEL_VI = "Chạy thí điểm miễn phí trên đợt tuyển sinh tiếp theo";

/** React escapes `&` as `&amp;` in attributes. */
const attr = (href: string) => `href="${href.replace(/&/g, "&amp;")}"`;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/solutions/accelerator — pilot CTA props", () => {
  it("lands on the evaluator signup with the Intake link pre-selected and a pilot referrer", () => {
    const url = new URL(ACCELERATOR_PILOT_HREF, "https://blockid.au");
    expect(url.pathname).toBe("/signup");
    expect(url.searchParams.get("plan")).toBe("investor_vc_small");
    expect(url.searchParams.get("trial")).toBe("1");
    expect(url.searchParams.get("from")).toBe("pilot");
    // `plan=` alone must resolve the evaluator segment on /signup.
    expect(EVALUATOR_TRIAL_PLAN_IDS).toContain(url.searchParams.get("plan"));
    expect(resolveSignupSegment(undefined, url.searchParams.get("plan") ?? undefined)).toBe(
      "evaluator",
    );
  });

  it("the accelerator persona carries the pilot card, in both languages", () => {
    const enProps = buildAcceleratorProps(EN, "en");
    expect(enProps.pilotCta).toBeDefined();
    expect(enProps.pilotCta?.ctaHref).toBe(ACCELERATOR_PILOT_HREF);
    expect(enProps.pilotCta?.ctaLabel).toBe(PILOT_LABEL_EN);
    // Pricing v4 / plan §4 pilot offer: free scoring for one intake (≤ 60
    // applicants, 30 days) in exchange for an LOI on Cohort 25 — the copy
    // names the yearly Cohort 25 figure and the Intake link price as tokens.
    expect(enProps.pilotCta?.body).toContain("{cohortAnnualPrice}");
    expect(enProps.pilotCta?.body).toContain("{intakePrice}");
    expect(enProps.pilotCta?.body).toMatch(/letter of intent/i);
    expect(enProps.pilotCta?.body).toMatch(/60 applicants/);
    expect(enProps.pilotCta?.body).not.toContain("{programPrice}");

    const viProps = buildAcceleratorProps(VI, "vi");
    expect(viProps.pilotCta?.ctaHref).toBe(ACCELERATOR_PILOT_HREF);
    expect(viProps.pilotCta?.ctaLabel).toBe(PILOT_LABEL_VI);
    expect(viProps.pilotCta?.body).toContain("{cohortAnnualPrice}");
    expect(viProps.pilotCta?.body).toContain("{intakePrice}");
  });

  it("investor and advisor personas do not show a pilot card", () => {
    expect(buildInvestorProps(EN).pilotCta).toBeUndefined();
    expect(buildAdvisorProps(EN).pilotCta).toBeUndefined();
  });

  it("never says PhD and never names a price outside the catalogue tokens", () => {
    const p = buildAcceleratorProps(EN).pilotCta!;
    const text = [p.eyebrow, p.title, p.body, p.ctaLabel].join("\n");
    expect(text).not.toMatch(/PhD/);
    // Any literal amount would be drift; amounts arrive as `{…Price}` tokens.
    expect(text.replace(/\{[a-zA-Z]+\}/g, "")).not.toMatch(/A\$\s?\d/);
  });
});

describe("/solutions/accelerator — rendered pilot CTA", () => {
  it("renders the button with the pilot href and the catalogue price filled in (EN)", async () => {
    const out = await html(await SolutionsAcceleratorPage());
    expect(out).toContain('data-testid="pilot-cta"');
    expect(out).toContain(attr(ACCELERATOR_PILOT_HREF));
    expect(out).toContain(PILOT_LABEL_EN);
    expect(out).toContain("A$5,000");
    expect(out).toContain("A$249");
    expect(out).not.toMatch(/\{[a-zA-Z]+Price\}/);
  });

  it("renders the Vietnamese mirror with the same href", async () => {
    const out = await html(await ViSolutionsAcceleratorPage());
    expect(out).toContain('data-testid="pilot-cta"');
    expect(out).toContain(attr(ACCELERATOR_PILOT_HREF));
    expect(out).toContain(PILOT_LABEL_VI);
    expect(out).toContain("A$5,000");
  });
});

describe("/solutions/accelerator — SEO (S8-A)", () => {
  it("metadata: ≤ 60 title without a doubled brand, 140–160 description, hreflang pair, OG image", async () => {
    const meta = await generateMetadata();
    expect(String(meta.title)).toBe("Score your whole cohort on one startup rubric");
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
