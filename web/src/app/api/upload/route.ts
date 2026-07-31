import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getScannerVersion, scanBuffer } from "@/lib/security/clamav";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const ALLOWED_ORIGINS = [
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://blockid.au",
  "https://upload.blockid.au",
  "https://staging.blockid.au",
  "https://dev.blockid.au",
];

function corsHeaders(requestOrigin?: string | null): Record<string, string> {
  const origin = ALLOWED_ORIGINS.includes(requestOrigin ?? "") ? requestOrigin! : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, Cookie",
    "Access-Control-Allow-Credentials": "true",
  };
}

/** CORS preflight */
export async function OPTIONS(request: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) });
}

// Uploads dir: /app/uploads (Docker volume mount) or /public/uploads (dev)
const UPLOAD_DIR = existsSync("/app/uploads") ? "/app/uploads" : join(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads");
const MAX_SIZE = 50 * 1024 * 1024; // 50MB
// Serve via upload.blockid.au (nginx static) or fallback to blockid.au/uploads
const UPLOAD_BASE_URL = process.env.NEXT_PUBLIC_UPLOAD_URL ?? "https://upload.blockid.au";

const ALLOWED_TYPES: Record<string, string[]> = {
  // NOTE: image/svg+xml is deliberately excluded — SVGs can carry inline
  // <script>, and uploads are served from the trusted upload.blockid.au origin,
  // which would make any uploaded SVG a stored-XSS vector.
  image: ["image/jpeg", "image/png", "image/gif", "image/webp"],
  video: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"],
  document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  spreadsheet: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
  presentation: ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  text: ["text/plain", "text/markdown"],
  archive: ["application/zip", "application/gzip"],
};

const ALL_ALLOWED = Object.values(ALLOWED_TYPES).flat();

/**
 * Extension is derived from the VALIDATED MIME type, never from the
 * client-supplied filename.
 *
 * Uploads land in a directory nginx serves publicly, and nginx picks the
 * response Content-Type from the file extension — not from whatever MIME
 * the uploader claimed. Taking the extension from `originalName` therefore
 * let a caller decouple the two: send `Content-Type: application/pdf` so
 * the allowlist above passes, name the file `payload.html`, and the bytes
 * get written as `.html` and served back as `text/html` from blockid.au.
 * That is stored XSS on the app's own origin — the attacker's script runs
 * same-origin against a signed-in victim. The same trick reinstated the
 * SVG vector the allowlist comment above explicitly set out to block
 * (claim `image/png`, name it `.svg`).
 *
 * `X-Content-Type-Options: nosniff` does not help here: nosniff stops the
 * browser guessing a type *other* than the declared one, and nginx is
 * declaring `text/html` quite correctly for a `.html` file.
 *
 * Mapping from the allowlist means an extension can only ever be one we
 * already decided is safe to serve.
 */
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/gif": "gif",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "video/x-msvideo": "avi",
  "video/x-matroska": "mkv",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/csv": "csv",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
  "text/plain": "txt",
  "text/markdown": "md",
  "application/zip": "zip",
  "application/gzip": "gz",
};

function getSubdir(mimeType: string): string {
  for (const [category, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) {
      if (category === "image") return "images";
      if (category === "video") return "videos";
      return "documents";
    }
  }
  return "files";
}

/**
 * @param mimeType MUST already have passed the ALL_ALLOWED check.
 */
function generateFilename(mimeType: string): string {
  // `bin` is unreachable while EXT_BY_MIME covers every ALL_ALLOWED entry
  // (asserted in the colocated test), and is inert if that ever drifts.
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  const id = randomBytes(8).toString("hex");
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `${date}-${id}.${ext}`;
}

/**
 * POST /api/upload — upload a file to the server
 * Returns: { ok, url, filename, size, type }
 *
 * Auth required. Files saved to /public/uploads/{subdir}/
 * Accessible at https://upload.blockid.au/{subdir}/{filename}
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function corsJson(data: any, origin?: string | null, init?: { status?: number }) {
  return NextResponse.json(data, { ...init, headers: corsHeaders(origin) });
}

interface ScanAudit {
  userId: string | null;
  filenameStored: string;
  sizeBytes: number;
  mimeType: string;
  verdict: "clean" | "infected" | "scanner_error";
  signature: string | null;
}

/**
 * Best-effort audit-row write. NEVER blocks the upload response on Supabase
 * being reachable — this is an observability signal, not a correctness gate.
 * If SUPABASE_SERVICE_ROLE_KEY is unset we skip silently; the migration
 * (0301_upload_scans.sql) still needs to be applied for the insert to land.
 */
async function recordScan(a: ScanAudit): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    if (!supabase) return;
    // user_id is NOT NULL in the schema — skip the insert on the shared-
    // password path rather than 500'ing the upload. That path is deprecated
    // and disabled by default (UPLOAD_PASSWORD env unset).
    if (!a.userId) return;
    const scannerVersion = await getScannerVersion();
    const { error } = await supabase.from("upload_scans").insert({
      user_id: a.userId,
      filename_stored: a.filenameStored,
      size_bytes: a.sizeBytes,
      mime_type: a.mimeType,
      verdict: a.verdict,
      signature: a.signature,
      scanner_version: scannerVersion === "unknown" ? null : scannerVersion,
    });
    if (error) {
      console.error("[upload:audit] insert failed", error);
    }
  } catch (err) {
    console.error("[upload:audit] unexpected error", err);
  }
}

// No insecure default — password upload only works if UPLOAD_PASSWORD is
// explicitly configured. When unset (the production default), uploads require
// an authenticated session. This removes the previously hardcoded "1243".
const UPLOAD_PASSWORD = process.env.UPLOAD_PASSWORD;

export async function POST(request: Request) {
  const origin = request.headers.get("origin");

  const formData = await request.formData();

  // Auth: require a session cookie, OR a password field that matches a
  // configured UPLOAD_PASSWORD (no default — disabled unless set).
  const password = formData.get("password") as string | null;
  const user = await getCurrentUser();
  if (!user && (!UPLOAD_PASSWORD || password !== UPLOAD_PASSWORD)) {
    return corsJson({ error: "Unauthorized — sign in to upload" }, origin, { status: 401 });
  }

  const file = formData.get("file") as File | null;

  if (!file) {
    return corsJson({ error: "No file provided. Send as multipart/form-data with field 'file'" }, origin, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return corsJson({ error: `File too large. Max ${MAX_SIZE / 1024 / 1024}MB` }, origin, { status: 413 });
  }

  if (!ALL_ALLOWED.includes(file.type)) {
    return corsJson({
      error: `File type '${file.type}' not allowed. Accepted: images, PDFs, documents, spreadsheets, CSV, text, ZIP`,
    }, origin, { status: 415 });
  }

  const subdir = getSubdir(file.type);
  const dir = join(UPLOAD_DIR, subdir);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  // file.type, not file.name — see generateFilename's comment. file.type has
  // just been checked against ALL_ALLOWED; file.name is attacker-controlled.
  const filename = generateFilename(file.type);
  const filepath = join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());

  // Malware gate — clamd via INSTREAM (fail-CLOSED on timeout/unreachable).
  // The extension fix (68994a3c) stops a legit MIME being served as HTML;
  // this stops a legit-typed PDF/DOCX carrying a known exploit. Both layers
  // are needed. `user` is truthy on the session path; on the (deprecated)
  // shared-password path we still scan but record with a null user via a
  // sentinel row — the password gate is gated behind an explicit env var
  // and expected to disappear.
  const scan = await scanBuffer(buffer);
  if (!scan.ok && scan.verdict === "infected") {
    await recordScan({
      userId: user?.id ?? null,
      filenameStored: filename,
      sizeBytes: file.size,
      mimeType: file.type,
      verdict: "infected",
      signature: scan.signature ?? null,
    });
    return corsJson(
      {
        error: `Upload rejected — malware signature detected: ${scan.signature ?? "unknown"}. The file was NOT stored.`,
        signature: scan.signature ?? null,
      },
      origin,
      { status: 422 },
    );
  }
  if (!scan.ok && scan.verdict === "scanner_error") {
    await recordScan({
      userId: user?.id ?? null,
      filenameStored: filename,
      sizeBytes: file.size,
      mimeType: file.type,
      verdict: "scanner_error",
      signature: null,
    });
    // 503 — fail-CLOSED. Never fail-open on scanner error, even for signed-in
    // users, or a timeout budget becomes an upload bypass.
    return corsJson(
      { error: "Virus scanner unavailable — try again shortly." },
      origin,
      { status: 503 },
    );
  }

  await writeFile(filepath, buffer);
  await recordScan({
    userId: user?.id ?? null,
    filenameStored: filename,
    sizeBytes: file.size,
    mimeType: file.type,
    verdict: "clean",
    signature: null,
  });

  // Make file world-readable (nginx serves as different user)
  const { chmod } = await import("fs/promises");
  await chmod(filepath, 0o644);

  const url = `${UPLOAD_BASE_URL}/${subdir}/${filename}`;

  return corsJson({
    ok: true,
    url,
    filename,
    originalName: file.name,
    size: file.size,
    type: file.type,
    subdir,
  }, origin);
}

/**
 * GET /api/upload — list recent uploads (admin only)
 */
export async function GET(request: Request) {
  const origin = request.headers.get("origin");
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return corsJson({ error: "Admin only" }, origin, { status: 401 });
  }

  const { readdir, stat } = await import("fs/promises");

  const files: Array<{ name: string; url: string; size: number; subdir: string; modified: string }> = [];

  for (const subdir of ["images", "documents", "files"]) {
    const dir = join(UPLOAD_DIR, subdir);
    if (!existsSync(dir)) continue;
    const entries = await readdir(dir);
    for (const name of entries.slice(-50)) {
      const s = await stat(join(dir, name));
      files.push({
        name,
        url: `${UPLOAD_BASE_URL}/${subdir}/${name}`,
        size: s.size,
        subdir,
        modified: s.mtime.toISOString(),
      });
    }
  }

  files.sort((a, b) => b.modified.localeCompare(a.modified));

  return corsJson({ ok: true, files: files.slice(0, 50), total: files.length }, origin);
}
