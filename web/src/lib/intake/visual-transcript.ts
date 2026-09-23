import { prepareVisualImage } from "./visual-image";
import { transcribeVisualImage } from "./visual-ocr";
import { currentReportSpendScope } from "@/lib/ai/report-attempt-budget";
import { VISUAL_SYSTEM, VISUAL_MODEL, VISUAL_PROMPT_VERSION, readVisualInterpretation, visualObservationsContext } from "./visual-interpretation";

export const VISUAL_TRANSCRIPT_WARNING = "Image extraction is unverified. Confirm numbers, currencies, periods and actual versus forecast against the original before using them for valuation. Visual observations do not establish independent verification.";
export type VisualTranscriptSource = {
  originalSha256: string; derivativeSha256: string; width: number; height: number;
  transformVersion: string; status: "transcribed_unverified" | "interpreted_unverified";
  visualAnalysis: "not_performed" | "partial" | "readable" | "unreadable";
  model?: string; promptVersion?: string; limitations?: string[];
};

/** Transient image bytes are not retained. Vision shares the report's durable US$0.50 budget. */
export async function extractVisualTranscript(bytes: Buffer, options: { deadlineAt?: number; ocrTimeoutMs?: number } = {}): Promise<{ text: string; source: VisualTranscriptSource }> {
  const image = await prepareVisualImage(bytes);
  if (!image.ok) throw new Error(image.reason);
  const remaining = () => options.deadlineAt === undefined ? 75000 : Math.max(0, options.deadlineAt - Date.now());
  if (remaining() < 1000) throw Error("needs_input");
  const result = await transcribeVisualImage(image.bytes, Math.min(options.ocrTimeoutMs ?? 30000, remaining()));
  const limitations: string[] = result.ok ? [] : [`Local OCR: ${result.reason}`];
  let text = result.ok ? result.text : "";
  const source: VisualTranscriptSource = { originalSha256: image.originalSha256, derivativeSha256: image.derivativeSha256,
    width: image.width, height: image.height, transformVersion: image.transformVersion,
    status: "transcribed_unverified", visualAnalysis: "not_performed" };
  if (remaining() >= 1000 && currentReportSpendScope() && image.bytes.length <= 19 * 1024 * 1024) {
    try {
      const { callAI } = await import("@/lib/ai-client");
      const response = await callAI({ policy: "blockid-report-v1", system: VISUAL_SYSTEM,
        user: "Read this uploaded business image. Distinguish visible observations, approximate numbers, founder claims and missing context.",
        visionImages: [image.bytes], maxTokens: 3000, temperature: 0, timeoutMs: Math.min(45000, remaining()), budgetMs: Math.min(45000, remaining()), agentId: "intake:visual" });
      if (response.model !== VISUAL_MODEL || (response.via ?? response.provider) !== "deepinfra") throw Error("vision_model_mismatch");
      const interpreted = readVisualInterpretation(response.text);
      if (interpreted.status === "unreadable" || !interpreted.observations.length) limitations.push("Visual content could not be interpreted reliably.");
      else {
        text = [text, visualObservationsContext(interpreted)].filter(Boolean).join("\n\n");
        source.status = "interpreted_unverified";
      }
      source.visualAnalysis = interpreted.status;
      source.model = VISUAL_MODEL; source.promptVersion = VISUAL_PROMPT_VERSION;
      limitations.push(...interpreted.limitations);
    } catch {
      limitations.push("Visual interpretation unavailable or report budget exhausted; OCR text only, if readable.");
    }
  } else limitations.push("Visual interpretation not performed: no shared report budget or image exceeds vision size limit.");
  if (!text.trim()) throw Error(result.ok ? "needs_input" : result.reason);
  source.limitations = limitations;
  return { text, source };
}

export function visualTranscriptContext(text: string): string {
  return `[Image extraction — unverified]\n${VISUAL_TRANSCRIPT_WARNING}\n\n${text}`;
}
