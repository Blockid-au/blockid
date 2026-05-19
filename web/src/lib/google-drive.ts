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
