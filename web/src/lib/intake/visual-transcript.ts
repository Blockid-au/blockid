import { prepareVisualImage } from "./visual-image";
import { transcribeVisualImage } from "./visual-ocr";

export const VISUAL_TRANSCRIPT_WARNING = "Image text was transcribed by OCR and is unverified. Charts, axes, diagrams and layout were not interpreted. Confirm numbers, currencies, periods and actual versus forecast against the original before using them for valuation.";
export type VisualTranscriptSource = {
  originalSha256: string; derivativeSha256: string; width: number; height: number;
  transformVersion: string; status: "transcribed_unverified"; visualAnalysis: "not_performed";
};

/** Transient image bytes are never persisted or sent to an AI provider here. */
export async function extractVisualTranscript(bytes: Buffer): Promise<{ text: string; source: VisualTranscriptSource }> {
  const image = await prepareVisualImage(bytes);
  if (!image.ok) throw new Error(image.reason);
  const result = await transcribeVisualImage(image.bytes);
  if (!result.ok) throw new Error(result.reason);
  return {
    text: result.text,
    source: { originalSha256: image.originalSha256, derivativeSha256: image.derivativeSha256,
      width: image.width, height: image.height, transformVersion: image.transformVersion,
      status: "transcribed_unverified", visualAnalysis: "not_performed" },
  };
}

/** A fixed extraction notice travels with evidence through legacy text-only consumers. */
export function visualTranscriptContext(text: string): string {
  return `[Image transcription — unverified]\n${VISUAL_TRANSCRIPT_WARNING}\n\n${text}`;
}
