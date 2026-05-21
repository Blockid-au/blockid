import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getOrCreateUserFolder } from "@/lib/google-drive";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DATA_ROOM_STRUCTURE } from "@/lib/data-room-templates";

export const dynamic = "force-dynamic";

/**
 * POST /api/dataroom/setup
 * Auto-creates the full data room folder structure in Google Drive for the
 * authenticated user. Creates sub-folders matching the template structure
 * and uploads template documents as Google Docs.
 *
 * Idempotent — if folders already exist they are reused.
 */
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { google } = await import("googleapis");
    const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");

    if (!clientEmail || !privateKey) {
      return NextResponse.json({ error: "Google Drive not configured" }, { status: 503 });
    }

    const auth = new google.auth.GoogleAuth({
      credentials: { client_email: clientEmail, private_key: privateKey },
      scopes: ["https://www.googleapis.com/auth/drive"],
    });
    const drive = google.drive({ version: "v3", auth });

    // Get or create the user's root folder
    const { folderId: rootFolderId, folderUrl: rootFolderUrl } = await getOrCreateUserFolder(
      user.email,
      user.displayName,
    );

    // Create "Data Room" subfolder under user's root
    let dataRoomFolderId: string;
    let dataRoomFolderUrl: string;

    const existingDR = await drive.files.list({
      q: `name = 'Data Room' and '${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id, webViewLink)",
    });

    if (existingDR.data.files?.length) {
      dataRoomFolderId = existingDR.data.files[0].id!;
      dataRoomFolderUrl = existingDR.data.files[0].webViewLink ?? `https://drive.google.com/drive/folders/${dataRoomFolderId}`;
    } else {
      const created = await drive.files.create({
        requestBody: {
          name: "Data Room",
          mimeType: "application/vnd.google-apps.folder",
          parents: [rootFolderId],
          description: `BlockID.au — Investor-ready data room for ${user.email}`,
        },
        fields: "id, webViewLink",
      });
      dataRoomFolderId = created.data.id!;
      dataRoomFolderUrl = created.data.webViewLink ?? `https://drive.google.com/drive/folders/${dataRoomFolderId}`;

      // Share with user
      await drive.permissions.create({
        fileId: dataRoomFolderId,
        requestBody: { type: "user", role: "writer", emailAddress: user.email },
        sendNotificationEmail: false,
      }).catch(() => {});
    }

    // Create sub-folders for each data room section and upload templates
    const folderResults: Array<{
      name: string;
      folderId: string;
      folderUrl: string;
      templatesCreated: number;
    }> = [];

    for (const folder of DATA_ROOM_STRUCTURE) {
      // Check if section folder already exists
      let sectionFolderId: string;
      let sectionFolderUrl: string;

      const existingSection = await drive.files.list({
        q: `name = '${folder.name}' and '${dataRoomFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id, webViewLink)",
      });

      if (existingSection.data.files?.length) {
        sectionFolderId = existingSection.data.files[0].id!;
        sectionFolderUrl = existingSection.data.files[0].webViewLink ?? `https://drive.google.com/drive/folders/${sectionFolderId}`;
      } else {
        const created = await drive.files.create({
          requestBody: {
            name: folder.name,
            mimeType: "application/vnd.google-apps.folder",
            parents: [dataRoomFolderId],
            description: folder.description,
          },
          fields: "id, webViewLink",
        });
        sectionFolderId = created.data.id!;
        sectionFolderUrl = created.data.webViewLink ?? `https://drive.google.com/drive/folders/${sectionFolderId}`;
      }

      // Upload template documents as Google Docs
      let templatesCreated = 0;
      for (const doc of folder.documents) {
        if (doc.type !== "template" || !doc.templateContent) continue;

        // Check if template already exists
        const existingDoc = await drive.files.list({
          q: `name = '${doc.name} (Template)' and '${sectionFolderId}' in parents and trashed = false`,
          fields: "files(id)",
        });

        if (existingDoc.data.files?.length) {
          // Template already exists, skip
          templatesCreated++;
          continue;
        }

        // Create as Google Doc (convert markdown to plain text for Drive)
        const { Readable } = await import("stream");
        const stream = new Readable();
        stream.push(doc.templateContent);
        stream.push(null);

        await drive.files.create({
          requestBody: {
            name: `${doc.name} (Template)`,
            parents: [sectionFolderId],
            mimeType: "application/vnd.google-apps.document", // Create as Google Doc
            description: doc.description,
          },
          media: {
            mimeType: "text/plain",
            body: stream,
          },
          fields: "id",
        });

        templatesCreated++;
      }

      folderResults.push({
        name: folder.name,
        folderId: sectionFolderId,
        folderUrl: sectionFolderUrl,
        templatesCreated,
      });
    }

    // Persist the data room folder ID to the user's account
    const supabase = getSupabaseAdmin();
    if (supabase) {
      await supabase
        .from("svi_accounts")
        .update({ drive_folder_id: dataRoomFolderId })
        .eq("email", user.email);
    }

    return NextResponse.json({
      ok: true,
      dataRoomFolderId,
      dataRoomFolderUrl,
      rootFolderId,
      rootFolderUrl,
      folders: folderResults,
      totalTemplates: folderResults.reduce((sum, f) => sum + f.templatesCreated, 0),
    });
  } catch (err) {
    console.error("[dataroom:setup] failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Setup failed" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/dataroom/setup
 * Returns the data room template structure (no auth required for browsing).
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    structure: DATA_ROOM_STRUCTURE.map(folder => ({
      name: folder.name,
      stage: folder.stage,
      priority: folder.priority,
      description: folder.description,
      documents: folder.documents.map(doc => ({
        name: doc.name,
        type: doc.type,
        format: doc.format,
        description: doc.description,
        hasTemplate: doc.type === "template" && !!doc.templateContent,
        connectTo: doc.connectTo,
      })),
    })),
  });
}
