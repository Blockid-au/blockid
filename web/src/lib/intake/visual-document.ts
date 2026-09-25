import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import type { Readable } from "node:stream";
import { extractVisualTranscript } from "./visual-transcript";
import { visualHash } from "./visual-evidence";

export interface DocumentVisualUnit {
  locator: string; state: "partial" | "unreadable" | "unsupported" | "budget_blocked";
  reason: string; originalSha256?: string; model?: string;
}
export interface DocumentVisualResult { documentSha256: string; text: string; units: DocumentVisualUnit[]; warnings: string[] }
const MAX_UNITS = 3, MAX_MS = 55_000, MAX_BYTES = 25 * 1024 * 1024;
const LIMIT_NOTICE = "Visual document extraction is partial and unverified. Embedded images are read separately from slide layout. Unprocessed pages or images are listed; they are not evidence of absence.";
type ZipEntry = { path: string; uncompressedSize: number; stream(): Readable };

function command(args: string[], timeout: number): Promise<string> {
  return new Promise((resolve, reject) => execFile("/usr/bin/prlimit", ["--as=1073741824", "--cpu=15", "--fsize=8388608", "--", "/usr/bin/mutool", ...args], { timeout, maxBuffer: 256 * 1024, killSignal: "SIGKILL" }, (err, stdout) => err ? reject(Error("pdf_render_unavailable")) : resolve(stdout)));
}
async function readEntry(entry: ZipEntry, max: number): Promise<Buffer> {
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize < 0 || entry.uncompressedSize > max) throw Error("embedded_image_too_large");
  const stream = entry.stream(), parts: Buffer[] = []; let bytes = 0;
  const timer = setTimeout(() => stream.destroy(Error("embedded_image_timeout")), 3000);
  try {
    for await (const value of stream) {
      const part = Buffer.from(value); bytes += part.length;
      if (bytes > max) throw Error("embedded_image_too_large");
      parts.push(part);
    }
    return Buffer.concat(parts);
  } finally { clearTimeout(timer); stream.destroy(); }
}

/** Native text stays canonical. Render only local bytes, with OS CPU/memory/file caps;
 * never fetch linked assets, execute Office macros or persist upload derivatives.
 */
export async function extractDocumentVisuals(bytes: Buffer, filename: string): Promise<DocumentVisualResult> {
  const out: DocumentVisualResult = { documentSha256: visualHash(bytes), text: "", units: [], warnings: [] };
  if (bytes.length > MAX_BYTES) return { ...out, warnings: ["Document exceeds visual extraction size limit."] };
  const deadline = Date.now() + MAX_MS, texts: string[] = [], seen = new Set<string>();
  let consumed = 0;
  async function inspect(locator: string, read: () => Promise<Buffer>) {
    if (consumed >= MAX_UNITS || Date.now() >= deadline - 1000) {
      out.units.push({ locator, state: "budget_blocked", reason: "Per-document image/time limit reached." }); return;
    }
    consumed++;
    try {
      const image = await read(), originalSha256 = visualHash(image);
      if (seen.has(originalSha256)) { out.units.push({ locator, state: "partial", originalSha256, reason: "Duplicate image; see the earlier occurrence. Not independent corroboration." }); return; }
      seen.add(originalSha256);
      const result = await extractVisualTranscript(image, { deadlineAt: deadline, ocrTimeoutMs: 10000 });
      texts.push(`[Visual source ${locator}; unverified]\n${result.text}`);
      out.units.push({ locator, state: "partial", originalSha256, model: result.source.model, reason: [...(result.source.limitations ?? []), "Extracted observations remain unverified; image-only extraction does not preserve full slide layout."].join(" ").slice(0, 1000) });
    } catch { out.units.push({ locator, state: "unreadable", reason: "Image decoding, transcription or interpretation unavailable within limits." }); }
  }
  let directory: string | undefined;
  try {
    if (bytes.subarray(0, 4).toString("ascii") === "%PDF") {
      directory = await fs.mkdtemp(join(tmpdir(), "blockid-visual-"));
      await fs.chmod(directory, 0o700);
      const input = join(directory, "input.pdf"); await fs.writeFile(input, bytes, { mode: 0o600 });
      const info = await command(["info", input], 5000);
      const pages = Number(/Pages:\s*(\d+)/i.exec(info)?.[1]);
      if (!Number.isSafeInteger(pages) || pages < 1 || pages > 500) throw Error("pdf_page_limit_or_unknown");
      for (let page = 1; page <= pages; page++) {
        await inspect(`page:${page}`, async () => {
          const output = join(directory!, `page-${page}.png`);
          await command(["draw", "-q", "-F", "png", "-w", "1600", "-h", "1600", "-o", output, input, String(page)], Math.max(1, Math.min(10000, deadline - Date.now())));
          const size = (await fs.stat(output)).size; if (size > 8 * 1024 * 1024) throw Error("page_too_large");
          return fs.readFile(output);
        });
      }
    } else if (/\.(pptx|docx)$/i.test(filename)) {
      // Loaded only for an Office container; no archive extraction to disk.
      const { Open } = await import("unzipper");
      const archive = await Open.buffer(bytes);
      if (archive.files.length > 2000) throw Error("office_entry_limit");
      const media = archive.files.filter(e => /^(ppt|word)\/media\/[^/]+$/i.test(e.path));
      for (const entry of media) {
        if (!/\.(png|jpe?g|webp)$/i.test(entry.path)) {
          out.units.push({ locator: entry.path, state: "unsupported", reason: "Embedded format not supported; convert to PNG/JPEG/WebP." }); continue;
        }
        await inspect(entry.path, () => readEntry(entry, 8 * 1024 * 1024));
      }
      if (media.length) out.warnings.push("Embedded images were inspected without complete rendered slide layout. Cross-check labels, footnotes and crop context in the original.");
    }
  } catch {
    out.units.push({ locator: "document", state: "unsupported", reason: "Visual enumeration/rendering unavailable or document limit exceeded. Native text may still be available." });
  } finally { if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => undefined); }
  if (out.units.length) {
    out.warnings.push(LIMIT_NOTICE, `Visual coverage: ${out.units.filter(u => u.state === "partial").length}/${out.units.length} units partly read; remaining units need another source or a later pass.`);
    if (texts.length) out.text = `${LIMIT_NOTICE}\n${texts.join("\n\n")}\nVisual coverage: ${out.units.map(u => `${u.locator}: ${u.state}`).join("; ")}`;
  }
  return out;
}
