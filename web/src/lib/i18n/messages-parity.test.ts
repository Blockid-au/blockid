// Catalogue parity guard (T0274). `t()` falls back to English for a missing
// Vietnamese key, so a persona page never crashes — it silently renders an
// English sentence in the middle of a Vietnamese page. That is exactly the
// failure this suite exists to catch before deploy: every key a solutions
// page reads must exist in both catalogues, and the persona pages' approved
// numbers must appear the same way in both languages.

import { describe, expect, it } from "vitest";

import en from "./messages/en.json";
import vi from "./messages/vi.json";

const EN = en as Record<string, string>;
const VI = vi as Record<string, string>;

const enKeys = (prefix: string) => Object.keys(EN).filter((k) => k.startsWith(prefix));
const viKeys = (prefix: string) => Object.keys(VI).filter((k) => k.startsWith(prefix));

describe("solutions.* catalogue parity (en ⇄ vi)", () => {
  it.each(["solutions.advisor.", "solutions.investor.", "solutions.accelerator."])(
    "every %s key in en.json exists in vi.json, and vice versa",
    (prefix) => {
      const missingInVi = enKeys(prefix).filter((k) => !(k in VI));
      const missingInEn = viKeys(prefix).filter((k) => !(k in EN));
      expect(missingInVi, `missing in vi.json`).toEqual([]);
      expect(missingInEn, `missing in en.json`).toEqual([]);
    },
  );

  it("the shared evaluator keys (ChatGPT FAQ, data principle, secondary CTAs) exist in both", () => {
    for (const key of [
      "solutions.faq.chatgpt.q",
      "solutions.faq.chatgpt.a",
      "solutions.principle.data",
      "solutions.cta.secondary.evaluatorPricing",
      "solutions.cta.secondary.contactSales",
      "meta.solutions.advisor.title",
      "meta.solutions.advisor.description",
    ]) {
      expect(EN[key], `en ${key}`).toBeTruthy();
      expect(VI[key], `vi ${key}`).toBeTruthy();
    }
  });

  it("every solutions.* key in either catalogue exists in the other (the wider net)", () => {
    const missingInVi = enKeys("solutions.").filter((k) => !(k in VI));
    const missingInEn = viKeys("solutions.").filter((k) => !(k in EN));
    expect(missingInVi).toEqual([]);
    expect(missingInEn).toEqual([]);
  });

  it("no solutions.* value is empty in either catalogue", () => {
    for (const k of enKeys("solutions.")) {
      expect(EN[k]!.trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(VI[k]!.trim().length, `vi ${k}`).toBeGreaterThan(0);
    }
  });

  it("price tokens used in an EN string are the same tokens in its VI twin", () => {
    // `{firmPrice}` in English and a literal "A$149" in Vietnamese would be
    // the drift this whole token scheme exists to prevent.
    const tokens = (s: string) => (s.match(/\{[a-zA-Z]+\}/g) ?? []).sort();
    for (const k of enKeys("solutions.")) {
      expect(tokens(VI[k]!), k).toEqual(tokens(EN[k]!));
    }
  });
});

describe("solutions.* approved wording", () => {
  const evaluatorKeys = [
    ...enKeys("solutions.advisor."),
    ...enKeys("solutions.investor."),
    ...enKeys("solutions.accelerator."),
    "solutions.faq.chatgpt.a",
    "solutions.principle.data",
  ];
  const enText = evaluatorKeys.map((k) => EN[k]).join("\n");
  const viText = evaluatorKeys.map((k) => VI[k]).join("\n");

  it("never writes 'PhD' in either language", () => {
    expect(enText).not.toMatch(/PhD/);
    expect(viText).not.toMatch(/PhD/);
  });

  it("carries the approved data principle verbatim in English", () => {
    expect(EN["solutions.principle.data"]).toBe(
      "Your data belongs to your startup. We store it so every report builds on your own evidence and the AI reasons on your case. Founder-consented access tiers control who sees what.",
    );
  });

  it("carries the three approved segment lines verbatim (EN and VI)", () => {
    expect(EN["solutions.investor.headline"]).toBe(
      "One score across 8 investor dimensions, backed by the startup's own evidence — screen a deal in minutes and watch it move every week.",
    );
    expect(EN["solutions.accelerator.headline"]).toBe(
      "Score the whole cohort on one rubric, then show sponsors the progress — automatically.",
    );
    expect(EN["solutions.advisor.headline"]).toBe(
      "A C-suite review of every client, in AUD, with ESIC and R&D Tax checks — white-labelled, A$3 a report.",
    );
    expect(VI["solutions.investor.headline"]).toBe(
      "Một điểm số trên 8 tiêu chí nhà đầu tư, dựa trên chính dữ liệu của startup — sàng lọc deal trong vài phút và theo dõi biến động mỗi tuần.",
    );
    expect(VI["solutions.accelerator.headline"]).toBe(
      "Chấm cả cohort trên một bộ tiêu chí, rồi báo cáo tiến độ cho nhà tài trợ — tự động.",
    );
    expect(VI["solutions.advisor.headline"]).toBe(
      "Một bản đánh giá cấp C-suite cho mỗi khách hàng, tính bằng AUD, kèm kiểm tra ESIC và R&D Tax — gắn thương hiệu của bạn, A$3 mỗi báo cáo.",
    );
  });

  it("names the truthful counts and never the stale ones", () => {
    expect(enText).toMatch(/11 C-Level agents/);
    expect(enText).toMatch(/13 criteria/);
    expect(enText).toMatch(/12 growth phases/);
    expect(enText).not.toMatch(/17 (AI|C-Level)/);
    expect(enText).not.toMatch(/8 AI Agents/);
    expect(enText).not.toContain("5.50");
  });

  it("does not claim batch scoring or the sponsor/LP export is live", () => {
    // T0272 flips these when Program ships them; until then the accepted
    // wording is "coming in this release".
    expect(EN["solutions.accelerator.faq.a1"]).toMatch(/coming in this release/);
    expect(EN["solutions.accelerator.faq.a2"]).toMatch(/coming in this release/);
  });
});
