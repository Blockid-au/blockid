import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * SVI Dimension → Data Room folder mapping.
 * Each dimension maps to a structured folder in the user's Drive.
 */
const SVI_DATAROOM_STRUCTURE: Record<string, { label: string; description: string; filePatterns: string[] }> = {
  ftv: {
    label: "01 — Team & Founders",
    description: "Team profiles, CVs, LinkedIn exports, advisor agreements",
    filePatterns: ["cv", "resume", "linkedin", "team", "founder", "advisor", "profile"],
  },
  mpc: {
    label: "02 — Market & Competitive",
    description: "Market research, TAM/SAM analysis, customer interviews, competitive landscape",
    filePatterns: ["market", "tam", "sam", "som", "competitive", "research", "survey", "customer", "interview"],
  },
  ptd: {
    label: "03 — Product & Technical",
    description: "Product specs, architecture docs, demo screenshots, GitHub exports",
    filePatterns: ["product", "technical", "architecture", "spec", "demo", "screenshot", "github", "code"],
  },
  tre: {
    label: "04 — Traction & Revenue",
    description: "Revenue reports, analytics, invoices, Stripe exports, growth data",
    filePatterns: ["revenue", "invoice", "stripe", "analytics", "traction", "growth", "mrr", "arr", "customer"],
  },
  cgh: {
    label: "05 — Cap Table & Governance",
    description: "Cap table, shareholder agreement, vesting schedule, board minutes",
    filePatterns: ["cap table", "equity", "shareholder", "vesting", "board", "minutes", "shares", "esop"],
  },
  iri: {
    label: "06 — Investor Readiness",
    description: "Pitch deck, financial model, data room docs, term sheets",
    filePatterns: ["pitch", "deck", "financial model", "term sheet", "data room", "investor", "fundraise"],
  },
  lco: {
    label: "07 — Legal & Compliance",
    description: "ABN/ASIC registration, IP assignments, contracts, privacy policy",
    filePatterns: ["legal", "contract", "agreement", "asic", "abn", "ip", "patent", "trademark", "privacy", "terms"],
  },
  svm: {
    label: "08 — Strategic Value & Moat",
    description: "Competitive advantages, patents, network effects, data moat documentation",
    filePatterns: ["moat", "strategy", "competitive advantage", "patent", "network effect", "data"],
  },
};

/**
 * POST /api/dataroom/clone
 * Clones files from a user's source folders into SVI-structured subfolders.
 * Creates the folder structure in the user's BlockID Drive folder.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });

  const body = await request.json() as { sourceFolderId?: string };

  // Get user's BlockID Drive folder
  const { data: account } = await supabase
    .from("svi_accounts")
    .select("drive_folder_id")
    .eq("email", user.email)
    .maybeSingle();

  if (!account?.drive_folder_id) {
    return NextResponse.json({ error: "No BlockID Drive folder. Create one first." }, { status: 400 });
  }

  try {
    // Data room structure (always returned, even without Drive)
    const structure = Object.entries(SVI_DATAROOM_STRUCTURE).map(([dim, info]) => ({
      dimension: dim,
      ...info,
      folderId: null as string | null,
      folderUrl: null as string | null,
    }));

    // Try Google Drive — gracefully handle quota exceeded
    let driveAvailable = false;
    const dimensionFolders: Record<string, string> = {};

    try {
      const { google } = await import("googleapis");
      const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
      const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");

      if (!clientEmail || !privateKey) throw new Error("Drive not configured");

      const auth = new google.auth.GoogleAuth({
        credentials: { client_email: clientEmail, private_key: privateKey },
        scopes: ["https://www.googleapis.com/auth/drive"],
      });
      const drive = google.drive({ version: "v3", auth });
      const userFolderId = account.drive_folder_id;

      if (!userFolderId) throw new Error("No user Drive folder");

      // 1. Create SVI-structured subfolders
      for (const [dim, info] of Object.entries(SVI_DATAROOM_STRUCTURE)) {
        const existing = await drive.files.list({
          q: `name = '${info.label}' and '${userFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id)",
        });

        if (existing.data.files?.length) {
          dimensionFolders[dim] = existing.data.files[0].id!;
        } else {
          const created = await drive.files.create({
            requestBody: {
              name: info.label,
              mimeType: "application/vnd.google-apps.folder",
              parents: [userFolderId],
              description: info.description,
            },
            fields: "id",
          });
          dimensionFolders[dim] = created.data.id!;
        }
      }
      driveAvailable = true;

      // Update structure with Drive folder IDs
      for (const s of structure) {
        if (dimensionFolders[s.dimension]) {
          s.folderId = dimensionFolders[s.dimension];
          s.folderUrl = `https://drive.google.com/drive/folders/${dimensionFolders[s.dimension]}`;
        }
      }
    } catch (driveErr) {
      const errMsg = driveErr instanceof Error ? driveErr.message : String(driveErr);
      const isQuotaError = errMsg.includes("quota") || errMsg.includes("storage") || errMsg.includes("limit") || errMsg.includes("insufficient");
      console.warn(`[dataroom:clone] Drive ${isQuotaError ? "quota exceeded" : "unavailable"}: ${errMsg}`);
      // Continue without Drive — data room structure still returned from DB
    }

    // 2. If sourceFolderId provided AND Drive available, scan and clone files
    let clonedCount = 0;
    if (body.sourceFolderId && driveAvailable && Object.keys(dimensionFolders).length > 0) {
      try {
        const { google } = await import("googleapis");
        const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
        const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
        const auth = new google.auth.GoogleAuth({
          credentials: { client_email: clientEmail!, private_key: privateKey! },
          scopes: ["https://www.googleapis.com/auth/drive"],
        });
        const drive = google.drive({ version: "v3", auth });

        const sourceFiles = await drive.files.list({
          q: `'${body.sourceFolderId}' in parents and trashed = false`,
          fields: "files(id, name, mimeType, size)",
          pageSize: 200,
        });

        for (const file of sourceFiles.data.files ?? []) {
          const fileName = (file.name ?? "").toLowerCase();
          let targetDim = "iri";

          for (const [dim, info] of Object.entries(SVI_DATAROOM_STRUCTURE)) {
            if (info.filePatterns.some((p) => fileName.includes(p))) {
              targetDim = dim;
              break;
            }
          }

          try {
            const copied = await drive.files.copy({
              fileId: file.id!,
              requestBody: {
                name: file.name,
                parents: [dimensionFolders[targetDim]],
              },
              fields: "id, webViewLink",
            });

          // Record in dataroom_files
          await supabase.from("dataroom_files").insert({
            user_id: user.id,
            email: user.email,
            svi_dimension: targetDim,
            file_name: file.name,
            drive_file_id: copied.data.id,
            drive_file_url: copied.data.webViewLink,
            source_folder_id: null,
            file_size_bytes: file.size ? parseInt(file.size) : null,
            mime_type: file.mimeType,
            status: "indexed",
          });

          clonedCount++;
        } catch {
          // Skip files that can't be copied (permission/quota issues)
        }
      }
      } catch (cloneErr) {
        console.warn("[dataroom:clone] File cloning failed (quota?):", cloneErr instanceof Error ? cloneErr.message : cloneErr);
      }
    }

    // 3. Return structure (works with or without Drive)
    const rootFolderId = account.drive_folder_id;

    return NextResponse.json({
      ok: true,
      driveAvailable,
      rootFolderId: rootFolderId ?? null,
      rootFolderUrl: rootFolderId ? `https://drive.google.com/drive/folders/${rootFolderId}` : null,
      structure,
      clonedFiles: clonedCount,
      message: driveAvailable ? undefined : "Data room structure created (Drive unavailable — quota may be exceeded). Structure saved to database.",
    });
  } catch (err) {
    console.error("[dataroom:clone] failed", err);
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "Clone failed" }, { status: 500 });
  }
}

/** GET /api/dataroom/clone — get the SVI data room structure definition */
export async function GET() {
  return NextResponse.json({
    ok: true,
    structure: Object.entries(SVI_DATAROOM_STRUCTURE).map(([dim, info]) => ({
      dimension: dim,
      ...info,
    })),
  });
}
