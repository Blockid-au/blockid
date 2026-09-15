// S32-C — last-report record (last-report.ts): atomic write, read from the
// app root first then the canonical path, null when absent or malformed,
// and a failed write never throws (observability must not block delivery).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fsMock = vi.hoisted(() => {
  const files = new Map<string, string>();
  return {
    files,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((p: string, c: string) => { files.set(p, c); }),
    renameSync: vi.fn((a: string, b: string) => { const v = files.get(a); if (v === undefined) throw new Error("ENOENT"); files.set(b, v); files.delete(a); }),
    promises: {
      readFile: vi.fn(async (p: string) => {
        const v = files.get(p);
        if (v === undefined) throw Object.assign(new Error(`ENOENT ${p}`), { code: "ENOENT" });
        return v;
      }),
    },
  };
});
vi.mock("fs", () => ({ default: fsMock, ...fsMock }));

import { LAST_REPORT_FILE, LAST_REPORT_REL, readLastReportProvider, writeLastReportProvider, type LastReportProvider } from "./last-report";

const rec: LastReportProvider = {
  at: "2026-09-15T08:00:00.000Z",
  analysis_id: "a1",
  provider: "deepinfra",
  model: "deepseek-ai/DeepSeek-V4-Flash",
  models: ["DeepSeek-V4-Flash via DeepInfra"],
  sections: { ceo: { provider: "deepinfra", model: "deepseek-ai/DeepSeek-V4-Flash", task_class: "synthesis" } },
  sections_written: 7,
  sections_failed: 0,
};

beforeEach(() => { fsMock.files.clear(); });
afterEach(() => { vi.clearAllMocks(); });

describe("writeLastReportProvider", () => {
  it("writes a temp file then renames into place (atomic), never key material", () => {
    writeLastReportProvider(rec, "/x/content/reports/ai-last-report.json");
    expect(fsMock.files.get("/x/content/reports/ai-last-report.json")).toContain('"deepinfra"');
    expect([...fsMock.files.keys()].some((k) => k.includes(".tmp."))).toBe(false);
  });

  it("swallows write failures", () => {
    fsMock.writeFileSync.mockImplementationOnce(() => { throw new Error("EROFS"); });
    expect(() => writeLastReportProvider(rec)).not.toThrow();
  });
});

describe("readLastReportProvider", () => {
  it("prefers the app root's copy, falls back to the canonical path, null when neither exists", async () => {
    expect(await readLastReportProvider("/nowhere")).toBeNull();
    fsMock.files.set(LAST_REPORT_FILE, JSON.stringify({ ...rec, provider: "gemini" }));
    expect((await readLastReportProvider("/nowhere"))?.provider).toBe("gemini");
    fsMock.files.set(`/app/${LAST_REPORT_REL}`, JSON.stringify(rec));
    expect((await readLastReportProvider("/app"))?.provider).toBe("deepinfra");
  });

  it("returns null for a malformed record", async () => {
    fsMock.files.set(`/app/${LAST_REPORT_REL}`, "{not json");
    expect(await readLastReportProvider("/app")).toBeNull();
    fsMock.files.set(`/app/${LAST_REPORT_REL}`, JSON.stringify({ at: "x" }));
    expect(await readLastReportProvider("/app")).toBeNull();
  });
});
