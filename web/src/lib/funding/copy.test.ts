// Colocated tests for lib/funding/copy (T0248, plan §4i D-3): the fill()
// helper, the D-3 strings verbatim, the speakability rule (≤ 2 sentences),
// the G11-9 number guard (no "PhD", no "A$5.50", no "A$99") and EN ⇄ VI
// parity for every `funding.copy.*` key (same tokens, non-empty, ≤ 2
// sentences in VI too). G35 P5 (D25): the Money Finder price is a token,
// resolved per payg_enabled view — flag OFF = today's strings, flag ON =
// the v5 catalogue (A$19 / 19 credits).

import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/messages/en.json";
import vi from "@/lib/i18n/messages/vi.json";
import { PAYG_OFF_VIEW, PAYG_ON_VIEW } from "@/lib/pricing/payg-copy";
import { PAYG_SKUS } from "@/lib/pricing/v5-payg";
import { FUNDING_REPORT_3AUD } from "@/lib/pricing/v3-skus";
import { RADAR_UPSELL_TAIL } from "./radar-upsell";
import {
  FUNDING_COPY,
  FUNDING_COPY_I18N_PREFIX,
  FUNDING_COPY_TEMPLATES,
  fill,
  flattenFundingCopy,
  fundingCopy,
  fundingCopyFor,
  fundingPriceTokens,
  fundingSeedPairs,
  nextDeadlineLine,
  tokensOf,
  weekdayOf,
} from "./copy";

const EN = en as Record<string, string>;
const VI = vi as Record<string, string>;

/** Sentence count: terminal punctuation followed by whitespace or end; "A$3." and "12-month" do not split. */
function sentences(s: string): number {
  const parts = s
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-ZĐÀ-Ỹ{0-9"'])/)
    .filter((p) => p.trim().length > 0);
  return Math.max(1, parts.length);
}

describe("fill()", () => {
  it("replaces every known token, prints numbers, and leaves unknown tokens visible", () => {
    expect(fill("{n} new grants match {startup} this week", { n: 3, startup: "Acme" })).toBe("3 new grants match Acme this week");
    expect(fill("{program} closes {weekday}", { program: "MVP Ventures" })).toBe("MVP Ventures closes {weekday}");
    expect(fill("A${max}", { max: null })).toBe("A${max}");
    expect(fill("no tokens here")).toBe("no tokens here");
  });

  it("tokensOf lists each token once, sorted", () => {
    expect(tokensOf(FUNDING_COPY.preview.result)).toEqual(["a", "b", "c", "city", "industry", "m", "n", "stage", "sum"]);
    expect(tokensOf("plain")).toEqual([]);
  });
});

describe("D-3 strings (verbatim)", () => {
  it("public CTA + hero + trust line", () => {
    expect(FUNDING_COPY.cta.needMoney).toBe("Do you need money?");
    expect(FUNDING_COPY.cta.altFindMoney).toBe("Find money for my startup");
    expect(FUNDING_COPY.cta.altShowGrants).toBe("Show me my grants");
    expect(FUNDING_COPY.hero.h1).toBe(
      "There's {sum} in Australian grants and programs open right now. Find the ones you qualify for in 60 seconds.",
    );
    expect(`${FUNDING_COPY.hero.sub} ${FUNDING_COPY.hero.subPrice}`).toBe(
      "Government grants, accelerators, angels and tax offsets — matched to your idea, your state and your stage. The list is free. The eligibility check, ranking and 12-month plan are A$3.",
    );
    expect(FUNDING_COPY.hero.trust).toBe(
      "Every program links to its official page. Grant information is free from government — we sell the analysis, not the access.",
    );
  });

  it("preview result + paywall card", () => {
    expect(FUNDING_COPY.preview.result).toBe(
      "We found {n} grants worth up to {sum} and {m} programs in {city} for a {stage} {industry} startup. Top 3: {a}, {b}, {c}.",
    );
    expect(FUNDING_COPY.paywall.card).toBe(
      "Unlock the full ranked list, eligibility checklist, A$ estimate and 12-month timeline — A$3, or free with Founder Radar (7-day trial).",
    );
  });

  it("report → subscribe upsell shares the T0247 tail (no duplicate)", () => {
    expect(FUNDING_COPY.upsell.tail).toBe(RADAR_UPSELL_TAIL);
    expect(`${fill(FUNDING_COPY.upsell.snapshot, { next_program: "MVP Ventures", d: 12, k: 3 })} ${FUNDING_COPY.upsell.tail}`).toBe(
      "This report is a snapshot. MVP Ventures closes in 12 days and 3 programs on your list open new rounds this quarter. Founder Radar watches them for you: alerts, monthly re-match, weekly next step — A$29/mo, first 7 days free.",
    );
  });

  it("the 8 notification titles (templates ≤ 60 chars — the feed clamps long names)", () => {
    const n = FUNDING_COPY.notification;
    expect(fill(n.new_match, { n: 3, startup: "Acme" })).toBe("3 new grants match Acme this week");
    expect(fill(n.deadline_t30, { program: "MVP Ventures" })).toBe("MVP Ventures closes in 30 days — start your application");
    expect(fill(n.deadline_t14, { program: "MVP Ventures", max: "A$75,000" })).toBe("14 days left: MVP Ventures (A$75,000)");
    expect(fill(n.deadline_t3, { program: "Startmate", weekday: "Friday" })).toBe("Last call: Startmate closes Friday");
    expect(fill(n.status_changed, { program: "Ignite", status: "paused", k: 2 })).toBe("Ignite paused — here are 2 alternatives");
    expect(fill(n.new_round_opened, { program: "Plus Eight" })).toBe("Plus Eight just opened a new round");
    expect(fill(n.event_match, { event: "West Tech Fest", city: "Perth", date: "1 Dec" })).toBe(
      "West Tech Fest (Perth, 1 Dec) — founders at your stage go to this",
    );
    expect(fill(n.analysis_refresh, { n: 2 })).toBe("Your funding plan was refreshed — 2 changes");
    for (const [key, tpl] of Object.entries(n)) expect(tpl.length, key).toBeLessThanOrEqual(60);
  });

  it("email subjects + pricing rows", () => {
    const e = FUNDING_COPY.email;
    expect(e.t30).toBe("30 days to {program}: your eligibility checklist");
    expect(e.t14).toBe("{program} closes in 2 weeks — draft ready?");
    expect(e.t3).toBe("Final 72 hours for {program}");
    expect(e.digest).toBe("Money this week: {n} new matches · next deadline {program} in {d} days · this week's step: {action}");
    expect(e.reengagement).toBe("Since your report: {k} programs changed. See what's new.");
    expect(FUNDING_COPY.pricing.starter).toBe(
      "Money Radar — deadline alerts, monthly re-match, weekly next step, capital map, application drafts (credits)",
    );
    expect(FUNDING_COPY.pricing.growth).toBe("Investor matching + unlimited drafts + quarterly expert update");
  });

  it("tile lines (D-2)", () => {
    const t = FUNDING_COPY.tile;
    expect(fill(t.noProfile, { grants: 14, programs: 6, industry: "Agtech / food", state: "NSW" })).toBe(
      "We found 14 grants and 6 programs for Agtech / food startups in NSW. Answer 3 questions to see yours.",
    );
    expect(fill(t.nextDeadline, { d: 12 })).toBe("Next deadline in 12 days");
    expect(fill(t.newMatches, { n: 3 })).toBe("3 new matches this week");
    expect(fill(t.nothingDue, { event: "Startmate apps", date: "15 Sep" })).toBe("No deadlines in the next 30 days. Next up: Startmate apps opens 15 Sep.");
    expect(t.deadlinesMove).toBe("Deadlines move — get alerts");
  });
});

describe("speakability + number guards", () => {
  const flat = flattenFundingCopy();

  it("every string is ≤ 2 sentences and non-empty", () => {
    for (const [key, value] of Object.entries(flat)) {
      expect(value.trim().length, key).toBeGreaterThan(0);
      expect(sentences(value), `${key}: "${value}"`).toBeLessThanOrEqual(2);
    }
  });

  it("never says PhD, A$5.50 or A$99 (G11-9: Free / report / A$29 only) — in either flag state", () => {
    for (const [view, price] of [
      [PAYG_OFF_VIEW, "A$3"],
      [PAYG_ON_VIEW, "A$19"],
    ] as const) {
      const text = Object.values(flattenFundingCopy(view)).join("\n");
      expect(text).not.toMatch(/PhD/);
      expect(text).not.toContain("5.50");
      expect(text).not.toMatch(/A\$99/);
      expect(text).toContain(price);
      expect(text).toContain("A$29");
      expect(text).not.toMatch(/\{funding(Price|Credits)\}/);
    }
  });

  it("no template types a Money Finder price — only the {fundingPrice} / {fundingCredits} tokens", () => {
    const text = Object.values(flat).join("\n");
    expect(text).not.toMatch(/A\$(3|19)\b/);
    expect(text).toContain("{fundingPrice}");
    expect(text).toContain("{fundingCredits}");
  });
});

describe("payg_enabled views (G35 P5, D25)", () => {
  it("flag OFF is today's site: legacy v3 SKU price + credits", () => {
    expect(fundingPriceTokens()).toEqual({ fundingPrice: "A$3", fundingCredits: 3 });
    expect(PAYG_OFF_VIEW.fundingCents).toBe(FUNDING_REPORT_3AUD.unit_amount_incl_gst_cents);
    expect(FUNDING_COPY).toBe(fundingCopyFor(PAYG_OFF_VIEW));
    expect(FUNDING_COPY.cta.unlockReport).toBe("Unlock full report A$3");
    expect(FUNDING_COPY.pricing.reportPrice).toBe("A$3 · or 3 credits");
    expect(FUNDING_COPY.faq.reportA).toBe(
      "For A$3: your ranked grants and programs, an eligibility checklist per match, an A$ estimate and a 12-month application timeline.",
    );
  });

  it("flag ON is D25: report_funding catalogue price + credits, 'Free scan · A$19 full'", () => {
    expect(PAYG_ON_VIEW.fundingCents).toBe(PAYG_SKUS.report_funding.amountCents);
    expect(PAYG_ON_VIEW.fundingCredits).toBe(PAYG_SKUS.report_funding.creditCost);
    const on = fundingCopyFor(PAYG_ON_VIEW);
    expect(on.cta.unlockReport).toBe("Unlock full report A$19");
    expect(on.hero.subPrice).toBe("The list is free. The eligibility check, ranking and 12-month plan are A$19.");
    expect(on.paywall.card).toBe(
      "Unlock the full ranked list, eligibility checklist, A$ estimate and 12-month timeline — A$19, or free with Founder Radar (7-day trial).",
    );
    expect(on.pricing.reportPrice).toBe("A$19 · or 19 credits");
    expect(on.pricing.scanLine).toBe("Free scan · A$19 full");
    expect(on.faq.grantsFreeA).toContain("A$19 buys the eligibility analysis");
    expect(on.faq.reportA.startsWith("For A$19:")).toBe(true);
    // Unpriced strings are identical in both states.
    expect(on.hero.h1).toBe(FUNDING_COPY.hero.h1);
    expect(fundingCopyFor(PAYG_ON_VIEW)).toBe(on);
  });

  it("fundingCopy() fills the price from the view (EN + VI), explicit tokens win", () => {
    expect(fundingCopy("pricing", "reportPrice")).toBe("A$3 · or 3 credits");
    expect(fundingCopy("pricing", "reportPrice", {}, null, PAYG_ON_VIEW)).toBe("A$19 · or 19 credits");
    expect(fundingCopy("pricing", "reportPrice", {}, VI)).toBe("A$3 · hoặc 3 credit");
    expect(fundingCopy("pricing", "reportPrice", {}, VI, PAYG_ON_VIEW)).toBe("A$19 · hoặc 19 credit");
    expect(fundingCopy("cta", "unlockReport", { fundingPrice: "X" }, null, PAYG_ON_VIEW)).toBe("Unlock full report X");
  });

  it("fundingSeedPairs() seeds the EN → VI pair for both flag states, nothing for unpriced strings", () => {
    const k = "funding.copy.cta.unlockReport";
    expect(fundingSeedPairs(EN[k]!, VI[k]!)).toEqual([
      ["Unlock full report A$3", "Mở khóa báo cáo đầy đủ A$3"],
      ["Unlock full report A$19", "Mở khóa báo cáo đầy đủ A$19"],
    ]);
    expect(fundingSeedPairs(EN["funding.copy.cta.needMoney"]!, VI["funding.copy.cta.needMoney"]!)).toEqual([]);
  });

  it("meta.funding.description carries the price token in both catalogues", () => {
    expect(EN["meta.funding.description"]).toContain("{fundingPrice}");
    expect(tokensOf(VI["meta.funding.description"]!)).toEqual(tokensOf(EN["meta.funding.description"]!));
  });

  it("the templates object is what the catalogues mirror", () => {
    expect(FUNDING_COPY_TEMPLATES.pricing.reportPrice).toBe("{fundingPrice} · or {fundingCredits} credits");
  });
});

describe("EN ⇄ VI parity for funding.copy.*", () => {
  const flat = flattenFundingCopy();
  const keys = Object.keys(flat);
  const viKeys = Object.keys(VI).filter((k) => k.startsWith(FUNDING_COPY_I18N_PREFIX));

  it("en.json carries every key with the exact copy.ts value", () => {
    for (const k of keys) expect(EN[k], k).toBe(flat[k]);
  });

  it("vi.json has the same key set, non-empty, same tokens, ≤ 2 sentences, no PhD / 5.50", () => {
    expect(keys.filter((k) => !(k in VI)), "missing in vi.json").toEqual([]);
    expect(viKeys.filter((k) => !(k in flat)), "stale in vi.json").toEqual([]);
    for (const k of keys) {
      expect(VI[k]!.trim().length, k).toBeGreaterThan(0);
      expect(tokensOf(VI[k]!), k).toEqual(tokensOf(flat[k]));
      expect(sentences(VI[k]!), `${k}: "${VI[k]}"`).toBeLessThanOrEqual(2);
      expect(VI[k]).not.toMatch(/PhD|5\.50/);
    }
  });

  it("meta.funding.* exists in both catalogues", () => {
    for (const k of ["meta.funding.title", "meta.funding.description"]) {
      expect(EN[k], k).toBeTruthy();
      expect(VI[k], k).toBeTruthy();
    }
  });

  it("fundingCopy() reads the VI catalogue when given and falls back to EN", () => {
    expect(fundingCopy("cta", "needMoney", {}, VI)).toBe(VI["funding.copy.cta.needMoney"]);
    expect(fundingCopy("cta", "needMoney")).toBe("Do you need money?");
    expect(fundingCopy("tile", "nextDeadline", { d: 12 }, VI)).toBe(fill(VI["funding.copy.tile.nextDeadline"]!, { d: 12 }));
    expect(fundingCopy("tile", "nope")).toBe("{tile.nope}");
  });
});

describe("helpers", () => {
  it("nextDeadlineLine + weekdayOf", () => {
    expect(nextDeadlineLine(12)).toBe("Next deadline in 12 days");
    expect(nextDeadlineLine(0)).toBe("Next deadline is today");
    expect(nextDeadlineLine(null)).toBe("");
    expect(weekdayOf("2026-09-11")).toBe("Friday");
    expect(weekdayOf(null)).toBe("soon");
    expect(weekdayOf("nope")).toBe("soon");
  });
});
