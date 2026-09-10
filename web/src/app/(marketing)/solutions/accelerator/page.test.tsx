// Colocated test for /solutions/accelerator and its /vi mirror — the
// "Run a 14-day pilot on your next intake" CTA (G12 traction T2, S6-C).
//
// The contact form does not read `?intent=` / `?plan=`, so the pilot button
// must land on the evaluator signup with Program pre-selected. This suite
// pins the href, the label in both languages, and that the card renders
// on the accelerator page only (investor / advisor never show it).
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
import SolutionsAcceleratorPage from "./page";
import ViSolutionsAcceleratorPage from "../../../vi/solutions/accelerator/page";

const EN = en as unknown as Messages;
const VI = vi_ as unknown as Messages;

const PILOT_LABEL_EN = "Run a 14-day pilot on your next intake";
const PILOT_LABEL_VI = "Chạy thí điểm 14 ngày trên đợt tuyển sinh tiếp theo";

/** React escapes `&` as `&amp;` in attributes. */
const attr = (href: string) => `href="${href.replace(/&/g, "&amp;")}"`;

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

describe("/solutions/accelerator — pilot CTA props", () => {
  it("lands on the evaluator signup with Program pre-selected and a pilot referrer", () => {
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
    expect(enProps.pilotCta?.body).toContain("{programPrice}");
    expect(enProps.pilotCta?.body).toContain("card required");

    const viProps = buildAcceleratorProps(VI, "vi");
    expect(viProps.pilotCta?.ctaHref).toBe(ACCELERATOR_PILOT_HREF);
    expect(viProps.pilotCta?.ctaLabel).toBe(PILOT_LABEL_VI);
    expect(viProps.pilotCta?.body).toContain("{programPrice}");
  });

  it("investor and advisor personas do not show a pilot card", () => {
    expect(buildInvestorProps(EN).pilotCta).toBeUndefined();
    expect(buildAdvisorProps(EN).pilotCta).toBeUndefined();
  });

  it("never says PhD and never names a price outside the catalogue tokens", () => {
    const p = buildAcceleratorProps(EN).pilotCta!;
    const text = [p.eyebrow, p.title, p.body, p.ctaLabel].join("\n");
    expect(text).not.toMatch(/PhD/);
    // Any literal amount would be drift; amounts arrive as `{programPrice}`.
    expect(text.replace(/\{programPrice\}/g, "")).not.toMatch(/A\$\s?\d/);
  });
});

describe("/solutions/accelerator — rendered pilot CTA", () => {
  it("renders the button with the pilot href and the catalogue price filled in (EN)", async () => {
    const out = await html(await SolutionsAcceleratorPage());
    expect(out).toContain('data-testid="pilot-cta"');
    expect(out).toContain(attr(ACCELERATOR_PILOT_HREF));
    expect(out).toContain(PILOT_LABEL_EN);
    expect(out).toContain("A$349");
    expect(out).not.toContain("{programPrice}");
  });

  it("renders the Vietnamese mirror with the same href", async () => {
    const out = await html(await ViSolutionsAcceleratorPage());
    expect(out).toContain('data-testid="pilot-cta"');
    expect(out).toContain(attr(ACCELERATOR_PILOT_HREF));
    expect(out).toContain(PILOT_LABEL_VI);
    expect(out).toContain("A$349");
  });
});
