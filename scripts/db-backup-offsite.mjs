#!/usr/bin/env node
// BlockID.au — off-box copy of the newest DB backup to Google Drive
// (release QA-3 P0-4).
//
//   node --env-file=web/.env scripts/db-backup-offsite.mjs [--dry] [--dir /data/backups]
//
// What it does
//   1. Picks the newest /data/backups/db-*.dump.gz + its .sha256 sidecar and
//      verifies the sidecar locally before uploading anything.
//   2. Finds (or creates) the sub-folder `blockid-db-backups/` under
//      GOOGLE_DRIVE_FOLDER_ID and uploads both files (idempotent: an existing
//      Drive file with the same name + size is left alone).
//   3. Prunes Drive copies in that sub-folder older than 30 days.
//   4. Verifies by re-listing the folder and comparing Drive's md5Checksum
//      with a locally computed md5 of the dump.
//   5. Appends {job:"offsite", ...} to web/content/reports/backup-health.jsonl
//      + a cron-health.jsonl row; Telegram on failure; exit 1 on failure.
//
// Credentials come only from env; nothing secret is ever printed or written
// to the health log. Auth modes (first match wins):
//   A. GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN + GOOGLE_CLIENT_ID/SECRET — uploads as
//      the founder's own account (files owned by admin@blockid.au). One-time
//      consent: node --env-file=web/.env scripts/db-backup-offsite-auth.mjs
//   B. GOOGLE_DRIVE_IMPERSONATE=<workspace user> — service account with
//      domain-wide delegation (Workspace Admin → Security → API controls).
//   C. plain service account — ONLY works when GOOGLE_DRIVE_SHARED_DRIVE_ID
//      (or a Shared-Drive GOOGLE_DRIVE_FOLDER_ID) is used: Google gives service
//      accounts zero My-Drive quota, so an upload into a user-owned folder is
//      rejected with "Service Accounts do not have storage quota".

import { createRequire } from "node:module";
import { createReadStream, promises as fs } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";

const REPO_ROOT = "/home/dovanlong/blockid.au";
const require = createRequire(path.join(REPO_ROOT, "web", "package.json"));
const { google } = require("googleapis");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const BACKUP_DIR = args.includes("--dir") ? args[args.indexOf("--dir") + 1] : "/data/backups";
const SUBFOLDER = "blockid-db-backups";
const RETENTION_DAYS = 30;
const HEALTH_LOG = path.join(REPO_ROOT, "web/content/reports/backup-health.jsonl");
const CRON_HEALTH = path.join(REPO_ROOT, "web/content/reports/cron-health.jsonl");

const log = (...m) => console.log("[db-offsite]", new Date().toISOString().slice(11, 19), ...m);

async function appendJsonl(file, row) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(row) + "\n");
}

async function telegram(title, detail) {
  const bot = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!bot || !chat) return;
  const text = `${title}\n⏰ ${new Date().toISOString()}\n🖥️ ${os.hostname()}\n${String(detail).slice(0, 400)}`;
  try {
    await fetch(`https://api.telegram.org/bot${bot}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, parse_mode: "Markdown", disable_web_page_preview: true }),
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    /* alerting must never mask the real failure */
  }
}

function hashFile(file, algo) {
  return new Promise((resolve, reject) => {
    const h = createHash(algo);
    createReadStream(file).on("data", (c) => h.update(c)).on("end", () => resolve(h.digest("hex"))).on("error", reject);
  });
}

async function newestBackup() {
  const names = (await fs.readdir(BACKUP_DIR)).filter((n) => /^db-\d{8}T\d{6}Z\.dump\.gz$/.test(n)).sort();
  if (names.length === 0) throw new Error(`no db-*.dump.gz in ${BACKUP_DIR}`);
  const name = names[names.length - 1];
  const file = path.join(BACKUP_DIR, name);
  const sidecar = `${file}.sha256`;
  const [stat, sidecarTxt] = await Promise.all([fs.stat(file), fs.readFile(sidecar, "utf8")]);
  const expected = sidecarTxt.trim().split(/\s+/)[0];
  const actual = await hashFile(file, "sha256");
  if (expected !== actual) throw new Error(`sha256 mismatch for ${name}: sidecar ${expected.slice(0, 12)} vs file ${actual.slice(0, 12)}`);
  return { name, file, sidecar, size: stat.size, sha256: actual };
}

function driveClient() {
  const rootFolderId = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!rootFolderId) throw new Error("GOOGLE_DRIVE_FOLDER_ID (or GOOGLE_DRIVE_SHARED_DRIVE_ID) not set");

  // A. founder-owned OAuth refresh token (no quota problem, no Workspace admin needed)
  const refresh = process.env.GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN;
  if (refresh && process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    const auth = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
    auth.setCredentials({ refresh_token: refresh });
    return { drive: google.drive({ version: "v3", auth }), rootFolderId, mode: "oauth-user" };
  }

  const client_email = process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL;
  const private_key = process.env.GOOGLE_DRIVE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!client_email || !private_key) {
    throw new Error("no Drive credentials: set GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN (+GOOGLE_CLIENT_ID/SECRET) or the GOOGLE_DRIVE_SERVICE_ACCOUNT_* pair");
  }
  const scopes = ["https://www.googleapis.com/auth/drive"];
  // B. domain-wide delegation
  const subject = process.env.GOOGLE_DRIVE_IMPERSONATE;
  if (subject) {
    const auth = new google.auth.JWT({ email: client_email, key: private_key, scopes, subject });
    return { drive: google.drive({ version: "v3", auth }), rootFolderId, mode: `impersonate:${subject}` };
  }
  // C. plain service account (Shared Drive only)
  const auth = new google.auth.GoogleAuth({ credentials: { client_email, private_key }, scopes });
  return { drive: google.drive({ version: "v3", auth }), rootFolderId, mode: "service-account" };
}

const q = (s) => s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
const ALL = { supportsAllDrives: true, includeItemsFromAllDrives: true };

async function ensureSubfolder(drive, rootFolderId) {
  const res = await drive.files.list({
    q: `name = '${q(SUBFOLDER)}' and '${rootFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id,name)",
    pageSize: 1,
    ...ALL,
  });
  if (res.data.files?.length) return res.data.files[0].id;
  if (DRY) { log(`dry: would create sub-folder ${SUBFOLDER}`); return null; }
  const created = await drive.files.create({
    requestBody: { name: SUBFOLDER, mimeType: "application/vnd.google-apps.folder", parents: [rootFolderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  log(`created sub-folder ${SUBFOLDER} (${created.data.id})`);
  return created.data.id;
}

async function listFolder(drive, folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: "nextPageToken, files(id,name,size,md5Checksum,createdTime,modifiedTime)",
      pageSize: 200,
      orderBy: "createdTime desc",
      pageToken,
      ...ALL,
    });
    files.push(...(res.data.files ?? []));
    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
  return files;
}

async function uploadOne(drive, folderId, existing, file, name, size, mimeType) {
  const dup = existing.find((f) => f.name === name && Number(f.size) === size);
  if (dup) {
    log(`skip ${name} — already in Drive (${dup.id})`);
    return dup.id;
  }
  if (DRY) {
    log(`dry: would upload ${name} (${size} bytes)`);
    return "(dry)";
  }
  const res = await drive.files.create({
    requestBody: { name, parents: [folderId] },
    media: { mimeType, body: createReadStream(file) },
    fields: "id,name,size,md5Checksum",
    supportsAllDrives: true,
  });
  log(`uploaded ${name} → ${res.data.id} (${res.data.size} bytes)`);
  return res.data.id;
}

async function prune(drive, files) {
  const cutoff = Date.now() - RETENTION_DAYS * 86400e3;
  const old = files.filter((f) => /^db-.*\.dump\.gz(\.sha256)?$/.test(f.name ?? "") && new Date(f.createdTime).getTime() < cutoff);
  for (const f of old) {
    if (DRY) { log(`dry: would delete ${f.name} (${f.createdTime})`); continue; }
    await drive.files.delete({ fileId: f.id, supportsAllDrives: true });
    log(`pruned ${f.name} (${f.createdTime})`);
  }
  return old.length;
}

const started = Date.now();
let backup = { name: "", size: 0, sha256: "" };
const result = { fileId: "", sidecarId: "", pruned: 0, listed: 0, md5_verified: false };
try {
  backup = await newestBackup();
  log(`newest backup ${backup.name} (${backup.size} bytes, sha256 ${backup.sha256.slice(0, 12)}…)`);

  const { drive, rootFolderId, mode } = driveClient();
  log(`auth mode ${mode}`);
  const folderId = await ensureSubfolder(drive, rootFolderId);
  let existing = folderId ? await listFolder(drive, folderId) : [];

  result.fileId = await uploadOne(drive, folderId, existing, backup.file, backup.name, backup.size, "application/gzip");
  const sidecarSize = (await fs.stat(backup.sidecar)).size;
  result.sidecarId = await uploadOne(drive, folderId, existing, backup.sidecar, `${backup.name}.sha256`, sidecarSize, "text/plain");

  result.pruned = await prune(drive, existing);

  // Verify by re-listing: the dump must be present with a matching md5.
  existing = folderId ? await listFolder(drive, folderId) : [];
  result.listed = existing.length;
  const remote = existing.find((f) => f.name === backup.name);
  if (!DRY) {
    if (!remote) throw new Error(`verify failed: ${backup.name} not present after re-list`);
    if (Number(remote.size) !== backup.size) throw new Error(`verify failed: size ${remote.size} != local ${backup.size}`);
    if (remote.md5Checksum) {
      const localMd5 = await hashFile(backup.file, "md5");
      if (localMd5 !== remote.md5Checksum) throw new Error(`verify failed: md5 ${remote.md5Checksum} != local ${localMd5}`);
      result.md5_verified = true;
    }
    result.fileId = remote.id;
  }

  console.log("\nDrive folder listing (blockid-db-backups/):");
  for (const f of existing) console.log(`  ${f.id}  ${String(f.size ?? "").padStart(10)}  ${f.createdTime}  ${f.name}`);

  const duration_ms = Date.now() - started;
  const row = {
    ts: new Date().toISOString(),
    job: "offsite",
    status: "ok",
    file: backup.file,
    sizeBytes: backup.size,
    sha256: backup.sha256,
    drive_file_id: result.fileId,
    drive_sidecar_id: result.sidecarId,
    drive_folder: SUBFOLDER,
    md5_verified: result.md5_verified,
    pruned: result.pruned,
    remote_count: result.listed,
    retention_days: RETENTION_DAYS,
    duration_ms,
    dry: DRY,
  };
  if (!DRY) {
    await appendJsonl(HEALTH_LOG, row);
    await appendJsonl(CRON_HEALTH, { ts: row.ts, endpoint: "db-backup-offsite", status: "ok", duration_ms, detail: `file=${backup.name} id=${result.fileId} pruned=${result.pruned}` });
  }
  log(`ok in ${duration_ms}ms — file id ${result.fileId}`);
} catch (err) {
  const duration_ms = Date.now() - started;
  // Never leak credentials: googleapis errors can embed request config.
  let msg = String(err?.message ?? err).replace(/Bearer [A-Za-z0-9._-]+/g, "Bearer [redacted]").slice(0, 500);
  if (/do not have storage quota/i.test(msg)) {
    msg = "Service account has no Drive quota — founder action: run scripts/db-backup-offsite-auth.mjs once (adds GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN) OR move the folder to a Shared Drive OR enable domain-wide delegation (GOOGLE_DRIVE_IMPERSONATE). See docs/runbooks/db-restore.md §Off-site.";
  }
  log(`FAILED: ${msg}`);
  const ts = new Date().toISOString();
  await appendJsonl(HEALTH_LOG, { ts, job: "offsite", status: "fail", file: backup.file ?? "", sizeBytes: backup.size, duration_ms, error: msg, dry: DRY }).catch(() => {});
  await appendJsonl(CRON_HEALTH, { ts, endpoint: "db-backup-offsite", status: "fail", duration_ms, detail: msg.slice(0, 300) }).catch(() => {});
  await telegram("🛑 *DB off-site copy FAILED*", `${backup.name || "(no backup)"}\n${msg}\nRunbook: docs/runbooks/db-restore.md`);
  process.exit(1);
}
