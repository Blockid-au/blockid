import { createWorker, type Worker } from "tesseract.js";

let busy = false;
const TIMEOUT_MS = 30_000;
type OcrResult = { ok: true; text: string } | { ok: false; reason: "ocr_busy" | "ocr_timeout" | "ocr_failed" | "needs_input" };

/** One bounded worker per process. No AI-provider fallback or claim verification. */
export async function transcribeVisualImage(image: Buffer): Promise<OcrResult> {
  if (busy) return { ok: false, reason: "ocr_busy" };
  busy = true;
  let worker: Worker | undefined;
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let termination: Promise<void> | undefined;
  const cleanup = () => {
    if (!worker) return Promise.resolve();
    termination ??= worker.terminate().then(() => { busy = false; }, () => {
      // Unknown worker lifetime: keep the slot closed instead of spawning more.
    });
    return termination;
  };
  const operation = (async (): Promise<OcrResult> => {
    // Public language data may be downloaded, but never written into a release.
    worker = await createWorker("eng+vie", undefined, { cacheMethod: "none" });
    if (timedOut) return { ok: false, reason: "ocr_timeout" };
    const result = await worker.recognize(image);
    const text = result.data.text.trim();
    return text.length >= 30 ? { ok: true, text } : { ok: false, reason: "needs_input" };
  })().catch((): OcrResult => ({ ok: false, reason: "ocr_failed" })).finally(async () => {
    if (worker) await cleanup();
    else busy = false;
  });
  try {
    return await Promise.race([operation, new Promise<OcrResult>(resolve => {
      timer = setTimeout(() => {
        timedOut = true;
        if (worker) void cleanup();
        resolve({ ok: false, reason: "ocr_timeout" });
      }, TIMEOUT_MS);
    })]);
  } finally { clearTimeout(timer); }
}
