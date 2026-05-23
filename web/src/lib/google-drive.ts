import { google } from "googleapis";
import { Readable } from "stream";
import type { RndReport } from "./rnd-analysis";
import type { SVIAnalysis } from "./svi-analysis";

function getDriveClient() {
  const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;

  if (!clientEmail || !privateKey || !folderId) {
    throw new Error("Google Drive credentials are not fully configured.");
  }

  const auth = new google.auth.GoogleAuth({
    credentials: {
      client_email: clientEmail,
      private_key: privateKey,
    },
    scopes: ["https://www.googleapis.com/auth/drive"],
  });

  return { drive: google.drive({ version: "v3", auth }), folderId };
}

export async function uploadToGoogleDrive(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
) {
  const { drive, folderId } = getDriveClient();

  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, webViewLink, webContentLink",
  });

  return response.data;
}

/**
 * Upload a file and share it with admin@blockid.au (or a custom email).
 * The file is placed in the shared Drive folder and the admin is granted
 * writer access so they can review and manage user-uploaded documents.
 */
export async function uploadAndShareWithAdmin(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  uploaderEmail: string,
) {
  const { drive, folderId } = getDriveClient();
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@blockid.au";

  // Prefix file with uploader email for easy identification
  const prefixedName = `[${uploaderEmail}] ${fileName}`;

  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const response = await drive.files.create({
    requestBody: {
      name: prefixedName,
      parents: [folderId],
      description: `Uploaded by ${uploaderEmail} via BlockID Evidence Vault`,
    },
    media: {
      mimeType,
      body: stream,
    },
    fields: "id, webViewLink, webContentLink",
  });

  const fileId = response.data.id;

  // Share with admin
  if (fileId) {
    await drive.permissions.create({
      fileId,
      requestBody: {
        type: "user",
        role: "writer",
        emailAddress: adminEmail,
      },
      sendNotificationEmail: false,
    });
  }

  return response.data;
}

// ── Per-user folder management ──────────────────────────────────────────

/**
 * Get or create a dedicated Drive folder for a user + project.
 * Each (user, project) pair gets its own folder under the main BlockID Drive folder.
 * Folder is shared with both the user and admin.
 *
 * Folder naming: "ProjectName — user@email.com" or "user@email.com" if no project.
 */
export async function getOrCreateUserFolder(
  userEmail: string,
  displayName?: string | null,
  projectName?: string | null,
): Promise<{ folderId: string; folderUrl: string }> {
  const { drive, folderId: rootFolderId } = getDriveClient();
  const adminEmail = process.env.ADMIN_EMAIL ?? "admin@blockid.au";

  // Folder name includes project name for multi-project isolation
  const folderSearchName = projectName
    ? `${projectName} — ${userEmail}`
    : userEmail;

  // Check if folder already exists for this user+project
  const searchQuery = `name = '${folderSearchName.replace(/'/g, "\\'")}' and '${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const existing = await drive.files.list({
    q: searchQuery,
    fields: "files(id, webViewLink)",
    spaces: "drive",
  });

  if (existing.data.files?.length) {
    const folder = existing.data.files[0];
    return {
      folderId: folder.id!,
      folderUrl: folder.webViewLink ?? `https://drive.google.com/drive/folders/${folder.id}`,
    };
  }

  // Create new folder with project name
  const folderName = projectName
    ? `${projectName} — ${displayName ?? userEmail}`
    : (displayName ? `${displayName} (${userEmail})` : userEmail);
  const created = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootFolderId],
      description: `BlockID.au — Documents for ${userEmail}`,
    },
    fields: "id, webViewLink",
  });

  const newFolderId = created.data.id!;
  const folderUrl = created.data.webViewLink ?? `https://drive.google.com/drive/folders/${newFolderId}`;

  // Share with user (viewer) and admin (writer)
  await Promise.all([
    drive.permissions.create({
      fileId: newFolderId,
      requestBody: { type: "user", role: "reader", emailAddress: userEmail },
      sendNotificationEmail: false,
    }).catch(() => {}), // ignore if user email is invalid
    drive.permissions.create({
      fileId: newFolderId,
      requestBody: { type: "user", role: "writer", emailAddress: adminEmail },
      sendNotificationEmail: false,
    }).catch(() => {}),
  ]);

  return { folderId: newFolderId, folderUrl };
}

/**
 * Upload a file to a user's dedicated folder.
 * Creates the user folder if it doesn't exist.
 * Returns file metadata + folder info.
 */
export async function uploadToUserFolder(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  userEmail: string,
  displayName?: string | null,
): Promise<{
  fileId: string | null;
  fileUrl: string | null;
  folderId: string;
  folderUrl: string;
}> {
  const { drive } = getDriveClient();
  const { folderId, folderUrl } = await getOrCreateUserFolder(userEmail, displayName);

  const stream = new Readable();
  stream.push(fileBuffer);
  stream.push(null);

  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      description: `Uploaded by ${userEmail} via BlockID.au`,
    },
    media: { mimeType, body: stream },
    fields: "id, webViewLink",
  });

  // Share file with user
  if (response.data.id) {
    await drive.permissions.create({
      fileId: response.data.id,
      requestBody: { type: "user", role: "reader", emailAddress: userEmail },
      sendNotificationEmail: false,
    }).catch(() => {});
  }

  return {
    fileId: response.data.id ?? null,
    fileUrl: response.data.webViewLink ?? null,
    folderId,
    folderUrl,
  };
}

/**
 * List files in a user's Drive folder.
 */
export async function listUserFolderFiles(
  userFolderId: string,
): Promise<Array<{ id: string; name: string; webViewLink: string; mimeType: string; createdTime: string }>> {
  const { drive } = getDriveClient();
  const response = await drive.files.list({
    q: `'${userFolderId}' in parents and trashed = false`,
    fields: "files(id, name, webViewLink, mimeType, createdTime)",
    orderBy: "createdTime desc",
    pageSize: 100,
  });

  return (response.data.files ?? []).map((f) => ({
    id: f.id!,
    name: f.name!,
    webViewLink: f.webViewLink ?? "",
    mimeType: f.mimeType ?? "",
    createdTime: f.createdTime ?? "",
  }));
}

// ── Report Google Doc generation ────────────────────────────────────────────

/**
 * Build a plain-text representation of an SVI / R&D report suitable for
 * uploading as a Google Doc.
 */
function buildReportPlainText(
  slug: string,
  report: RndReport,
  analysis: SVIAnalysis,
): string {
  const lines: string[] = [];

  lines.push("BlockID.au — Startup Value Index Report");
  lines.push(`Generated: ${report.createdAt}`);
  lines.push(`SVI Score: ${analysis.totalSVI} | Stage: ${analysis.stageLabel}`);
  lines.push(`Report Tier: ${report.tier} | Overall Score: ${report.overallScore}/100`);
  lines.push(`Report ID: ${slug}`);
  lines.push("---");
  lines.push("");

  for (const page of report.pages) {
    lines.push(`Page ${page.pageNum}: ${page.title}`);
    if (page.subtitle) lines.push(page.subtitle);
    lines.push("");
    lines.push(page.content);
    if (page.highlights?.length) {
      lines.push("");
      lines.push("Key highlights:");
      for (const h of page.highlights) {
        lines.push(`  - ${h}`);
      }
    }
    if (page.dataPoints && Object.keys(page.dataPoints).length > 0) {
      lines.push("");
      lines.push("Data points:");
      for (const [k, v] of Object.entries(page.dataPoints)) {
        lines.push(`  ${k}: ${v}`);
      }
    }
    if (page.extendedSections?.length) {
      for (const ext of page.extendedSections) {
        lines.push("");
        lines.push(`  >> ${ext.title}`);
        lines.push(ext.content);
      }
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  }

  lines.push("Disclaimer: This analysis is produced by BlockID.au (Auschain PTY LTD, ACN 659 615 111, ABN 79 659 615 111).");
  lines.push("The Startup Value Index (SVI) is NOT a financial valuation or investment recommendation.");
  lines.push("BlockID does not hold an Australian Financial Services Licence (AFSL).");
  lines.push("For financial advice, consult a qualified Australian financial adviser.");
  lines.push("");
  lines.push("https://blockid.au");

  return lines.join("\n");
}

/**
 * Create a Google Doc containing the SVI / R&D report in the user's
 * Drive folder. Returns `{ docId, docUrl }` on success, or `null` if
 * Drive is not configured or the operation fails.
 *
 * The function first attempts to create a native Google Doc via the Docs
 * API. If that API is unavailable (e.g. the service account only has the
 * Drive scope), it falls back to uploading a plain-text file via
 * `drive.files.create` with MIME-type conversion.
 */
export async function createReportGoogleDoc(
  email: string,
  slug: string,
  report: RndReport,
  analysis: SVIAnalysis,
): Promise<{ docId: string; docUrl: string } | null> {
  try {
    // Bail out early if Drive credentials are missing
    const clientEmail = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
    const privateKey = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
    if (!clientEmail || !privateKey) return null;

    const { drive } = getDriveClient();

    // Get (or create) the user's folder so the doc lands next to their
    // other evidence files.
    const { folderId: userFolderId } = await getOrCreateUserFolder(email);

    const docTitle = `SVI Report — ${slug} — ${new Date().toISOString().slice(0, 10)}`;
    const plainText = buildReportPlainText(slug, report, analysis);

    // Attempt 1: Upload plain-text with MIME-type conversion to Google Doc.
    // This works with only the Drive scope and avoids needing the Docs API.
    const stream = new Readable();
    stream.push(Buffer.from(plainText, "utf-8"));
    stream.push(null);

    const response = await drive.files.create({
      requestBody: {
        name: docTitle,
        parents: [userFolderId],
        mimeType: "application/vnd.google-apps.document", // convert to Google Doc
        description: `BlockID.au SVI Report for ${email} (${slug})`,
      },
      media: {
        mimeType: "text/plain",
        body: stream,
      },
      fields: "id, webViewLink",
    });

    const docId = response.data.id;
    const docUrl =
      response.data.webViewLink ??
      (docId ? `https://docs.google.com/document/d/${docId}/edit` : null);

    if (!docId || !docUrl) return null;

    // Share with the user (viewer) so they can open the link
    await drive.permissions.create({
      fileId: docId,
      requestBody: { type: "user", role: "reader", emailAddress: email },
      sendNotificationEmail: false,
    }).catch(() => {}); // ignore if email is invalid

    return { docId, docUrl };
  } catch (err) {
    console.error("[google-drive] createReportGoogleDoc failed:", err);
    return null;
  }
}
