// Route tests for GET /api/founder/feedback-letter (G14-S34): 401 anonymous,
// 404 when the founder has no letter (and while 0406 is missing — store →
// null), founder-only lookup (by the CALLER's id, never a query param), the
// first read stamps opened_at + status and emits `feedback_letter_opened`
// exactly once, a repeat read emits nothing, and a stored row carrying a
// forbidden key is refused as 404 rather than leaked.

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ user: vi.fn(), latest: vi.fn(), markOpened: vi.fn(), emit: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: () => h.user() }));
vi.mock("@/lib/evaluations/feedback-letter-store", () => ({
  latestLetterForFounder: (id: string) => h.latest(id),
  markLetterOpened: (...a: unknown[]) => h.markOpened(...a),
}));
vi.mock("@/lib/analytics/server", () => ({ emitEventSafe: (a: unknown) => h.emit(a) }));

import { GET } from "./route";

const LETTER = {
  id: "l-1",
  projectId: "p-1",
  founderUserId: "u-f",
  evaluationIds: ["e-1"],
  k: 3,
  orgCount: 2,
  windowStart: null,
  windowEnd: "2026-09-20T00:00:00.000Z",
  aggregate: { k: 3, orgCount: 2, evaluationIds: ["e-1"], dimensions: [], risks: [], questions: [], weakestDim: "TRE", strongestDim: "FTV", generatedAt: "g" },
  letterMd: "## What investors said",
  letterMdVi: "## Nhà đầu tư nói gì",
  nextActions: [{ id: "tre-01", title: "t", rationale: "r", dimension: "TRE", sviBenefit: 10, effort: "low", timeToComplete: "1 week", href: "/workspace/finance/revenue" }],
  status: "sent",
  sentAt: "2026-09-20T22:01:00.000Z",
  openedAt: null,
  emailMessageId: "<m>",
  createdAt: "c",
};

beforeEach(() => {
  h.user.mockReset().mockResolvedValue({ id: "u-f", email: "jo@acme.io", plan: "founder_free" });
  h.latest.mockReset().mockResolvedValue(LETTER);
  h.markOpened.mockReset().mockResolvedValue(true);
  h.emit.mockReset();
});

describe("GET /api/founder/feedback-letter", () => {
  it("401 anonymous; 404 when the founder has no letter (store null — also the pre-0406 answer)", async () => {
    h.user.mockResolvedValue(null);
    expect((await GET()).status).toBe(401);
    h.user.mockResolvedValue({ id: "u-f" });
    h.latest.mockResolvedValue(null);
    const res = await GET();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "not_found" });
    expect(h.markOpened).not.toHaveBeenCalled();
  });

  it("looks the letter up by the CALLER's id and returns the allow-listed shape; first read marks opened + emits once", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    const body = await res.json();
    expect(h.latest).toHaveBeenCalledWith("u-f");
    expect(body.ok).toBe(true);
    expect(body.letter).toMatchObject({ id: "l-1", k: 3, org_count: 2, status: "opened", letter_md: "## What investors said", letter_md_vi: "## Nhà đầu tư nói gì" });
    expect(body.letter.opened_at).toBeTruthy();
    expect(body.letter.aggregate.weakestDim).toBe("TRE");
    expect(body.letter.next_actions[0].href).toBe("/workspace/finance/revenue");
    // never the founder / project ids of the row, never a message id
    expect(Object.keys(body.letter).sort()).toEqual(["aggregate", "created_at", "id", "k", "letter_md", "letter_md_vi", "next_actions", "opened_at", "org_count", "sent_at", "status", "window_end", "window_start"]);
    expect(h.markOpened).toHaveBeenCalledWith("l-1", "u-f");
    expect(h.emit).toHaveBeenCalledTimes(1);
    expect(h.emit).toHaveBeenCalledWith(expect.objectContaining({ name: "feedback_letter_opened", userId: "u-f", params: { letter_id: "l-1", k: 3, weakest_dim: "TRE", user_id: "u-f" } }));
  });

  it("a repeat read (opened_at already set) never re-marks or re-emits", async () => {
    h.latest.mockResolvedValue({ ...LETTER, status: "opened", openedAt: "2026-09-21T00:00:00.000Z" });
    const body = await (await GET()).json();
    expect(body.letter.status).toBe("opened");
    expect(body.letter.opened_at).toBe("2026-09-21T00:00:00.000Z");
    expect(h.markOpened).not.toHaveBeenCalled();
    expect(h.emit).not.toHaveBeenCalled();
    // a lost race (someone else flipped it between read and update) emits nothing either
    h.latest.mockResolvedValue(LETTER);
    h.markOpened.mockResolvedValue(false);
    const again = await (await GET()).json();
    expect(again.letter.status).toBe("sent");
    expect(h.emit).not.toHaveBeenCalled();
  });

  it("a stored row carrying a forbidden key is refused (404), never returned", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    h.latest.mockResolvedValue({ ...LETTER, aggregate: { ...LETTER.aggregate, dimensions: [{ key: "TRE", mean: 2, note: "leak" }] } });
    expect((await GET()).status).toBe(404);
    h.latest.mockResolvedValue({ ...LETTER, nextActions: [{ id: "x", assessorUserId: "u1" }] });
    expect((await GET()).status).toBe(404);
    expect(h.markOpened).not.toHaveBeenCalled();
    err.mockRestore();
  });
});
