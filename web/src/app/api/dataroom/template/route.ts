import { NextRequest, NextResponse } from "next/server";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";

export const dynamic = "force-dynamic";

/**
 * GET /api/dataroom/template?name=Executive+Summary
 * Downloads a template document as a Markdown file.
 * No auth required — templates are public reference material.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json(
      { error: "Missing ?name= parameter" },
      { status: 400 },
    );
  }

  // Find the template across all folders
  for (const folder of DATA_ROOM_STRUCTURE) {
    for (const doc of folder.documents) {
      if (doc.name === name && doc.type === "template" && doc.templateContent) {
        const filename = `${doc.name.replace(/[^a-zA-Z0-9\s-]/g, "").replace(/\s+/g, "-")}-template.md`;

        return new NextResponse(doc.templateContent, {
          status: 200,
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      }
    }
  }

  return NextResponse.json(
    { error: `Template "${name}" not found` },
    { status: 404 },
  );
}
