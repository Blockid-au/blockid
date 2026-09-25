// G34-BT4 — lifecycle copy (plan §9.2): each body uses the recipient's own
// data, C-class carries an unsubscribe link, buy links go to the review
// page (never Stripe), the re-run prompt states the credit cost first, the
// digest hides the percentile under n = 10, and payload text is escaped.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase", () => ({ getSupabaseAdmin: () => null }));

import { renderLifecycleEmail, rerunCreditLabel } from "./templates";
import { LIFECYCLE_CAMPAIGNS, LIFECYCLE_META, campaignPriority, isLifecycleCampaign } from "./campaigns";
import { SVI_ANALYSIS_CREDITS } from "@/lib/credits-public";

const EMAIL = "sam+x@example.com";

beforeEach(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://blockid.au/";
});

describe("campaign registry", () => {
  it("only score_updated is transactional; every flow has a category and a flow key", () => {
    for (const c of LIFECYCLE_CAMPAIGNS) {
      expect(LIFECYCLE_META[c].emailClass).toBe(c === "score_updated" ? "T" : "C");
      expect(LIFECYCLE_META[c].flow).toMatch(/^[a-z-]+$/);
      expect(isLifecycleCampaign(c)).toBe(true);
    }
    expect(isLifecycleCampaign("onboarding_d1")).toBe(false);
  });

  it("priority: T < re-run < evidence < intake < quota < onboarding < digest < sunset", () => {
    const order = [
      campaignPriority("score_updated", "T"),
      campaignPriority("rerun_prompt", "C"),
      campaignPriority("evidence_gap_1", "C"),
      campaignPriority("intake_abandoned_1", "C"),
      campaignPriority("free_quota_used", "C"),
      campaignPriority("onboarding_d1", "C"),
      campaignPriority("monthly_digest", "C"),
      campaignPriority("sunset_check", "C"),
    ];
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(campaignPriority("radar_t3", "T")).toBe(0);
  });
});

describe("renderLifecycleEmail", () => {
  it("every campaign renders a subject, html and text with the operator footer", () => {
    for (const c of LIFECYCLE_CAMPAIGNS) {
      const r = renderLifecycleEmail(c, EMAIL, {});
      expect(r.subject.length).toBeGreaterThan(5);
      expect(r.html).toContain("BlockID &middot; Startup Value Index");
      expect(r.text).toContain("BlockID · Startup Value Index");
      expect(r.html).not.toContain("https://blockid.au//");
    }
  });

  it("C-class bodies carry the category unsubscribe link (token when known)", () => {
    const r = renderLifecycleEmail("evidence_gap_1", EMAIL, { unsubscribe_token: "tok123" });
    expect(r.html).toContain("https://blockid.au/unsubscribe?token=tok123&amp;category=product_updates");
    const r2 = renderLifecycleEmail("rerun_prompt", EMAIL, {});
    expect(r2.text).toContain(`Unsubscribe: https://blockid.au/unsubscribe?email=${encodeURIComponent(EMAIL)}`);
  });

  it("EM12 score updated: old → new, what moved and the evidence behind it; preferences link, no promo", () => {
    const r = renderLifecycleEmail("score_updated", EMAIL, {
      project_id: "p1",
      startup: "Acme",
      lifecycle: {
        score: {
          previous_svi: 112,
          new_svi: 118,
          source: "evidence",
          scored_at: "2026-09-24T00:30:00Z",
          changes: [{ key: "tre", label: "Traction & Revenue", before: 42, after: 52, evidence: ["Stripe MRR"] }],
        },
      },
    });
    expect(r.subject).toBe("Your Startup Value Index was re-scored: 112 → 118");
    expect(r.text).toContain("Startup Value Index: 112 → 118 (+6)");
    expect(r.text).toContain("Traction & Revenue: 42 → 52 — evidence on file: Stripe MRR");
    expect(r.html).toContain("/workspace/reports/business?pid=p1");
    expect(r.text).toContain("Email preferences:");
    expect(r.html).not.toMatch(/pricing|checkout|credit|upgrade|\bbuy\b|A\$/i);
  });

  it("EM12 with a total move but no dimension move says so factually", () => {
    const r = renderLifecycleEmail("score_updated", EMAIL, { lifecycle: { score: { previous_svi: 100, new_svi: 97, source: "rescore", scored_at: "x", changes: [] } } });
    expect(r.text).toContain("(-3)");
    expect(r.text).toContain("No dimension score moved.");
  });

  it("EM14 evidence gap: weakest dimension, lead agent, top missing items, upload link for that dimension", () => {
    const r = renderLifecycleEmail("evidence_gap_1", EMAIL, {
      lifecycle: {
        gap: {
          dimension_key: "tre",
          dimension_title: "Traction & Revenue Evidence",
          short_label: "Traction",
          lead_agent: "CRO",
          score: 31,
          missing: ["Stripe connection", "Customer contracts", "Bank statement"],
          missing_count: 7,
          confidence_to: "public URL",
          cta_path: "/workspace/evidence/gaps?dim=tre",
          analysed_at: "2026-09-20T00:00:00Z",
        },
      },
    });
    expect(r.subject).toContain("Traction");
    expect(r.text).toContain("The CRO agent leads this dimension");
    expect(r.text).toContain("(3 of 7 missing)");
    expect(r.text).toContain("1. Stripe connection");
    expect(r.text).toContain('from "nothing on file" to "public URL"');
    expect(r.html).toContain("https://blockid.au/workspace/evidence/gaps?dim=tre");
    const follow = renderLifecycleEmail("evidence_gap_2", EMAIL, {});
    expect(follow.subject).toMatch(/^Still nothing on file/);
  });

  it("EM13 onboarding: progress and the next step", () => {
    const r = renderLifecycleEmail("intake_abandoned_1", EMAIL, {
      lifecycle: { intake: { steps_done: 1, steps_total: 3, next_step_label: "Your startup", idle_since: "x" } },
    });
    expect(r.subject).toBe("Your BlockID setup is 33% done — 2 steps left");
    expect(r.text).toContain("Next: Your startup.");
    expect(r.html).toContain("https://blockid.au/onboarding");
    const zero = renderLifecycleEmail("intake_abandoned_2", EMAIL, { lifecycle: { intake: { steps_done: 0, steps_total: 3, next_step_label: "Who are you", idle_since: "x" } } });
    expect(zero.subject).toBe("Your BlockID setup is waiting — 3 short steps");
  });

  it("EM15 re-run: the credit cost from the debit constant, stated before the CTA", () => {
    const r = renderLifecycleEmail("rerun_prompt", EMAIL, {
      lifecycle: { rerun: { new_evidence_count: 2, last_scored_at: "2026-09-10T00:00:00Z", evidence_labels: ["Pitch deck", "GA4"] } },
    });
    expect(rerunCreditLabel()).toBe(`${SVI_ANALYSIS_CREDITS} credits`);
    expect(r.subject).toContain(`re-run costs ${SVI_ANALYSIS_CREDITS} credits`);
    expect(r.text.indexOf("costs")).toBeLessThan(r.text.indexOf("Review and re-run:"));
    expect(r.text).toContain("nothing is charged until you confirm");
    expect(r.text).toContain("You added 2 evidence items since your last full analysis on 10 September 2026");
  });

  it("EM16 free quota: prices from the catalogue, links to the review page — never Stripe", () => {
    const r = renderLifecycleEmail("free_quota_used", EMAIL, { lifecycle: { quota: { reports_used: 2, delivered_at: "x" } } });
    expect(r.html).toContain("https://blockid.au/checkout/review?plan=founder_starter&amp;entry=email");
    expect(r.html).toMatch(/checkout\/review\?pack=\d+&amp;entry=email/);
    expect(r.html).not.toMatch(/stripe\.com|\/api\/checkout|\/api\/stripe/i);
    expect(r.text).toContain("Nothing is charged until you press Pay.");
    expect(r.text).toMatch(/A\$\d+\/mo/);
  });

  it("EM19 digest: quiet month still renders; percentile only with n ≥ 10", () => {
    const base = {
      period_label: "September 2026",
      period_key: "2026-09",
      svi_current: 118,
      svi_previous: 118,
      views: 0,
      leads: 0,
      missing_top3: [{ title: "Upload your constitution", cta_url: "https://blockid.au/workspace/data-room" }],
      next_action: null,
      stage_label: "MVP / Prototype",
      quiet: true,
    };
    const small = renderLifecycleEmail("monthly_digest", EMAIL, { startup: "Acme", lifecycle: { digest: { ...base, percentile: 60, cohort_n: 9 } } });
    expect(small.subject).toBe("September 2026 on BlockID: SVI 118 (no change)");
    expect(small.text).toContain("A quiet month");
    expect(small.text).toContain("1. Upload your constitution — https://blockid.au/workspace/data-room");
    expect(small.text).not.toContain("Ahead of");
    const big = renderLifecycleEmail("monthly_digest", EMAIL, { lifecycle: { digest: { ...base, percentile: 60, cohort_n: 34 } } });
    expect(big.text).toContain("Ahead of 60% of MVP / Prototype-stage startups on BlockID (34 in the cohort).");
  });

  it("EM20 sunset: keep via preferences, stop link, 30-day notice, receipts unaffected", () => {
    const r = renderLifecycleEmail("sunset_check", EMAIL, { unsubscribe_token: "t0k", lifecycle: { sunset: { last_seen_at: "2026-06-01T00:00:00Z", days_inactive: 116 } } });
    expect(r.html).toContain("https://blockid.au/unsubscribe?token=t0k&amp;manage=1");
    expect(r.text).toContain("Stop them now: https://blockid.au/unsubscribe?token=t0k");
    expect(r.text).toContain("30 days");
    expect(r.text).toContain("Receipts and security notices are not affected");
  });

  it("escapes payload text into the HTML", () => {
    const r = renderLifecycleEmail("score_updated", EMAIL, {
      startup: "<script>x</script>",
      lifecycle: { score: { previous_svi: 1, new_svi: 2, source: "rescore", scored_at: "x", changes: [{ key: "ftv", label: "<b>", before: 1, after: 2, evidence: ['"><img>'] }] } },
    });
    expect(r.html).not.toContain("<script>x</script>");
    expect(r.html).not.toContain('"><img>');
    expect(r.html).toContain("&lt;script&gt;");
  });
});
