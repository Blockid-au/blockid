// Colocated vitest for lib/intake/templates{,-shared}.ts (G21 P2-A). Pins:
//   * question normalisation: key derivation, reserved / duplicate keys,
//     select options, the 20-question cap;
//   * answer validation per type + required;
//   * owner-scoped CRUD against the memory store; not_migrated → empty list.

import { describe, expect, it } from "vitest";
import { createTemplate, deleteTemplate, getTemplate, getTemplateById, listTemplates, memoryTemplateStore, updateTemplate } from "./templates";
import { keyFromLabel, mapTemplateRow, normaliseQuestions, normaliseTemplateInput, validateAnswers } from "./templates-shared";

describe("keyFromLabel / normaliseQuestions", () => {
  it("derives a stable key from the label and keeps an explicit one", () => {
    expect(keyFromLabel("Team size (FTE)")).toBe("team_size_fte");
    expect(keyFromLabel("2024 revenue")).toBe("revenue");
    expect(keyFromLabel("!!!")).toBe("q");
    const r = normaliseQuestions([{ label: "Team size (FTE)", type: "number" }, { key: "MRR", label: "Monthly revenue", type: "number", required: true }]);
    expect(r).toEqual({
      ok: true,
      questions: [
        { key: "team_size_fte", label: "Team size (FTE)", type: "number", required: false },
        { key: "mrr", label: "Monthly revenue", type: "number", required: true },
      ],
    });
  });
  it("rejects reserved, duplicate and malformed keys, an empty select, and > 20 questions", () => {
    expect(normaliseQuestions([{ key: "founder_email", label: "E-mail" }])).toMatchObject({ ok: false, message: expect.stringContaining("fixed form field") });
    expect(normaliseQuestions([{ key: "a", label: "A" }, { key: "a", label: "B" }])).toMatchObject({ ok: false, message: expect.stringContaining("duplicate") });
    expect(normaliseQuestions([{ key: "1bad", label: "A" }])).toMatchObject({ ok: false });
    expect(normaliseQuestions([{ label: "Pick", type: "select" }])).toMatchObject({ ok: false, message: expect.stringContaining("option") });
    expect(normaliseQuestions(Array.from({ length: 21 }, (_, i) => ({ label: `Q${i}` })))).toMatchObject({ ok: false });
    expect(normaliseQuestions("nope")).toMatchObject({ ok: false });
    expect(normaliseQuestions(undefined)).toEqual({ ok: true, questions: [] });
  });
  it("unknown types fall back to text; select options are trimmed + deduped", () => {
    const r = normaliseQuestions([{ label: "Stage", type: "select", options: [" Seed", "Seed", "Series A", ""] }, { label: "Odd", type: "colour" }]);
    expect(r).toEqual({ ok: true, questions: [{ key: "stage", label: "Stage", type: "select", required: false, options: ["Seed", "Series A"] }, { key: "odd", label: "Odd", type: "text", required: false }] });
  });
});

describe("normaliseTemplateInput", () => {
  it("requires a name, normalises weights to 100 and trims consent text", () => {
    expect(normaliseTemplateInput({})).toMatchObject({ ok: false, message: "Template name is required" });
    const r = normaliseTemplateInput({ name: " Fellowship intake ", rubric_weights: { ftv: 2, mpc: 2 }, consent_text: "  We read your evidence.  " });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.name).toBe("Fellowship intake");
    expect(r.value.rubricWeights).toMatchObject({ ftv: 50, mpc: 50, ptd: 0 });
    expect(r.value.consentText).toBe("We read your evidence.");
    expect(r.value.questions).toEqual([]);
  });
  it("defaults the weights to equal when absent", () => {
    const r = normaliseTemplateInput({ name: "x" });
    expect(r.ok && r.value.rubricWeights.ftv).toBe(12.5);
  });
});

describe("validateAnswers", () => {
  const questions = normaliseQuestions([
    { key: "team", label: "Team size", type: "number", required: true },
    { key: "repo", label: "Repo", type: "url" },
    { key: "stage", label: "Stage", type: "select", options: ["Seed", "Series A"] },
    { key: "why", label: "Why now", type: "text" },
  ]);
  const qs = questions.ok ? questions.questions : [];

  it("accepts a valid set, coerces numbers and urls, drops unknown keys", () => {
    const r = validateAnswers(qs, { team: "12", repo: "github.com/x/y", stage: "Seed", why: " because ", extra: "dropped" });
    expect(r).toEqual({ ok: true, answers: { team: 12, repo: "https://github.com/x/y", stage: "Seed", why: "because" } });
  });
  it("reports the failing field: required, number, url, select", () => {
    expect(validateAnswers(qs, {})).toMatchObject({ ok: false, field: "team" });
    expect(validateAnswers(qs, { team: "twelve" })).toMatchObject({ ok: false, field: "team" });
    expect(validateAnswers(qs, { team: 1, repo: "not a url" })).toMatchObject({ ok: false, field: "repo" });
    expect(validateAnswers(qs, { team: 1, stage: "Series Z" })).toMatchObject({ ok: false, field: "stage" });
  });
});

describe("templates CRUD (memory store)", () => {
  it("create → list → get → update → delete, owner-scoped", async () => {
    const store = memoryTemplateStore();
    const created = await createTemplate("owner-1", { name: "Round 1", questions: [{ label: "Team size", type: "number" }] }, { store });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.template.questions[0]).toMatchObject({ key: "team_size" });
    expect((await listTemplates("owner-1", { store })).map((t) => t.id)).toEqual([created.template.id]);
    expect(await listTemplates("owner-2", { store })).toEqual([]);
    expect(await getTemplate("owner-2", created.template.id, { store })).toBeNull();
    expect((await getTemplateById(created.template.id, { store }))?.name).toBe("Round 1");

    const upd = await updateTemplate("owner-1", created.template.id, { name: "Round 1b", consent_text: "ok" }, { store });
    expect(upd.ok && upd.template.name).toBe("Round 1b");
    expect(await updateTemplate("owner-2", created.template.id, { name: "steal" }, { store })).toMatchObject({ ok: false, error: "not_found" });
    expect(await updateTemplate("owner-1", created.template.id, { name: "" }, { store })).toMatchObject({ ok: false, error: "invalid_input" });

    expect(await deleteTemplate("owner-2", created.template.id, { store })).toMatchObject({ ok: false, error: "not_found" });
    expect(await deleteTemplate("owner-1", created.template.id, { store })).toEqual({ ok: true });
    expect(await listTemplates("owner-1", { store })).toEqual([]);
  });
  it("not migrated → create fails with not_migrated, list is empty, lookups null", async () => {
    const store = memoryTemplateStore({ migrated: false });
    expect(await createTemplate("o", { name: "x" }, { store })).toMatchObject({ ok: false, error: "not_migrated" });
    expect(await listTemplates("o", { store })).toEqual([]);
    expect(await getTemplateById("tpl-1", { store })).toBeNull();
  });
  it("no store → service_unavailable", async () => {
    expect(await createTemplate("o", { name: "x" }, { store: null })).toMatchObject({ ok: false, error: "service_unavailable" });
  });
});

describe("mapTemplateRow", () => {
  it("tolerates malformed jsonb (questions → [], weights → equal)", () => {
    const t = mapTemplateRow({ id: "t", owner_user_id: "o", name: "n", questions: "garbage", rubric_weights: null, created_at: "2026-09-20T00:00:00Z" });
    expect(t.questions).toEqual([]);
    expect(t.rubricWeights.ftv).toBe(12.5);
    expect(t.updatedAt).toBe("2026-09-20T00:00:00Z");
  });
});
