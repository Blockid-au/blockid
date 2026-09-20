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
    const tokens = (s: string) => (s.match(/\{[a-zA-Z0-9]+\}/g) ?? []).sort();
    for (const k of enKeys("solutions.")) {
      expect(tokens(VI[k]!), k).toEqual(tokens(EN[k]!));
    }
  });
});

describe("compare.* catalogue parity (en ⇄ vi) — T0274 part 2", () => {
  it.each(["compare.", "meta.compare."])(
    "every %s key in en.json exists in vi.json, and vice versa",
    (prefix) => {
      expect(enKeys(prefix).filter((k) => !(k in VI)), "missing in vi.json").toEqual([]);
      expect(viKeys(prefix).filter((k) => !(k in EN)), "missing in en.json").toEqual([]);
    },
  );

  it("no compare.* value is empty, and price tokens match between the two languages", () => {
    const tokens = (s: string) => (s.match(/\{[a-zA-Z0-9]+\}/g) ?? []).sort();
    for (const k of [...enKeys("compare."), ...enKeys("meta.compare.")]) {
      expect(EN[k]!.trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(VI[k]!.trim().length, `vi ${k}`).toBeGreaterThan(0);
      expect(tokens(VI[k]!), k).toEqual(tokens(EN[k]!));
    }
  });

  it("carries the approved data principle verbatim, never 'PhD', never the retired A$5.50", () => {
    const enText = enKeys("compare.").map((k) => EN[k]).join("\n");
    const viText = viKeys("compare.").map((k) => VI[k]).join("\n");
    expect(EN["compare.table.row.confidentiality.blockid"]).toBe(EN["solutions.principle.data"]);
    expect(VI["compare.table.row.confidentiality.blockid"]).toBe(VI["solutions.principle.data"]);
    expect(enText).not.toMatch(/PhD/);
    expect(viText).not.toMatch(/PhD/);
    expect(enText).not.toContain("5.50");
    expect(enText).toContain("grounded in the founder's doctoral research (DBA) on startup valuation");
    // G18-C (docs/design/messaging.md § 4): the public term is "8 SVI
    // dimensions"; "13 criteria" is rubric depth for /methodology only and
    // the agent count is never stated.
    expect(enText).toMatch(/8 SVI dimensions/);
    expect(enText).not.toMatch(/13 criteria|13-criteria/);
    expect(enText).not.toMatch(/\b11 C-Level agents/);
    expect(enText).toMatch(/12 growth phases/);
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
    // G21 P0-C (2026-09-20, FI advisor feedback § 9): investor = standardise
    // the first pass; accelerator = the BlockID Cohort page. Advisor keeps
    // the G14 §2.4 "pass with reasons" line.
    expect(EN["solutions.investor.headline"]).toBe(
      "Standardise the first-pass review before human investment judgement begins.",
    );
    expect(EN["solutions.accelerator.headline"]).toBe(
      "Turn your next startup intake into a comparable, evidence-backed cohort.",
    );
    expect(EN["solutions.founder.headline"]).toBe(
      "See what an evaluator can verify — not only what your pitch says.",
    );
    expect(EN["solutions.advisor.headline"]).toBe(
      "A C-suite review of every client, in AUD, with ESIC and R&D Tax checks — white-labelled, A$3 a report.",
    );
    expect(VI["solutions.investor.headline"]).toBe(
      "Chuẩn hoá vòng sàng lọc đầu tiên trước khi phán đoán đầu tư của con người bắt đầu.",
    );
    expect(VI["solutions.accelerator.headline"]).toBe(
      "Biến đợt tuyển sinh startup tiếp theo thành một khoá có thể so sánh, dựa trên bằng chứng.",
    );
    // The supports-not-replaces line and the founder closing line, verbatim.
    expect(EN["solutions.investor.statement.title"]).toBe("BlockID supports due diligence. It does not replace due diligence.");
    expect(EN["solutions.accelerator.statement.body"]).toBe("BlockID structures the evidence and standardises the first-pass analysis. Humans make the decision.");
    expect(EN["solutions.founder.lede"]).toBe("You'll know exactly what to fix before your next application or investor meeting.");
    expect(VI["solutions.advisor.headline"]).toBe(
      "Một bản đánh giá cấp C-suite cho mỗi khách hàng, tính bằng AUD, kèm kiểm tra ESIC và R&D Tax — gắn thương hiệu của bạn, A$3 mỗi báo cáo.",
    );
  });

  it("names the truthful counts and never the stale ones", () => {
    // G18-C (docs/design/messaging.md § 4): the public term is "8 SVI
    // dimensions"; "13 criteria" is rubric depth for /methodology only and
    // the agent count is never stated.
    expect(enText).toMatch(/8 SVI dimensions/);
    expect(enText).not.toMatch(/13 criteria|13-criteria/);
    expect(enText).not.toMatch(/\b11 C-Level agents/);
    expect(enText).toMatch(/12 growth phases/);
    expect(enText).not.toMatch(/17 (AI|C-Level)/);
    expect(enText).not.toMatch(/8 AI Agents/);
    expect(enText).not.toContain("5.50");
  });

  it("describes batch scoring and the sponsor/LP export as shipped (T0272)", () => {
    // T0272 shipped Program batch scoring (one rubric, off-peak, cohort table
    // + CSV) and the sponsor/LP report export — the "coming in this release"
    // / "in build" wording must not come back.
    for (const key of ["solutions.accelerator.benefit1.body", "solutions.accelerator.faq.a1", "solutions.accelerator.faq.a2"]) {
      expect(EN[key]).not.toMatch(/coming in this release|in build|no packaged/i);
      expect(VI[key]).not.toMatch(/sẽ có trong bản phát hành này/);
    }
    expect(EN["solutions.accelerator.faq.a1"]).toMatch(/cohort table/);
    expect(EN["solutions.accelerator.faq.a1"]).toMatch(/CSV/);
    expect(EN["solutions.accelerator.faq.a2"]).toMatch(/sponsor \/ LP report/);
  });
});

describe("funding.copy.* catalogue parity (en ⇄ vi) — T0248 messaging pack", () => {
  it.each(["funding.copy.", "meta.funding."])("every %s key in en.json exists in vi.json, and vice versa", (prefix) => {
    expect(enKeys(prefix).filter((k) => !(k in VI)), "missing in vi.json").toEqual([]);
    expect(viKeys(prefix).filter((k) => !(k in EN)), "missing in en.json").toEqual([]);
  });

  it("no funding.copy.* value is empty, tokens match, and the numbers are Free / A$3 / A$29 only", () => {
    const tokens = (s: string) => (s.match(/\{[a-zA-Z_]+\}/g) ?? []).sort();
    for (const k of enKeys("funding.copy.")) {
      expect(EN[k]!.trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(VI[k]!.trim().length, `vi ${k}`).toBeGreaterThan(0);
      expect(tokens(VI[k]!), k).toEqual(tokens(EN[k]!));
    }
    const text = enKeys("funding.copy.").map((k) => EN[k]).join("\n");
    expect(text).not.toMatch(/PhD|5\.50|A\$99/);
  });
});

describe("intake.* catalogue parity (en ⇄ vi) — G14 S35 /apply/[slug]", () => {
  it("every intake.* key in either catalogue exists in the other, none empty, tokens match", () => {
    expect(enKeys("intake.").filter((k) => !(k in VI)), "missing in vi.json").toEqual([]);
    expect(viKeys("intake.").filter((k) => !(k in EN)), "missing in en.json").toEqual([]);
    expect(enKeys("intake.").length).toBeGreaterThanOrEqual(30);
    const tokens = (s: string) => (s.match(/\{[a-zA-Z0-9]+\}/g) ?? []).sort();
    for (const k of enKeys("intake.")) {
      expect(EN[k]!.trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(VI[k]!.trim().length, `vi ${k}`).toBeGreaterThan(0);
      expect(tokens(VI[k]!), k).toEqual(tokens(EN[k]!));
    }
  });

  it("the consent checkbox carries the approved data principle verbatim (D2) in both languages", () => {
    expect(EN["intake.consent.sentence"]).toBe(EN["solutions.principle.data"]);
    expect(VI["intake.consent.sentence"]).toBe(VI["solutions.principle.data"]);
    expect(enKeys("intake.").map((k) => EN[k]).join("\n")).not.toMatch(/PhD/);
    expect(viKeys("intake.").map((k) => VI[k]).join("\n")).not.toMatch(/PhD/);
  });

  it("every runner error code the public form can receive has an intake.error.* line", () => {
    for (const code of ["duplicate", "deck_required", "deck_too_large", "deck_type", "deck_infected", "scanner_unavailable", "consent_required", "invalid_input", "rate_limited", "closed", "generic"]) {
      expect(EN[`intake.error.${code}`], code).toBeTruthy();
    }
    for (const reason of ["closed", "not_open_yet", "window_closed", "full"]) expect(EN[`intake.closed.${reason}`], reason).toBeTruthy();
  });
});

// G14-S34 — the founder feedback letter (lib/evaluations/feedback-letter.ts
// renderLetter reads these for EN and VI; the landing block, the email and
// the assessor opt-out checkbox share the prefix). A missing VI key would
// render an English sentence inside a Vietnamese letter.
describe("feedback.* catalogue parity (en ⇄ vi) — G14-S34", () => {
  const tokens = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

  it("every feedback.* key exists in both catalogues and none is empty", () => {
    const missingInVi = enKeys("feedback.").filter((k) => !(k in VI));
    const missingInEn = viKeys("feedback.").filter((k) => !(k in EN));
    expect(missingInVi, "missing in vi.json").toEqual([]);
    expect(missingInEn, "missing in en.json").toEqual([]);
    expect(enKeys("feedback.").length).toBeGreaterThanOrEqual(20);
    for (const k of enKeys("feedback.")) {
      expect(EN[k].trim(), k).not.toBe("");
      expect(VI[k].trim(), k).not.toBe("");
    }
  });

  it("the {tokens} an EN string interpolates are the same tokens in its VI twin", () => {
    for (const k of enKeys("feedback.")) expect(tokens(VI[k]), k).toEqual(tokens(EN[k]));
  });

  it("the letter never names an evaluator, decision or conviction and states the k-floor (D3 / F-5)", () => {
    const en = enKeys("feedback.letter.").map((k) => EN[k]).join("\n");
    expect(en).not.toMatch(/PhD/);
    expect(en).toMatch(/at least 3 evaluators from at least 2 organisations/);
    expect(en).toMatch(/never identified/);
    expect(EN["feedback.optOut.label"]).toBe("Exclude my ratings from the founder's anonymised feedback letter");
  });
});

describe("execution.* catalogue parity (en ⇄ vi) — G14-S37 founder execution profile", () => {
  it("every execution.* key exists in both catalogues, none is empty, and the {token}s match", () => {
    const tokens = (s: string) => (s.match(/\{[a-zA-Z0-9]+\}/g) ?? []).sort();
    expect(enKeys("execution.").length).toBeGreaterThanOrEqual(60);
    expect(enKeys("execution.").filter((k) => !(k in VI)), "missing in vi.json").toEqual([]);
    expect(viKeys("execution.").filter((k) => !(k in EN)), "missing in en.json").toEqual([]);
    for (const k of enKeys("execution.")) {
      expect(EN[k]!.trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(VI[k]!.trim().length, `vi ${k}`).toBeGreaterThan(0);
      expect(tokens(VI[k]!), k).toEqual(tokens(EN[k]!));
    }
  });

  it("carries the rubric weights and the 70 cap in both languages", () => {
    for (const cat of [EN, VI]) {
      expect(cat["execution.score.rubric"]).toMatch(/30/);
      expect(cat["execution.score.rubric"]).toMatch(/15/);
      expect(cat["execution.score.rubric"]).toMatch(/20/);
      expect(cat["execution.score.capped"]).toMatch(/70/);
    }
  });
});

// G14-S36 F-6 leftover — the founder weekly digest's "why my score changed"
// line (lib/digest/why-score-moved.ts) reads this key for both locales.
describe("digest.why_moved.* catalogue parity (en ⇄ vi) — G14-S36 F-6", () => {
  const tokens = (s: string) => (s.match(/\{[a-zA-Z0-9]+\}/g) ?? []).sort();

  it("every digest.why_moved.* key exists in both catalogues, none empty, and the {level} token matches", () => {
    const missingInVi = enKeys("digest.why_moved.").filter((k) => !(k in VI));
    const missingInEn = viKeys("digest.why_moved.").filter((k) => !(k in EN));
    expect(missingInVi, "missing in vi.json").toEqual([]);
    expect(missingInEn, "missing in en.json").toEqual([]);
    for (const k of enKeys("digest.why_moved.")) {
      expect(EN[k]!.trim().length, `en ${k}`).toBeGreaterThan(0);
      expect(VI[k]!.trim().length, `vi ${k}`).toBeGreaterThan(0);
      expect(tokens(VI[k]!), k).toEqual(tokens(EN[k]!));
    }
    expect(EN["digest.why_moved.sentence"]).toContain("{level}");
  });
});
