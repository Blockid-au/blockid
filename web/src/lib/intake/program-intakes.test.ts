// Colocated vitest for lib/intake/program-intakes.ts (G14 S35).
//
// Pins: slug shape (kebab + 8 random base32 chars, always SLUG_RE), the
// acceptance rules (closed / not-open-yet / window-closed / full), input
// normalisation (auto_report defaults OFF — F-4), CRUD against the
// in-memory store, the inbox fold (latest snapshot wins, received → scored),
// and 42P01 tolerance (not migrated → empty list / not_found, never a throw).

import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_SUBMISSIONS,
  SLUG_RE,
  createIntake,
  intakeAcceptance,
  isIntakeSlug,
  kebab,
  listInboxRows,
  listMyIntakes,
  lookupPublicIntake,
  makeSlug,
  memoryIntakeStore,
  normaliseIntakeInput,
  publicUrlForSlug,
  randomSuffix,
  setIntakeStatus,
  setSubmissionStatus,
} from "./program-intakes";

const NOW = new Date("2026-09-16T10:00:00Z");

describe("slug", () => {
  it("kebab strips accents / punctuation and caps at 40 chars", () => {
    expect(kebab("Sydney Fintech Accelerator — Cohort 4!")).toBe("sydney-fintech-accelerator-cohort-4");
    expect(kebab("Chương trình Ươm tạo")).toBe("chuong-trinh-uom-tao");
    expect(kebab("x".repeat(80))).toHaveLength(40);
    expect(kebab("!!!")).toBe("program");
  });

  it("makeSlug = kebab + '-' + 8 base32 chars and always matches SLUG_RE", () => {
    const s = makeSlug("Demo Program");
    expect(s).toMatch(/^demo-program-[a-z2-7]{8}$/);
    expect(SLUG_RE.test(s)).toBe(true);
    expect(randomSuffix()).toHaveLength(8);
    expect(randomSuffix(8, () => Buffer.from([0, 1, 2, 3, 31, 32, 33, 255]))).toBe("abcd7ab7");
    expect(new Set(Array.from({ length: 50 }, () => makeSlug("x"))).size).toBe(50);
  });

  it("isIntakeSlug rejects traversal / uppercase / short", () => {
    expect(isIntakeSlug("demo-program-abcdefgh")).toBe(true);
    expect(isIntakeSlug("../etc")).toBe(false);
    expect(isIntakeSlug("Demo")).toBe(false);
    expect(isIntakeSlug("ab")).toBe(false);
    expect(isIntakeSlug(42)).toBe(false);
    expect(publicUrlForSlug("demo-abcdefgh", "https://blockid.au")).toBe("https://blockid.au/apply/demo-abcdefgh");
  });
});

describe("intakeAcceptance", () => {
  const base = { status: "open" as const, opensAt: null, closesAt: null, maxSubmissions: 3 };
  it("open with room → ok + remaining", () => {
    expect(intakeAcceptance(base, 1, NOW)).toEqual({ ok: true, remaining: 2 });
  });
  it("closed status / window / full", () => {
    expect(intakeAcceptance({ ...base, status: "closed" }, 0, NOW)).toEqual({ ok: false, reason: "closed" });
    expect(intakeAcceptance({ ...base, opensAt: "2026-09-17T00:00:00Z" }, 0, NOW)).toEqual({ ok: false, reason: "not_open_yet" });
    expect(intakeAcceptance({ ...base, closesAt: "2026-09-16T10:00:00Z" }, 0, NOW)).toEqual({ ok: false, reason: "window_closed" });
    expect(intakeAcceptance({ ...base, closesAt: "2026-09-16T10:00:01Z" }, 0, NOW).ok).toBe(true);
    expect(intakeAcceptance(base, 3, NOW)).toEqual({ ok: false, reason: "full" });
  });
});

describe("normaliseIntakeInput", () => {
  it("defaults: max 200, auto_report OFF unless boolean true (F-4)", () => {
    const r = normaliseIntakeInput({ name: "  Cohort 5 " });
    expect(r).toEqual({ ok: true, value: { name: "Cohort 5", blurb: null, opensAt: null, closesAt: null, maxSubmissions: DEFAULT_MAX_SUBMISSIONS, autoReport: false, templateId: null } });
    // G21 P2-A: template_id must be a uuid when given; absent / "" → null.
    expect(normaliseIntakeInput({ name: "x", template_id: "nope" })).toMatchObject({ ok: false });
    expect((normaliseIntakeInput({ name: "x", template_id: "11111111-2222-4333-8444-555555555555" }) as { value: { templateId: string | null } }).value.templateId).toBe("11111111-2222-4333-8444-555555555555");
    expect(normaliseIntakeInput({ name: "x", auto_report: "true" }).ok && (normaliseIntakeInput({ name: "x", auto_report: "true" }) as { value: { autoReport: boolean } }).value.autoReport).toBe(false);
    expect((normaliseIntakeInput({ name: "x", auto_report: true }) as { value: { autoReport: boolean } }).value.autoReport).toBe(true);
  });
  it("rejects missing name, bad dates, inverted window, silly max", () => {
    expect(normaliseIntakeInput({})).toMatchObject({ ok: false });
    expect(normaliseIntakeInput({ name: "x", opens_at: "yesterday" })).toMatchObject({ ok: false, message: expect.stringContaining("opens_at") });
    expect(normaliseIntakeInput({ name: "x", opens_at: "2026-10-01", closes_at: "2026-09-01" })).toMatchObject({ ok: false, message: expect.stringContaining("after") });
    expect(normaliseIntakeInput({ name: "x", max_submissions: 0 })).toMatchObject({ ok: false });
    expect(normaliseIntakeInput({ name: "x", max_submissions: "25" })).toMatchObject({ ok: true, value: { maxSubmissions: 25 } });
  });
});

describe("CRUD against the memory store", () => {
  it("create → list with counts + public URL; close / reopen", async () => {
    const store = memoryIntakeStore();
    const created = await createIntake("owner-1", { name: "Demo Program" }, { store, suffix: () => "abcdefgh" });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.intake.slug).toBe("demo-program-abcdefgh");
    expect(created.intake.publicUrl).toMatch(/\/apply\/demo-program-abcdefgh$/);
    expect(created.intake.autoReport).toBe(false);

    // slug collision retries with a fresh suffix
    let n = 0;
    const second = await createIntake("owner-1", { name: "Demo Program" }, { store, suffix: () => (n++ === 0 ? "abcdefgh" : "zzzzzzzz") });
    expect(second.ok && second.intake.slug).toBe("demo-program-zzzzzzzz");

    await store.insertSubmission({ intakeId: created.intake.id, founderEmail: "a@x.io", founderName: null, startupName: "A", website: null, deckStoragePath: null, ipHash: null });
    const mine = await listMyIntakes("owner-1", { store });
    expect(mine.map((i) => [i.slug, i.submissionCount])).toEqual([
      ["demo-program-zzzzzzzz", 0],
      ["demo-program-abcdefgh", 1],
    ]);
    expect(await listMyIntakes("someone-else", { store })).toEqual([]);

    const closed = await setIntakeStatus("owner-1", created.intake.id, "closed", { store });
    expect(closed.ok && closed.intake.status).toBe("closed");
    expect((await lookupPublicIntake(created.intake.slug, { store })).ok && (await lookupPublicIntake(created.intake.slug, { store }) as { acceptance: { ok: boolean } }).acceptance.ok).toBe(false);
    expect(await setIntakeStatus("intruder", created.intake.id, "open", { store })).toEqual({ ok: false, error: "not_found" });
    const reopened = await setIntakeStatus("owner-1", created.intake.id, "open", { store });
    expect(reopened.ok).toBe(true);
  });

  it("lookupPublicIntake: unknown / malformed slug → not_found; full → acceptance.full", async () => {
    const store = memoryIntakeStore();
    expect(await lookupPublicIntake("nope-nope-nope", { store })).toEqual({ ok: false, error: "not_found" });
    expect(await lookupPublicIntake("../../x", { store })).toEqual({ ok: false, error: "not_found" });
    const c = await createIntake("o", { name: "Tiny", max_submissions: 1 }, { store, suffix: () => "aaaaaaaa" });
    if (!c.ok) throw new Error("create");
    await store.insertSubmission({ intakeId: c.intake.id, founderEmail: "a@x.io", founderName: null, startupName: "A", website: null, deckStoragePath: null, ipHash: null });
    const r = await lookupPublicIntake("tiny-aaaaaaaa", { store });
    expect(r.ok && r.acceptance).toEqual({ ok: false, reason: "full" });
  });

  it("inbox: latest snapshot wins over the column, received+snapshot reads scored, dossier link from evaluation", async () => {
    const store = memoryIntakeStore({ snapshots: { "proj-1": 71.4 } });
    const c = await createIntake("o", { name: "P" }, { store, suffix: () => "aaaaaaaa" });
    if (!c.ok) throw new Error("create");
    const s1 = await store.insertSubmission({ intakeId: c.intake.id, founderEmail: "a@x.io", founderName: "Ann", startupName: "Alpha", website: null, deckStoragePath: null, ipHash: null });
    await store.updateSubmission(s1.id, { evaluationId: "ev-1", projectId: "proj-1", sviTotal: 60 });
    const s2 = await store.insertSubmission({ intakeId: c.intake.id, founderEmail: "b@x.io", founderName: null, startupName: "Beta", website: null, deckStoragePath: null, ipHash: null });
    const rows = await listInboxRows("o", { store });
    expect(rows.map((r) => r.startupName)).toEqual(["Beta", "Alpha"]);
    const alpha = rows[1]!;
    expect(alpha.latestSvi).toBe(71.4);
    expect(alpha.status).toBe("scored");
    expect(alpha.dossierUrl).toBe("/workspace/evaluations/ev-1");
    expect(alpha.intakeSlug).toBe("p-aaaaaaaa");
    expect(rows[0]!.status).toBe("received");
    expect(rows[0]!.dossierUrl).toBeNull();
    expect(await setSubmissionStatus("o", s2.id, "rejected", { store })).toEqual({ ok: true });
    expect((await listInboxRows("o", { store, intakeId: c.intake.id }))[0]!.status).toBe("rejected");
    expect(await setSubmissionStatus("intruder", s2.id, "reviewed", { store })).toEqual({ ok: false, error: "not_found" });
    expect(await listInboxRows("intruder", { store })).toEqual([]);
  });

  it("not migrated (42P01) → empty lists / not_found; create reports not_migrated; null store → service_unavailable", async () => {
    const store = memoryIntakeStore({ migrated: false });
    expect(await listMyIntakes("o", { store })).toEqual([]);
    expect(await listInboxRows("o", { store })).toEqual([]);
    expect(await lookupPublicIntake("demo-program-abcdefgh", { store })).toEqual({ ok: false, error: "not_migrated" });
    expect(await createIntake("o", { name: "x" }, { store })).toMatchObject({ ok: false, error: "not_migrated" });
    expect(await createIntake("o", { name: "x" }, { store: null })).toMatchObject({ ok: false, error: "service_unavailable" });
    expect(await createIntake("o", {}, { store: null })).toMatchObject({ ok: false, error: "invalid_input" });
  });
});
