// Route wiring for POST /api/intake/[slug]/submit (G14 S35). The runner is
// mocked; this pins: malformed slug → 404 before the limiter; 429
// passthrough; honeypot → 204 and the runner is never called; oversized
// Content-Length → 413 before formData(); runner errors map to their HTTP
// status (closed → 404 + reason, duplicate → 409, deck_too_large → 413);
// the multipart fields reach the runner with the deck buffer + hashed-later
// IP; success → 200 { ok, submission_id, status }.

import { beforeEach, describe, expect, it, vi } from "vitest";

const enforceRateLimitMock = vi.fn();
vi.mock("@/lib/rate-limit", () => ({
  enforceRateLimit: (...args: unknown[]) => enforceRateLimitMock(...args),
}));

const runMock = vi.fn();
vi.mock("@/lib/intake/submission-runner", async () => {
  const actual = await vi.importActual<typeof import("@/lib/intake/submission-runner")>("@/lib/intake/submission-runner");
  return { ...actual, runIntakeSubmission: (...args: unknown[]) => runMock(...args) };
});

vi.mock("@/lib/audit/api-route", () => ({
  apiRoute: (_meta: unknown, handler: unknown) => handler,
}));

import { NextResponse } from "next/server";
import { POST, RATE_MAX, RATE_WINDOW_MS } from "./route";

const SLUG = "demo-program-abcdefgh";
const ctx = (slug = SLUG) => ({ params: Promise.resolve({ slug }) });

function multipart(fields: Record<string, string>, deck?: { name: string; type: string; bytes: string } | null, extraHeaders: Record<string, string> = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  if (deck) fd.set("deck", new File([deck.bytes], deck.name, { type: deck.type }));
  return new Request(`http://localhost/api/intake/${SLUG}/submit`, { method: "POST", body: fd, headers: { "x-forwarded-for": "203.0.113.9", ...extraHeaders } });
}

const GOOD = { startup_name: "Alpha", founder_name: "Ann", founder_email: "ann@alpha.io", website: "alpha.io", consent: "on" };
const DECK = { name: "deck.pdf", type: "application/pdf", bytes: "%PDF-1.4 hello" };

beforeEach(() => {
  enforceRateLimitMock.mockReset().mockReturnValue(null);
  runMock.mockReset().mockResolvedValue({ ok: true, submissionId: "sub-1", intakeId: "i-1", evaluationId: "ev-1", projectId: "p-1", status: "received", sviTotal: null, warnings: [] });
});

describe("POST /api/intake/[slug]/submit", () => {
  it("malformed slug → 404 before the limiter or the body", async () => {
    const res = await POST(multipart(GOOD, DECK), ctx("../etc"));
    expect(res.status).toBe(404);
    expect(enforceRateLimitMock).not.toHaveBeenCalled();
    expect(runMock).not.toHaveBeenCalled();
  });

  it("rate limit: 5/h keyed on the IP (null identity) and passes the 429 through", async () => {
    enforceRateLimitMock.mockReturnValue(NextResponse.json({ ok: false }, { status: 429 }));
    const res = await POST(multipart(GOOD, DECK), ctx());
    expect(res.status).toBe(429);
    expect(enforceRateLimitMock).toHaveBeenCalledWith("intake-submit", null, expect.anything(), RATE_MAX, RATE_WINDOW_MS);
    expect(RATE_MAX).toBe(5);
    expect(RATE_WINDOW_MS).toBe(3_600_000);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("honeypot filled → 204, nothing stored", async () => {
    const res = await POST(multipart({ ...GOOD, company_website_confirm: "http://bot.example" }, DECK), ctx());
    expect(res.status).toBe(204);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("Content-Length over the cap → 413 before the body is read; a big deck file → 413", async () => {
    const res = await POST(multipart(GOOD, DECK, { "content-length": String(30 * 1024 * 1024) }), ctx());
    expect(res.status).toBe(413);
    expect(runMock).not.toHaveBeenCalled();
    runMock.mockResolvedValue({ ok: false, error: "deck_too_large", message: "too big" });
    const res2 = await POST(multipart(GOOD, DECK), ctx());
    expect(res2.status).toBe(413);
  });

  it("non-multipart body → 400", async () => {
    const res = await POST(new Request(`http://localhost/api/intake/${SLUG}/submit`, { method: "POST", body: "{}", headers: { "content-type": "application/json" } }), ctx());
    expect(res.status).toBe(400);
    expect(runMock).not.toHaveBeenCalled();
  });

  it("maps runner errors: closed → 404 with reason, duplicate → 409, infected → 422, scanner → 503", async () => {
    runMock.mockResolvedValue({ ok: false, error: "closed", message: "closed", reason: "full" });
    let res = await POST(multipart(GOOD, DECK), ctx());
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ ok: false, error: "closed", message: "closed", reason: "full" });
    runMock.mockResolvedValue({ ok: false, error: "duplicate", message: "dup" });
    res = await POST(multipart(GOOD, DECK), ctx());
    expect(res.status).toBe(409);
    runMock.mockResolvedValue({ ok: false, error: "deck_infected", message: "x" });
    expect((await POST(multipart(GOOD, DECK), ctx())).status).toBe(422);
    runMock.mockResolvedValue({ ok: false, error: "scanner_unavailable", message: "x" });
    expect((await POST(multipart(GOOD, DECK), ctx())).status).toBe(503);
    runMock.mockResolvedValue({ ok: false, error: "not_migrated", message: "x" });
    expect((await POST(multipart(GOOD, DECK), ctx())).status).toBe(404);
  });

  it("happy path: fields + deck buffer + IP reach the runner; 200 { ok, submission_id, status }", async () => {
    const res = await POST(multipart(GOOD, DECK), ctx());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, submission_id: "sub-1", status: "received" });
    const input = runMock.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ slug: SLUG, startupName: "Alpha", founderName: "Ann", founderEmail: "ann@alpha.io", website: "alpha.io", consent: "on", ip: "203.0.113.9" });
    const deck = input.deck as { buffer: Buffer; filename: string; mimeType: string; size: number };
    expect(deck.filename).toBe("deck.pdf");
    expect(deck.mimeType).toBe("application/pdf");
    expect(deck.buffer.toString()).toBe("%PDF-1.4 hello");
    expect(deck.size).toBe(14);
  });

  it("no deck file → runner sees deck: null (it answers deck_required → 400)", async () => {
    runMock.mockResolvedValue({ ok: false, error: "deck_required", message: "Attach your pitch deck" });
    const res = await POST(multipart(GOOD, null), ctx());
    expect(res.status).toBe(400);
    expect((runMock.mock.calls[0]![0] as { deck: unknown }).deck).toBeNull();
  });
});
