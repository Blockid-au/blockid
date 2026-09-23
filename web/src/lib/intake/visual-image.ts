import sharp from "sharp";
import { visualHash } from "./visual-evidence";

/** Conservative foundation limits; public intake stays disabled until qualification. */
export const VISUAL_IMAGE_LIMITS = Object.freeze({ bytes: 25 * 1024 * 1024, pixels: 20_000_000, edge: 8192, seconds: 10 });
export const VISUAL_TRANSFORM_VERSION = "upright-png-v1";

export type VisualImageFailure = "unsupported_image" | "image_too_large" | "animated_image" | "invalid_image";
export type PreparedVisualImage = {
  ok: true;
  originalSha256: string;
  derivativeSha256: string;
  mimeType: "image/png";
  width: number;
  height: number;
  transformVersion: typeof VISUAL_TRANSFORM_VERSION;
  /** Transient private bytes: callers need separate authority before persistence. */
  bytes: Buffer;
} | { ok: false; reason: VisualImageFailure };

function supportedSignature(bytes: Buffer): boolean {
  return (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) ||
    (bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP");
}

/** Full local decode; no inference, filesystem writes, remote fetch or retained EXIF. */
export async function prepareVisualImage(bytes: Buffer): Promise<PreparedVisualImage> {
  if (bytes.length > VISUAL_IMAGE_LIMITS.bytes) return { ok: false, reason: "image_too_large" };
  if (!supportedSignature(bytes)) return { ok: false, reason: "unsupported_image" };
  try {
    const decoder = sharp(bytes, { failOn: "warning", limitInputPixels: VISUAL_IMAGE_LIMITS.pixels, sequentialRead: true });
    const metadata = await decoder.metadata();
    if (!metadata.width || !metadata.height) return { ok: false, reason: "invalid_image" };
    if ((metadata.pages ?? 1) > 1) return { ok: false, reason: "animated_image" };
    if (metadata.width > VISUAL_IMAGE_LIMITS.edge || metadata.height > VISUAL_IMAGE_LIMITS.edge || metadata.width * metadata.height > VISUAL_IMAGE_LIMITS.pixels) return { ok: false, reason: "image_too_large" };
    // Rotate from EXIF before defining region coordinates; strip metadata by default.
    const output = await decoder.rotate().png().timeout({ seconds: VISUAL_IMAGE_LIMITS.seconds }).toBuffer({ resolveWithObject: true });
    if (output.data.length > VISUAL_IMAGE_LIMITS.bytes) return { ok: false, reason: "image_too_large" };
    return {
      ok: true, originalSha256: visualHash(bytes), derivativeSha256: visualHash(output.data),
      mimeType: "image/png", width: output.info.width, height: output.info.height,
      transformVersion: VISUAL_TRANSFORM_VERSION, bytes: output.data,
    };
  } catch {
    // Do not return decoder messages containing source metadata or private bytes.
    return { ok: false, reason: "invalid_image" };
  }
}
