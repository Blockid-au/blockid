// S32-C — "which model wrote my report" (meta.ts). Pure, no I/O.
//
// Pins: provider ids map to honest human labels (the Claude Max CLI token is
// "Claude", never "Anthropic API"), model ids lose their vendor prefix and
// `:free` suffix, the CEO is `synthesis` and the rest `report`, labels are
// ordered most-used first, and a report with no agent sections still gets
// a truthful line rather than a model name that never ran.

import { describe, expect, it } from "vitest";
import { buildReportMeta, modelLabel, providerLabel, sectionLabel } from "./meta";
import type { AgentSection, FirstAnalysisAgent } from "./types";

function section(role: FirstAnalysisAgent, provider?: string, model?: string): AgentSection {
  return { role, title: "t", body: "b", nextSteps: ["a", "b", "c"], wordCount: 200, provider, model, generatedAt: "2026-09-15T00:00:00.000Z" };
}

describe("labels", () => {
  it("providerLabel names the dispatcher provider honestly", () => {
    expect(providerLabel("deepinfra")).toBe("DeepInfra");
    expect(providerLabel("gemini")).toBe("Google Gemini");
    expect(providerLabel("claude-apikey")).toBe("Anthropic API");
    expect(providerLabel("claude-oauth")).toBe("Claude");
    expect(providerLabel("groq")).toBe("Groq");
    expect(providerLabel("")).toBe("unknown provider");
    expect(providerLabel("chutes")).toBe("chutes");
  });

  it("modelLabel strips the vendor path and the :free suffix", () => {
    expect(modelLabel("deepseek-ai/DeepSeek-V4-Flash")).toBe("DeepSeek-V4-Flash");
    expect(modelLabel("moonshotai/kimi-k2.6:free")).toBe("kimi-k2.6");
    expect(modelLabel("claude-sonnet-5")).toBe("claude-sonnet-5");
  });

  it("sectionLabel is null when nothing is known", () => {
    expect(sectionLabel({})).toBeNull();
    expect(sectionLabel({ model: "m" })).toBe("m");
    expect(sectionLabel({ provider: "gemini", model: "gemini-2.5-flash" })).toBe("gemini-2.5-flash via Google Gemini");
  });
});

describe("buildReportMeta", () => {
  it("records every written section with its class, orders labels most-used first, and writes the Prepared-with line", () => {
    const meta = buildReportMeta({
      ceo: section("ceo", "gemini", "gemini-3.1-pro-preview"),
      cfo: section("cfo", "deepinfra", "deepseek-ai/DeepSeek-V4-Flash"),
      cmo: section("cmo", "deepinfra", "deepseek-ai/DeepSeek-V4-Flash"),
      cto: section("cto", "claude-oauth", "claude-sonnet-5"),
    });
    expect(meta.sections.ceo).toEqual({ provider: "gemini", model: "gemini-3.1-pro-preview", taskClass: "synthesis", status: "done" });
    expect(meta.sections.cfo?.taskClass).toBe("report");
    expect(meta.sections.clo).toBeUndefined();
    expect(meta.models).toEqual([
      "DeepSeek-V4-Flash via DeepInfra",
      "claude-sonnet-5 via Claude",
      "gemini-3.1-pro-preview via Google Gemini",
    ]);
    expect(meta.preparedWith).toBe("Prepared with DeepSeek-V4-Flash via DeepInfra · claude-sonnet-5 via Claude · gemini-3.1-pro-preview via Google Gemini.");
  });

  it("with no sections (or sections without provider info) the line names no model", () => {
    expect(buildReportMeta({}).preparedWith).toBe("Prepared with BlockID's C-level AI agents.");
    const meta = buildReportMeta({ ceo: section("ceo") });
    expect(meta.models).toEqual([]);
    expect(meta.sections.ceo).toEqual({ provider: "", model: "", taskClass: "synthesis", status: "done" });
  });

  it("S32-E: a failed / unavailable voice is listed with the model that last tried it, but never in the Prepared-with line", () => {
    const meta = buildReportMeta(
      { ceo: section("ceo", "deepinfra", "deepseek-ai/DeepSeek-V4-Flash") },
      {
        chro: { status: "failed", attempts: 1, provider: "groq", model: "allam-2-7b", error: "ungrounded" },
        clo: { status: "unavailable", attempts: 3, provider: "groq", model: "allam-2-7b" },
        cfo: { status: "pending", attempts: 0 },
      },
    );
    expect(meta.sections.chro).toEqual({ provider: "groq", model: "allam-2-7b", taskClass: "report", status: "failed" });
    expect(meta.sections.clo?.status).toBe("unavailable");
    expect(meta.sections.cfo).toBeUndefined();
    expect(meta.models).toEqual(["DeepSeek-V4-Flash via DeepInfra"]);
    expect(meta.preparedWith).toBe("Prepared with DeepSeek-V4-Flash via DeepInfra.");
  });
});
