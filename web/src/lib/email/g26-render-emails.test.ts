// G26 lane R — one-off render harness (not a guard): writes a founder digest
// and a lifecycle e-mail to HTML files for screenshot inspection. Runs only
// when G26_RENDER_OUT is set.
import { describe, expect, it } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT = process.env.G26_RENDER_OUT;

describe.skipIf(!OUT)("G26 e-mail render harness", () => {
  it("writes the founder digest + lifecycle day0 HTML", async () => {
    const { buildFounderDigest } = await import("./founder-digest");
    const { renderLifecycleEmail } = await import("@/emails/lifecycle/render");
    mkdirSync(OUT!, { recursive: true });
    const digest = buildFounderDigest({
      name: "Sam",
      phaseSlug: "investor_review",
      phaseLabel: "Funding-Ready",
      readinessScore: 78,
      band: "investor-ready",
      deltaSummary: "Readiness improved +8 points to 78/100 — crossed a band boundary upward.",
      bandDirection: "up",
      nextAction: { title: "Add: ESIC eligibility assessment", reason: "Run the Div 360 ITAA97 self-check — unlocks a 20% offset for your angels.", cta_url: "/compliance/esic", cta_label: "Fix this raise-blocker", label: "Fix this raise-blocker", category: "compliance" },
      missingTop3: [
        { category: "12. AU Compliance", title: "ESIC eligibility assessment", phase_slug: "9", why_it_matters: "Div 360 ITAA97 — 20% offset + 10-year CGT exemption.", raise_blocker: true, cta_url: "/compliance/esic" },
        { category: "3. Financial Model", title: "36-month projections", phase_slug: "9", why_it_matters: "Investors test the runway maths first.", raise_blocker: false, cta_url: "/workspace/documents" },
        { category: "5. Legal", title: "Shareholder agreement", phase_slug: "6", why_it_matters: "Term sheets reference it.", raise_blocker: false, cta_url: "/workspace/documents" },
      ],
      dashboardUrl: "https://blockid.au/dashboard",
      unsubscribeUrl: "https://blockid.au/u/xyz",
      currentPhaseSlug: "investor_review",
      currentPhaseTitle: "Funding-Ready",
    } as never);
    writeFileSync(path.join(OUT!, "founder-digest.html"), digest.html);
    const life = renderLifecycleEmail({ step: "day0", unsubscribeUrl: "https://blockid.au/u/xyz" } as never);
    writeFileSync(path.join(OUT!, "lifecycle-day0.html"), life.html);
    expect(digest.html.length).toBeGreaterThan(500);
  });
});
