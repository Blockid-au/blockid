import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser, ADMIN_EMAIL} from "@/lib/auth";
import { uploadToGoogleDrive } from "@/lib/google-drive";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isAdmin = user.email === ADMIN_EMAIL || user.role === "admin";
    if (!isAdmin) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const ALLOWED_TYPES = new Set([
      "application/pdf",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // docx
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // xlsx
      "application/vnd.ms-excel", // xls
      "image/png",
      "image/jpeg",
      "image/webp",
      "text/csv",
    ]);

    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { ok: false, reason: "File type not allowed. Accepted: PDF, DOCX, XLSX, PNG, JPG, CSV" },
        { status: 400 },
      );
    }

    if (file.size > 25 * 1024 * 1024) {
      return NextResponse.json(
        { ok: false, reason: "File too large (max 25MB)" },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    
    const result = await uploadToGoogleDrive(buffer, file.name, file.type);

    return NextResponse.json({ 
      success: true, 
      id: result.id,
      webViewLink: result.webViewLink 
    });
  } catch (error) {
    console.error("[blockid:admin:drive-upload] upload failed", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
