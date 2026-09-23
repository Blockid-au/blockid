import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ user: vi.fn(), afford: vi.fn(), prepare: vi.fn(), ocr: vi.fn(), callAI: vi.fn(), spend: vi.fn() }));
vi.mock("@/lib/auth", () => ({ getCurrentUser: mock.user }));
vi.mock("@/lib/credits", () => ({ canAfford: mock.afford, spendCredits: mock.spend }));
vi.mock("@/lib/ai-client", () => ({ callAI: mock.callAI }));
vi.mock("@/lib/audit/api-route", () => ({ apiRoute: (_: unknown, handler: unknown) => handler }));
vi.mock("@/lib/intake/visual-image", () => ({ VISUAL_IMAGE_LIMITS: { bytes: 100 }, prepareVisualImage: mock.prepare }));
vi.mock("@/lib/intake/visual-ocr", () => ({ transcribeVisualImage: mock.ocr }));
import { POST } from "./route";
const request = (body: unknown) => new Request("http://localhost/api/pitchdeck/ocr", { method: "POST", body: JSON.stringify(body) });
const body = { file: { base64: Buffer.from("fixture").toString("base64"), filename: "../../must-not-write.png" } };
beforeEach(() => {
  vi.clearAllMocks(); mock.user.mockResolvedValue({ id: "user" }); mock.afford.mockResolvedValue({ allowed: true, balance: 10 });
  mock.prepare.mockResolvedValue({ ok: true, bytes: Buffer.from("sanitized"), originalSha256: "a".repeat(64), derivativeSha256: "b".repeat(64), width: 40, height: 20, transformVersion: "upright-png-v1" });
  mock.ocr.mockResolvedValue({ ok: true, text: "Revenue AUD 100,000 for FY2025, unaudited." });
});

describe("truthful image OCR endpoint", () => {
  it("preserves authentication and entitlement checks before decoding", async () => {
    mock.user.mockResolvedValueOnce(null);
    expect((await POST(request(body))).status).toBe(401);
    mock.afford.mockResolvedValueOnce({ allowed: false, balance: 0 });
    expect((await POST(request(body))).status).toBe(402);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("refuses unqualified vision without inference or charging", async () => {
    const response = await POST(request({ ...body, forceLlm: true }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ reason: "vision_not_qualified", credits_charged: 0 });
    expect(mock.callAI).not.toHaveBeenCalled(); expect(mock.spend).not.toHaveBeenCalled(); expect(mock.ocr).not.toHaveBeenCalled();
  });
  it("returns source hashes and unverified transcription, never a vision claim", async () => {
    const response = await POST(request(body));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ method: "tesseract", evidenceStatus: "transcribed_unverified", visualAnalysis: "not_performed", credits_charged: 0, source: { width: 40, height: 20 } });
    expect(mock.ocr).toHaveBeenCalledWith(Buffer.from("sanitized"));
    expect(mock.callAI).not.toHaveBeenCalled(); expect(mock.spend).not.toHaveBeenCalled();
  });
  it("rejects oversized streamed JSON and malformed base64 before decoding", async () => {
    expect((await POST(request({ padding: "x".repeat(5000) }))).status).toBe(413);
    for (const base64 of ["!!==", "Zg=", "Zh=="]) expect((await POST(request({ file: { base64 } }))).status).toBe(400);
    expect(mock.prepare).not.toHaveBeenCalled();
  });
  it("reports unsupported and unreadable images as incomplete, not success", async () => {
    mock.prepare.mockResolvedValueOnce({ ok: false, reason: "unsupported_image" });
    expect((await POST(request(body))).status).toBe(422);
    mock.ocr.mockResolvedValueOnce({ ok: false, reason: "needs_input" });
    const response = await POST(request(body));
    expect(response.status).toBe(422); expect(await response.json()).toMatchObject({ ok: false, reason: "needs_input", credits_charged: 0 });
    expect(mock.spend).not.toHaveBeenCalled();
  });
  it.each([["ocr_busy", 429], ["ocr_timeout", 504]] as const)("reports %s without billing", async (reason, status) => {
    mock.ocr.mockResolvedValueOnce({ ok: false, reason });
    expect((await POST(request(body))).status).toBe(status);
    expect(mock.spend).not.toHaveBeenCalled();
  });
});
