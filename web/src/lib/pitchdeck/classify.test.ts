// Colocated vitest for the shared deck classifier (G14 S35 extraction of
// /api/pitchdeck/classify). Pins the parse tolerance the route relied on,
// the prompt cap, the coverage summary the inbox renders, and the
// dependency-injected `classifyDeck` contract (short text → error, AI
// failure → error, persist failure → warning not throw, no userId → no
// persist).

import { describe, expect, it, vi } from "vitest";
import {
  DIM_KEYS,
  MAX_TEXT_BYTES,
  MIN_TEXT_CHARS,
  classifyDeck,
  classifyPrompt,
  coverageSummary,
  safeParseCoverage,
} from "./classify";

const FULL = JSON.stringify(
  Object.fromEntries(DIM_KEYS.map((k, i) => [k, { level: i % 3 === 0 ? "strong" : i % 3 === 1 ? "partial" : "missing", excerpt: `e${i}` }])),
);
const LONG_TEXT = "Founders: Jane (ex-Atlassian) and Tom. Market: A$2B TAM in AU fintech. Revenue A$40k MRR.";

describe("safeParseCoverage", () => {
  it("parses strict JSON and fills every dimension", () => {
    const c = safeParseCoverage(FULL)!;
    expect(Object.keys(c).sort()).toEqual([...DIM_KEYS].sort());
    expect(c.ftv).toEqual({ level: "strong", excerpt: "e0" });
    expect(c.mpc.level).toBe("partial");
  });

  it("strips a markdown fence, defaults unknown levels + missing keys, clips excerpts to 120", () => {
    const raw = "```json\n" + JSON.stringify({ ftv: { level: "STRONG", excerpt: "x".repeat(200) }, mpc: { level: "wat" } }) + "\n```";
    const c = safeParseCoverage(raw)!;
    expect(c.ftv.level).toBe("strong");
    expect(c.ftv.excerpt).toHaveLength(120);
    expect(c.mpc).toEqual({ level: "missing", excerpt: "" });
    expect(c.svm).toEqual({ level: "missing", excerpt: "" });
  });

  it("returns null for prose / null; an array degrades to all-missing (route-era behaviour)", () => {
    expect(safeParseCoverage("Sure! Here is the JSON:")).toBeNull();
    expect(safeParseCoverage("null")).toBeNull();
    expect(coverageSummary(safeParseCoverage("[1,2]"))).toEqual({ strong: 0, partial: 0, missing: 8 });
  });
});

describe("classifyPrompt + coverageSummary", () => {
  it("caps the deck excerpt at MAX_TEXT_BYTES and names all 8 keys", () => {
    const p = classifyPrompt("z".repeat(MAX_TEXT_BYTES + 5_000));
    expect(p.length).toBeLessThan(MAX_TEXT_BYTES + 3_000);
    for (const k of DIM_KEYS) expect(p).toContain(`"${k}"`);
  });

  it("summary counts strong / partial / missing (unknown → missing)", () => {
    expect(coverageSummary(safeParseCoverage(FULL))).toEqual({ strong: 3, partial: 3, missing: 2 });
    expect(coverageSummary(null)).toEqual({ strong: 0, partial: 0, missing: 8 });
    expect(coverageSummary({ ftv: { level: "strong" } })).toEqual({ strong: 1, partial: 0, missing: 7 });
  });
});

describe("classifyDeck", () => {
  it("rejects text under MIN_TEXT_CHARS before calling the model", async () => {
    const callAI = vi.fn();
    const r = await classifyDeck({ text: "short", userId: "u1" }, { callAI });
    expect(r).toEqual({ ok: false, error: "extracted_text_too_short" });
    expect(callAI).not.toHaveBeenCalled();
    expect("short".length).toBeLessThan(MIN_TEXT_CHARS);
  });

  it("classifies, persists for a user and returns the row id", async () => {
    const callAI = vi.fn(async () => ({ text: FULL }));
    const persist = vi.fn(async (row: Record<string, unknown>) => {
      expect(row.user_id).toBe("u1");
      expect(row.status).toBe("classified");
      expect(row.dim_coverage).toBeTruthy();
      return "pd-1";
    });
    const r = await classifyDeck({ text: LONG_TEXT, userId: "u1", projectId: "p1", filename: "deck.pdf" }, { callAI, persist });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pitchdeckId).toBe("pd-1");
    expect(r.coverage.ftv.level).toBe("strong");
    expect(r.textBytes).toBe(Buffer.byteLength(LONG_TEXT));
    expect(r.warnings).toEqual([]);
    expect(callAI).toHaveBeenCalledTimes(1);
  });

  it("does not persist without a userId; persist failure is a warning, not a throw", async () => {
    const callAI = vi.fn(async () => ({ text: FULL }));
    const persist = vi.fn(async () => {
      throw new Error("relation pitchdeck_analyses does not exist");
    });
    const anon = await classifyDeck({ text: LONG_TEXT }, { callAI, persist });
    expect(anon.ok && anon.pitchdeckId).toBeNull();
    expect(persist).not.toHaveBeenCalled();

    const failed = await classifyDeck({ text: LONG_TEXT, userId: "u1" }, { callAI, persist });
    expect(failed.ok).toBe(true);
    if (!failed.ok) return;
    expect(failed.pitchdeckId).toBeNull();
    expect(failed.warnings[0]).toMatch(/^persist_failed/);
  });

  it("maps AI transport failure and unparseable replies to typed errors", async () => {
    const boom = await classifyDeck({ text: LONG_TEXT }, { callAI: async () => { throw new Error("timeout"); } });
    expect(boom).toMatchObject({ ok: false, error: "classification_ai_failed", detail: "timeout" });
    const prose = await classifyDeck({ text: LONG_TEXT }, { callAI: async () => ({ text: "I cannot do that" }) });
    expect(prose).toEqual({ ok: false, error: "classification_parse_failed" });
  });

  it("refuses a filepath outside the upload roots without touching the extractor", async () => {
    const extractFileText = vi.fn();
    const r = await classifyDeck({ filepath: "/etc/passwd", filename: "x.pdf" }, { extractFileText, callAI: vi.fn() });
    expect(r).toEqual({ ok: false, error: "storage_not_found_or_disallowed" });
    expect(extractFileText).not.toHaveBeenCalled();
  });
});
