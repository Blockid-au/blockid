import { google } from "googleapis";
import { Readable } from "stream";

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
