// A1 (pricing v5 §7.4) — catalogue integrity.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { MODEL_CATALOG, admittedModelIds, catalogKey, catalogPrice, feedCheckedModels, findCatalogModel, modelsForRole } from "./model-catalog";
import { REPORT_ADMITTED_MODELS } from "./report-admitted-models";
import { REPORT_POLICY_PINNED_PRICES } from "./report-attempt-budget";

describe("model catalogue integrity", () => {
  it("(provider, id) pairs are unique", () => {
    const keys = MODEL_CATALOG.map(catalogKey);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("admitted ⊆ DeepInfra, and equals REPORT_ADMITTED_MODELS (G30: report scope is DeepInfra-only)", () => {
    for (const m of MODEL_CATALOG.filter((x) => x.admitted)) expect(m.provider, m.id).toBe("deepinfra");
    expect(admittedModelIds().sort()).toEqual([...REPORT_ADMITTED_MODELS].sort());
  });

  it("admitted prices equal the founder-pinned report price policy (micro-USD per 1k = USD per 1M × 1000)", () => {
    for (const id of admittedModelIds()) {
      const pinned = REPORT_POLICY_PINNED_PRICES[id];
      expect(pinned, id).toBeDefined();
      const price = catalogPrice(findCatalogModel("deepinfra", id)!);
      expect(Math.round(price!.in * 1000), id).toBe(pinned.input);
      expect(Math.round(price!.out * 1000), id).toBe(pinned.output);
      expect(findCatalogModel("deepinfra", id)!.contextTokens, id).toBe(pinned.context);
    }
  });

  it("every paid row has a positive in/out price in model-prices.ts; free / subscription rows are zero", () => {
    for (const m of MODEL_CATALOG) {
      const p = catalogPrice(m);
      expect(p, catalogKey(m)).not.toBeNull();
      if (m.billing === "paid") {
        expect(p!.in, catalogKey(m)).toBeGreaterThan(0);
        expect(p!.out, catalogKey(m)).toBeGreaterThan(0);
      } else {
        expect(p, catalogKey(m)).toEqual({ in: 0, out: 0 });
      }
    }
  });

  it("rows are well formed: context > 0, text capability, ISO verified date, https source", () => {
    for (const m of MODEL_CATALOG) {
      expect(m.contextTokens, m.id).toBeGreaterThan(0);
      expect(m.capabilities, m.id).toContain("text");
      expect(m.verifiedAt, m.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(m.source, m.id).toMatch(/^https:\/\//);
      if (m.provider === "openrouter") expect(m.id.endsWith(":free") ? m.billing : "paid", m.id).toBe(m.id.endsWith(":free") ? "free" : "paid");
      if (m.roles.some((a) => a.role === "vision")) expect(m.capabilities, m.id).toContain("vision");
    }
  });

  it("§7.3 matrix: each role has a primary, and the report chapter never names a non-DeepInfra or free model", () => {
    for (const role of ["report_chapter", "ceo_synthesis", "grounding_judge", "extraction_classify", "translation", "chat", "vision"] as const) {
      expect(modelsForRole(role).filter((m) => m.tier === "primary").length, role).toBeGreaterThan(0);
    }
    expect(modelsForRole("report_chapter")[0].id).toBe("deepseek-ai/DeepSeek-V3.2");
    for (const m of modelsForRole("report_chapter")) expect(m.provider).toBe("deepinfra");
    // gpt-oss-120b gave 0 citations in the G30 smoke — it must never serve a report or judge role.
    for (const role of ["report_chapter", "grounding_judge"] as const) {
      expect(modelsForRole(role).some((m) => m.provider === "deepinfra" && m.id === "openai/gpt-oss-120b"), role).toBe(false);
    }
  });

  it("every DeepInfra and OpenRouter row is checked by the nightly feed sync", () => {
    const checked = new Set(feedCheckedModels().map(catalogKey));
    for (const m of MODEL_CATALOG.filter((x) => x.provider === "deepinfra" || x.provider === "openrouter")) expect(checked.has(catalogKey(m)), m.id).toBe(true);
  });
});
