// Colocated test for the homepage v7 (G21 P0-B, 2026-09-20; was G17 D1–D3).
// Renders the real page (NavV2's auth hook stubbed, next/navigation stubbed)
// and pins the acceptance list: exactly one H1 with the FI1 text, the search
// frame + ring, the two CTAs, the trust line, no price strings, the seven
// sections in order (problem · sequence · messages · why-not-chatgpt ·
// built-for · cta) with the TrustBand placeholder left for lane P0-A, the
// seven nav labels, the problem flow with its SVG arrows, the six-step
// sequence linked to /product, the three messages, the two comparison
// columns + the one line, the six Built-for chips, and the one Footer.

import { describe, expect, it, vi } from "vitest";
import { LEGAL_ENTITY, marketingLine } from "@/lib/site/legal-entity";
import { renderToReadableStream } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

vi.mock("@/hooks/useAuthUser", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/hooks/useAuthUser")>();
  return { ...mod, useAuthUser: () => null };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, prefetch: () => {}, refresh: () => {} }),
  usePathname: () => "/",
}));
vi.mock("@/components/auth/LogoutButton", () => ({
  LogoutButton: ({ children }: { children?: React.ReactNode }) => <button>{children}</button>,
}));

import { MENU, PRIMARY_CTA } from "@/components/landing/nav-v2";
import { HERO_PRIMARY_CTA, HERO_SECONDARY_CTA } from "@/components/marketing/hero-section";
import { heroLine } from "@/lib/marketing/hero-variants";
import { renderedTitle } from "@/lib/seo/page-meta";
import {
  HOME_BUILT_FOR,
  HOME_MESSAGES,
  HOME_PRIMARY_CTA,
  HOME_PROBLEM,
  HOME_PROBLEM_STEPS,
  HOME_SAMPLE_LINK,
  HOME_SECONDARY_CTA,
  HOME_SECTION_IDS,
  HOME_SEQUENCE,
  HOME_SEQUENCE_STEPS,
  HOME_WHY_NOT,
} from "./home-content";
import HomePage, { metadata, revalidate } from "./page";

async function html(el: React.ReactElement): Promise<string> {
  const stream = await renderToReadableStream(el);
  await stream.allReady;
  return new Response(stream).text();
}

function textOf(h: string): string {
  return h
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");
}

const out = await html(<HomePage />);
const text = textOf(out);
const main = out.slice(out.indexOf("<main"), out.indexOf("</main>"));
const mainText = textOf(main);

describe("homepage v7 — metadata", () => {
  it("title is the FI1 line shortened to ≤ 65 with the brand; description 140–160 with no A$; canonical / with the VI twin; ISR 300", () => {
    expect(renderedTitle(metadata.title)).toBe("Screen startups on one evidence-backed framework | BlockID.au");
    expect(renderedTitle(metadata.title).length).toBeLessThanOrEqual(65);
    const d = String(metadata.description);
    expect(d.length).toBeGreaterThanOrEqual(140);
    expect(d.length).toBeLessThanOrEqual(160);
    expect(d).toMatch(/Startup Value Index/);
    expect(d).not.toMatch(/A\$/);
    expect(metadata.alternates?.canonical).toBe("https://blockid.au/");
    expect((metadata.alternates?.languages as Record<string, string>).vi).toBe("https://blockid.au/vi");
    expect(revalidate).toBe(300);
  });
});

describe("homepage v7 — hero (G21 P0-B)", () => {
  it("exactly one h1, and it is the FI1 evidence-backed line", () => {
    const h1s = out.match(/<h1[^>]*>([\s\S]*?)<\/h1>/g) ?? [];
    expect(h1s).toHaveLength(1);
    expect(textOf(h1s[0]!).trim()).toBe("Screen every startup on the same evidence-backed framework.");
    expect(textOf(h1s[0]!).trim()).toBe(heroLine("FI1").en);
    expect(text).toContain(heroLine("FI2").en);
  });

  it("the search box + ring are in the hero (data-testid=hero-search, smart-intake ids kept) and main has id=main-content", () => {
    expect(out).toContain('data-testid="hero-search"');
    expect(out).toContain('data-testid="smart-intake-text"');
    expect(out).toContain('data-testid="smart-intake-cta"');
    expect(out).toMatch(/class="asf-wrap/);
    expect(out).toMatch(/<main[^>]*id="main-content"/);
  });

  it("CTA 1 Run a cohort pilot → /solutions/accelerator#pilot, CTA 2 Score my startup → /analyze; the hero, the nav and the closing band agree", () => {
    expect(HERO_PRIMARY_CTA.href).toBe(HOME_PRIMARY_CTA.href);
    expect(HERO_PRIMARY_CTA.label).toBe(HOME_PRIMARY_CTA.label);
    expect(HERO_SECONDARY_CTA.href).toBe(HOME_SECONDARY_CTA.href);
    expect(HERO_SECONDARY_CTA.label).toBe(HOME_SECONDARY_CTA.label);
    expect(PRIMARY_CTA.href).toBe(HOME_PRIMARY_CTA.href);
    expect(PRIMARY_CTA.label).toBe(HOME_PRIMARY_CTA.label);
    expect(out).toMatch(/data-cta-id="hero_pilot"/);
    expect(out).toMatch(/data-cta-id="hero_score"/);
    expect(out).toMatch(/data-cta-id="run_cohort_pilot"/);
    expect(out).toMatch(/data-cta-id="home_final_pilot"/);
    expect(out).toMatch(/data-cta-id="home_final_score"/);
    expect((out.match(/href="\/solutions\/accelerator#pilot"/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it("the trust line sits under the search box", () => {
    expect(out).toContain('data-testid="hero-trust-line"');
    expect(text).toContain("Australian-built · Evidence-backed · Founder-controlled data");
  });
});

describe("homepage v7 — copy rules (G17 D3 + G21 § 3.2)", () => {
  it("no A$ price strings, no tier ladder, no unlock preview, no pricing table, no /month", () => {
    expect(text).not.toMatch(/A\$\d/);
    expect(out).not.toContain("hero-tier-strip");
    expect(out).not.toContain('data-testid="unlock-preview"');
    expect(out).not.toMatch(/id="tiers"/);
    expect(text).not.toMatch(/\/month\b/);
  });

  it("no agent counts, no '13 criteria', no beta, no 'our AI is better' anywhere in <main>", () => {
    expect(mainText).not.toMatch(/\b\d+ (AI[- ])?(C-Level )?agents?\b/i);
    expect(mainText).not.toMatch(/C-Level agents/i);
    expect(mainText).not.toMatch(/13[- ]criteria|thirteen criteria/i);
    expect(mainText).not.toMatch(/\bbeta\b/i);
    expect(mainText).not.toMatch(/coming soon/i);
    expect(mainText).not.toMatch(/our AI|better than ChatGPT|smarter than|more accurate than|AI decides|predicts/i);
    // The old G17 card walls are gone.
    expect(out).not.toContain('data-testid="home-go-deeper"');
    expect(out).not.toContain('data-testid="sample-result-card"');
    expect(out).not.toContain('data-testid="stat-strip"');
    expect(mainText).not.toContain("One rubric, three kinds of evaluator.");
  });
});

describe("homepage v7 — sections in order", () => {
  it("<main> holds hero + problem · sequence · messages · why-not-chatgpt · built-for · trust · cta, in that order (TrustBand between built-for and the closing band, G21 P0-A)", () => {
    const ids = [...main.matchAll(/<section[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids).toEqual([...HOME_SECTION_IDS.slice(0, 5), "trust", "cta"]);
    expect(HOME_SECTION_IDS).toEqual(["problem", "sequence", "messages", "why-not-chatgpt", "built-for", "cta"]);
    // + the hero section (aria-labelledby, no id) + the trust band = eight.
    expect((main.match(/<section\b/g) ?? []).length).toBe(HOME_SECTION_IDS.length + 2);
    expect(main).toContain('aria-labelledby="page-hero-heading"');
    expect(main).toContain('data-testid="trust-band"');
    const src = readFileSync(resolve(__dirname, "page.tsx"), "utf8");
    expect(src.indexOf("<TrustBand />")).toBeGreaterThan(src.indexOf('id="built-for"'));
    expect(src.indexOf("<TrustBand />")).toBeLessThan(src.indexOf("<CtaBand"));
  });

  it("a. Problem — the H2, three linked steps (Different inputs → Subjective review → Weak feedback) with inline SVG arrows", () => {
    expect(text).toContain(HOME_PROBLEM.title);
    expect(HOME_PROBLEM.title).toBe("Startup screening was not designed to scale.");
    expect(HOME_PROBLEM_STEPS.map((s) => s.title)).toEqual(["Different inputs", "Subjective review", "Weak feedback"]);
    expect(out).toContain('data-testid="problem-flow"');
    const flow = out.slice(out.indexOf('data-testid="problem-flow"'), out.indexOf('id="sequence"'));
    expect((flow.match(/data-flow-arrow/g) ?? []).length).toBe(2);
    expect((flow.match(/<svg\b/g) ?? []).length).toBe(2);
    expect(flow).toContain("rotate-90 lg:rotate-0"); // down when stacked at 375, right on lg
    for (const ex of ["PDF", "Forms", "Decks", "E-mails", "Spreadsheets", "Different reviewers", "Inconsistent criteria", "Incomplete evidence"]) {
      expect(text, ex).toContain(ex);
    }
    expect(text).toMatch(/Founders get a yes or a no/);
    expect(text).toMatch(/sponsors cannot measure cohort improvement/);
    expect(text).toMatch(/evaluators cannot easily compare companies/);
  });

  it("b. Product sequence — six steps in one flow, the whole block links /product, the sample dossier link under it", () => {
    expect(HOME_SEQUENCE_STEPS.map((s) => s.title)).toEqual([
      "Founder application",
      "Evidence extracted",
      "SVI + confidence",
      "Evaluator dossier",
      "Cohort table",
      "Progress over time",
    ]);
    expect(out).toContain('data-testid="sequence-flow"');
    const flow = out.slice(out.indexOf('data-testid="sequence-flow"'), out.indexOf('id="messages"'));
    expect((flow.match(/data-flow-arrow/g) ?? []).length).toBe(5);
    for (const s of HOME_SEQUENCE_STEPS) expect(text, s.title).toContain(s.title);
    expect(HOME_SEQUENCE.href).toBe("/product");
    expect(flow).toMatch(/<a[^>]*data-cta-id="home_sequence_product"[^>]*href="\/product"|<a[^>]*href="\/product"[^>]*data-cta-id="home_sequence_product"/);
    expect(flow).toContain("after:absolute after:inset-0"); // the stretched link covers the block
    expect(out).toContain(`href="${HOME_SAMPLE_LINK.href}"`);
    expect(out).toMatch(/data-cta-id="home_sample_dossier"/);
  });

  it("c. Three messages — Screen faster / Trust the evidence / Track improvement with the approved one-liners", () => {
    expect(HOME_MESSAGES.map((m) => [m.title, m.body])).toEqual([
      ["Screen faster", "Every applicant is normalised into the same framework."],
      ["Trust the evidence", "Scores show what evidence supports them and what remains unverified."],
      ["Track improvement", "Re-assess companies through the program and measure movement."],
    ]);
    for (const m of HOME_MESSAGES) {
      expect(text).toContain(m.title);
      expect(text).toContain(m.body);
    }
  });

  it("d. Why not ChatGPT? — two columns (6 vs 8 items) and the one institutional line, no AI-superiority wording", () => {
    expect(text).toContain("Why not ChatGPT?");
    expect(out).toContain('data-testid="why-not-chatgpt"');
    expect(HOME_WHY_NOT.other.items).toEqual([
      "One-off",
      "Prompt dependent",
      "No persistent company record",
      "Inconsistent comparison",
      "No evidence hierarchy",
      "No institutional workflow",
    ]);
    expect(HOME_WHY_NOT.ours.items).toEqual([
      "Persistent startup record",
      "Common rubric",
      "Evidence provenance",
      "Verification status",
      "Comparable cohorts",
      "Score history",
      "Evaluator workflow",
      "Audit trail",
    ]);
    for (const item of [...HOME_WHY_NOT.other.items, ...HOME_WHY_NOT.ours.items]) expect(text, item).toContain(item);
    expect(HOME_WHY_NOT.line).toBe(
      "ChatGPT analyses what you paste. BlockID builds and maintains a structured, evidence-backed company record and applies the same assessment methodology across every company and every point in time.",
    );
    expect(text).toContain(HOME_WHY_NOT.line);
    expect(JSON.stringify(HOME_WHY_NOT)).not.toMatch(/better|smarter|superior|outperform/i);
  });

  it("e. Built for — six text chips, no logos (no <img> in the section)", () => {
    expect(HOME_BUILT_FOR).toEqual(["Accelerators", "Incubators", "Universities", "Innovation Programs", "Venture Studios", "Funds"]);
    expect(out).toContain('data-testid="built-for"');
    const band = out.slice(out.indexOf('id="built-for"'), out.indexOf('id="cta"'));
    for (const label of HOME_BUILT_FOR) expect(textOf(band), label).toContain(label);
    expect(band).not.toMatch(/<img\b/);
  });

  it("g. one light (sunken) CtaBand with the two CTAs — G26: no dark band anywhere on the page", () => {
    expect(out).toMatch(/<section[^>]*id="cta"[^>]*data-tone="sunken"/);
    expect(out).not.toMatch(/<section[^>]*data-theme="dark"/);
    const band = out.slice(out.indexOf('id="cta"'));
    expect(band).toContain("Run a cohort pilot");
    expect(band).toContain("Score my startup");
  });
});

describe("homepage v7 — chrome", () => {
  it("the seven nav labels are present and the nav CTA is Run a cohort pilot", () => {
    const labels = ["Product", "For Programs", "For Investors", "For Founders", "Methodology", "Startup Index", "Pricing"];
    for (const label of labels) expect(text).toContain(label);
    expect(MENU.map((e) => e.label)).toEqual(labels);
    expect(out).not.toMatch(/aria-haspopup="menu"/);
  });

  it("one header + one footer landmark; the footer is the shared one and names both roles from the config (G21 P0-A)", () => {
    expect((out.match(/<header\b/g) ?? []).length).toBe(1);
    expect((out.match(/<footer\b/g) ?? []).length).toBe(1);
    expect(out).toContain('aria-labelledby="marketing-footer-heading"');
    expect(text).toContain(LEGAL_ENTITY.marketingOperator);
    expect(text).toContain(marketingLine(new Date().getUTCFullYear()));
    for (const col of ["Product", "For", "Company", "Legal"]) expect(out).toContain(`>${col}<`);
  });
});
