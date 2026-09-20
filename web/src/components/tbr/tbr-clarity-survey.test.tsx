// G19-S45 (D6) — report-clarity survey: renders once per snapshot, posts to
// /api/nps with the `tbr_clarity:<snapshotId>` context, emits the client
// event, then hides. renderToStaticMarkup (no @testing-library here) for the
// pure form; the side effects go through `submitClarity` with injected
// fetch / storage / tracker.

import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { getTbrStrings } from "@/lib/i18n/tbr-strings";
import {
  TBR_CLARITY_COMMENT_MAX,
  TBR_CLARITY_TESTID,
  TbrClaritySurveyForm,
  clarityContext,
  clarityStorageKey,
  hasAnswered,
  markAnswered,
  submitClarity,
  type ClarityStorage,
} from "./tbr-clarity-survey";

function memStorage(): ClarityStorage & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v) };
}

describe("<TbrClaritySurveyForm>", () => {
  it("EN: asks the one D6 question with 0–10 chips and an optional 120-char comment", () => {
    const html = renderToStaticMarkup(<TbrClaritySurveyForm snapshotId="snap-1" strings={getTbrStrings("en").v2.survey} score={null} comment="" phase="idle" />);
    expect(html).toContain(`data-testid="${TBR_CLARITY_TESTID}"`);
    expect(html).toContain('data-tbr-clarity="snap-1"');
    expect(html).toContain("Was this report clear and useful?");
    expect((html.match(/data-tbr-clarity-score="/g) ?? []).length).toBe(11);
    expect(html).toContain(`maxLength="${TBR_CLARITY_COMMENT_MAX}"`);
    // Nothing chosen yet → submit disabled; dismiss always available.
    expect(html).toMatch(/data-testid="tbr-clarity-submit"[^>]*disabled/);
    expect(html).toContain('data-testid="tbr-clarity-dismiss"');
    expect(html).toContain("print:hidden");
  });

  it("VI: the question is real Vietnamese with diacritics and no English chrome", () => {
    const html = renderToStaticMarkup(<TbrClaritySurveyForm snapshotId="snap-1" strings={getTbrStrings("vi").v2.survey} score={7} comment="" phase="idle" />);
    expect(html).toContain("Báo cáo này có rõ ràng và hữu ích không?");
    expect(html).not.toContain("Was this report clear");
    expect(html).not.toContain(">Send<");
    expect(html).toContain('aria-checked="true"');
  });

  it("done phase shows only the thank-you line", () => {
    const html = renderToStaticMarkup(<TbrClaritySurveyForm snapshotId="snap-1" strings={getTbrStrings("en").v2.survey} score={9} comment="" phase="done" />);
    expect(html).toContain('data-testid="tbr-clarity-thanks"');
    expect(html).not.toContain("data-tbr-clarity-score=");
  });
});

describe("submitClarity / once per snapshot", () => {
  it("posts { score, comment, context: tbr_clarity:<id>, surface } to /api/nps, emits tbr_clarity_answered, and marks the snapshot answered", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fetchImpl = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init: init ?? {} });
      return { ok: true } as Response;
    }) as unknown as typeof fetch;
    const track = vi.fn();
    const storage = memStorage();

    expect(hasAnswered("snap-1", storage)).toBe(false);
    const r = await submitClarity({ snapshotId: "snap-1", surface: "founder", score: 9, comment: "  clear, loved the ledger  ", fetchImpl, storage, track });
    expect(r.posted).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("/api/nps");
    expect(calls[0]!.init.method).toBe("POST");
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ score: 9, comment: "clear, loved the ledger", context: clarityContext("snap-1"), surface: "founder" });
    expect(clarityContext("snap-1")).toBe("tbr_clarity:snap-1");
    expect(track).toHaveBeenCalledWith("tbr_clarity_answered", { score: 9, surface: "founder", has_comment: true, snapshot_id: "snap-1" });
    // Hidden from now on for this snapshot (once per snapshot), other snapshots unaffected.
    expect(hasAnswered("snap-1", storage)).toBe(true);
    expect(storage.map.get(clarityStorageKey("snap-1"))).toBe("9");
    expect(hasAnswered("snap-2", storage)).toBe(false);
  });

  it("clamps the score to 0–10 and the comment to 120 chars; a failed POST never throws and still hides the survey", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const track = vi.fn();
    const storage = memStorage();
    const r = await submitClarity({ snapshotId: "snap-3", surface: "share", score: 14, comment: "x".repeat(300), fetchImpl, storage, track });
    expect(r.posted).toBe(false);
    expect(track).toHaveBeenCalledWith("tbr_clarity_answered", expect.objectContaining({ score: 10, surface: "share", has_comment: true }));
    expect(hasAnswered("snap-3", storage)).toBe(true);
  });

  it("a dismissal is remembered the same way (no second ask)", () => {
    const storage = memStorage();
    markAnswered("snap-4", "dismissed", storage);
    expect(hasAnswered("snap-4", storage)).toBe(true);
    // No storage at all (SSR / blocked) → never claims answered.
    expect(hasAnswered("snap-4", null)).toBe(false);
  });
});
