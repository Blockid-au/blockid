// GET /api/kb/export/[filename] — admin-only download of a previously
// exported KB file from web/content/reports/. Slug-restricted to kb-export-*.md
import { NextResponse } from "next/server";
import { readFile } from "node:fs/promises";
import { runtimeReportsPath } from "@/lib/runtime-paths";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ filename: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { filename } = await params;
  // Whitelist: only files we ourselves wrote
  if (!/^kb-export-\d{4}-\d{2}-\d{2}\.md$/.test(filename)) {
    return NextResponse.json({ error: "invalid filename" }, { status: 400 });
  }

  const absPath = runtimeReportsPath(filename); // L1-3: same live dir the export route writes
  try {
    const buf = await readFile(absPath);
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
}
