import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { uploadAndShareWithAdmin } from "@/lib/google-drive";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * POST /api/evidence/upload
 * Authenticated users upload a file (PDF, DOCX, etc.) to Google Drive.
 * The file is automatically shared with admin@blockid.au and recorded
 * as evidence in the user's SVI Evidence Vault.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const dimension = (formData.get("dimension") as string) ?? "ptd";

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

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Upload to Google Drive and share with admin
    const driveResult = await uploadAndShareWithAdmin(
      buffer,
      file.name,
      file.type,
      user.email,
    );

    // Record as evidence in the database
    const supabase = getSupabaseAdmin();
    let evidenceId: string | null = null;

    if (supabase) {
      // Find or create SVI account
      let accountId: string | null = null;
      const { data: account } = await supabase
        .from("svi_accounts")
        .select("id")
        .eq("email", user.email)
        .maybeSingle();

      if (account) {
        accountId = account.id;
      } else {
        const { data: created } = await supabase
          .from("svi_accounts")
          .insert({ email: user.email })
          .select("id")
          .single();
        if (created) accountId = created.id;
      }

      if (accountId) {
        const { data: ev } = await supabase
          .from("svi_evidence")
          .insert({
            account_id: accountId,
            evidence_type: "document_uploaded",
            label: file.name,
            value_or_url: driveResult.webViewLink ?? null,
            confidence_level: "document_uploaded",
            dimension,
            svi_impact: 10,
          })
          .select("id")
          .single();
        if (ev) evidenceId = ev.id;
      }
    }

    return NextResponse.json({
      ok: true,
      fileId: driveResult.id,
      webViewLink: driveResult.webViewLink,
      evidenceId,
    });
  } catch (err) {
    console.error("[blockid:evidence:upload] upload failed", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
