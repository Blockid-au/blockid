import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ createWorker: vi.fn(), recognize: vi.fn(), terminate: vi.fn() }));
vi.mock("tesseract.js", () => ({ createWorker: mock.createWorker }));

beforeEach(() => {
  vi.resetModules(); vi.clearAllMocks();
  mock.terminate.mockResolvedValue(undefined);
  mock.recognize.mockResolvedValue({ data: { text: "  Revenue AUD 100,000 for FY2025, unaudited.  " } });
  mock.createWorker.mockResolvedValue({ recognize: mock.recognize, terminate: mock.terminate });
});
afterEach(() => vi.useRealTimers());

describe("bounded OCR worker", () => {
  it("transcribes EN/VI and terminates after success", async () => {
    const { transcribeVisualImage } = await import("./visual-ocr");
    expect(await transcribeVisualImage(Buffer.from("fixture"))).toEqual({ ok: true, text: "Revenue AUD 100,000 for FY2025, unaudited." });
    expect(mock.createWorker).toHaveBeenCalledWith("eng+vie", undefined, { cacheMethod: "none" });
    expect(mock.terminate).toHaveBeenCalledTimes(1);
  });
  it("reports missing text and worker failures without a provider fallback", async () => {
    const { transcribeVisualImage } = await import("./visual-ocr");
    mock.recognize.mockResolvedValueOnce({ data: { text: "?" } }).mockRejectedValueOnce(new Error("private source"));
    expect(await transcribeVisualImage(Buffer.from("fixture"))).toEqual({ ok: false, reason: "needs_input" });
    expect(await transcribeVisualImage(Buffer.from("fixture"))).toEqual({ ok: false, reason: "ocr_failed" });
    expect(mock.terminate).toHaveBeenCalledTimes(2);
  });
  it("rejects overlap, times out and releases only after worker termination", async () => {
    vi.useFakeTimers();
    mock.recognize.mockImplementationOnce(() => new Promise(() => {}));
    const { transcribeVisualImage } = await import("./visual-ocr");
    const pending = transcribeVisualImage(Buffer.from("fixture"));
    expect(await transcribeVisualImage(Buffer.from("second"))).toEqual({ ok: false, reason: "ocr_busy" });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ ok: false, reason: "ocr_timeout" });
    expect(mock.terminate).toHaveBeenCalledTimes(1);
    expect((await transcribeVisualImage(Buffer.from("third"))).ok).toBe(true);
  });
  it("retains capacity while initialization is unresolved, then terminates the late worker", async () => {
    vi.useFakeTimers();
    let resolveWorker!: (worker: unknown) => void;
    mock.createWorker.mockImplementationOnce(() => new Promise(resolve => { resolveWorker = resolve; }));
    const { transcribeVisualImage } = await import("./visual-ocr");
    const pending = transcribeVisualImage(Buffer.from("fixture"));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await pending).toEqual({ ok: false, reason: "ocr_timeout" });
    expect(await transcribeVisualImage(Buffer.from("second"))).toEqual({ ok: false, reason: "ocr_busy" });
    resolveWorker({ recognize: mock.recognize, terminate: mock.terminate });
    await vi.advanceTimersByTimeAsync(0);
    expect(mock.recognize).not.toHaveBeenCalled();
    expect(mock.terminate).toHaveBeenCalledTimes(1);
  });
});
