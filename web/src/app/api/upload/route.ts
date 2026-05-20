import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

export const dynamic = "force-dynamic";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");
const MAX_SIZE = 50 * 1024 * 1024; // 50MB
const UPLOAD_BASE_URL = process.env.NEXT_PUBLIC_UPLOAD_URL ?? "https://upload.blockid.au";

const ALLOWED_TYPES: Record<string, string[]> = {
  image: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"],
  document: ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"],
  spreadsheet: ["application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv"],
  presentation: ["application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation"],
  text: ["text/plain", "text/markdown"],
  archive: ["application/zip", "application/gzip"],
};

const ALL_ALLOWED = Object.values(ALLOWED_TYPES).flat();

function getSubdir(mimeType: string): string {
  for (const [category, types] of Object.entries(ALLOWED_TYPES)) {
    if (types.includes(mimeType)) return category === "image" ? "images" : "documents";
  }
  return "files";
}

function generateFilename(originalName: string): string {
  const ext = originalName.split(".").pop() ?? "bin";
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
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized — sign in to upload" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file provided. Send as multipart/form-data with field 'file'" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: `File too large. Max ${MAX_SIZE / 1024 / 1024}MB` }, { status: 413 });
  }

  if (!ALL_ALLOWED.includes(file.type)) {
    return NextResponse.json({
      error: `File type '${file.type}' not allowed. Accepted: images, PDFs, documents, spreadsheets, CSV, text, ZIP`,
    }, { status: 415 });
  }

  const subdir = getSubdir(file.type);
  const dir = join(UPLOAD_DIR, subdir);
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });

  const filename = generateFilename(file.name);
  const filepath = join(dir, filename);

  const buffer = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buffer);

  // Make file world-readable (nginx serves as different user)
  const { chmod } = await import("fs/promises");
  await chmod(filepath, 0o644);

  const url = `${UPLOAD_BASE_URL}/${subdir}/${filename}`;

  return NextResponse.json({
    ok: true,
    url,
    filename,
    originalName: file.name,
    size: file.size,
    type: file.type,
    subdir,
  });
}

/**
 * GET /api/upload — list recent uploads (admin only)
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user || (user.email !== "admin@blockid.au" && user.role !== "admin")) {
    return NextResponse.json({ error: "Admin only" }, { status: 401 });
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

  return NextResponse.json({ ok: true, files: files.slice(0, 50), total: files.length });
}
