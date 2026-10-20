#!/usr/bin/env node
// BlockID.au — encrypted off-site copy of the newest DB backup to Google Cloud
// Storage (D30, approved 2026-10-20; replaces the Drive upload that failed
// 41/41 nights with "Service account has no Drive quota").
//
//   node scripts/db-backup-offsite-gcs.mjs [--dry] [--dir /data/backups] [--verify-remote]
//   node scripts/db-backup-offsite-gcs.mjs --verify-only        # weekly, from restore-drill.sh
//
// Upload mode (default; nightly 02:40 UTC via scripts/db-backup-offsite.mjs):
//   1. Newest /data/backups/db-*.dump.gz; its .sha256 sidecar is verified first.
//   2. Passphrase file ~/.config/blockid-backup/offsite.key (0600). Generated
//      once (32 random bytes, base64url) when absent. The founder MUST copy it
//      to a password manager: if the VM is lost, so is the key, and the
//      off-site copies cannot be decrypted. Its content is never printed/logged.
//   3. Client-side encryption (dumps hold personal data): gpg --symmetric
//      AES256, S2K SHA512, no compression (already gzip), throw-away GNUPGHOME,
//      no agent passphrase cache. Staged on disk (~/.cache/…), not tmpfs.
//   4. gcloud storage cp --no-clobber → gs://<bucket>/postgres/<dump>.gpg with
//      custom metadata sha256 (ciphertext), plain-sha256 (the .dump.gz),
//      source, enc. Idempotent: an object already carrying the same
//      plain-sha256 is not re-uploaded.
//   5. Verify: objects describe → size + md5 + sha256 metadata must match the
//      local ciphertext. --verify-remote additionally runs the full remote
//      restore check below on the just-uploaded object.
//   6. {job:"offsite", target:"gcs", …} → web/content/reports/backup-health.jsonl
//      + cron-health.jsonl; on failure the existing ops-alert path
//      (scripts/lib/ops-alert.sh: Telegram, e-mail fallback) fires at most once
//      per 20 h per error class (db-backup-offsite-alert.mjs debounce).
//
// --verify-only (weekly, Sun, appended to scripts/db/restore-drill.sh):
//   newest remote object → download → sha256 vs metadata → gpg decrypt →
//   sha256 of the plaintext vs plain-sha256 → gunzip | pg_restore -l (TOC
//   only, inside supabase-db; nothing is restored) → {job:"offsite-verify"}.
//
// Bucket (created 2026-10-20 as the VM's compute SA, project longcare-495115):
//   gs://blockid-au-backups-990415480608, australia-southeast1, uniform
//   bucket-level access, public access prevention enforced, no versioning,
//   lifecycle delete age > 35 d. Lifecycle owns remote retention; this job
//   never deletes remote objects and never touches /data/backups.
//
// Env overrides (tests / ops): OFFSITE_GCS_BUCKET, OFFSITE_GCS_PREFIX,
// OFFSITE_GCS_ACCOUNT ("" = gcloud's active account), OFFSITE_KEY_FILE,
// OFFSITE_STAGING_DIR, OFFSITE_GCLOUD_BIN, OFFSITE_GPG_BIN, OFFSITE_TOC_CMD,
// OFFSITE_HEALTH_LOG, OFFSITE_CRON_HEALTH, OFFSITE_ALERT_STATE_FILE,
// OFFSITE_ALERT_SCRIPT, BLOCKID_REPO_ROOT.

import { spawn } from "node:child_process";
import { createReadStream, createWriteStream, promises as fs } from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { createGunzip } from "node:zlib";
import { Transform, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { decideOffsiteAlert } from "./db-backup-offsite-alert.mjs";

export const DEFAULT_BUCKET = "gs://blockid-au-backups-990415480608";
export const DEFAULT_ACCOUNT = "990415480608-compute@developer.gserviceaccount.com";
export const REMOTE_RETENTION_DAYS = 35;
const DUMP_RE = /^db-\d{8}T\d{6}Z\.dump\.gz$/;

// ── pure helpers (unit-tested) ─────────────────────────────────────────────

export function parseArgs(argv) {
  const a = { dry: false, dir: "/data/backups", verifyRemote: false, verifyOnly: false };
  for (let i = 0; i < argv.length; i++) {
    const v = argv[i];
    if (v === "--dry" || v === "--dry-run") a.dry = true;
    else if (v === "--dir") a.dir = argv[++i];
    else if (v === "--verify-remote") a.verifyRemote = true;
    else if (v === "--verify-only") a.verifyOnly = true;
    else throw new Error(`unknown arg: ${v}`);
  }
  if (!a.dir) throw new Error("--dir needs a value");
  return a;
}

export function loadConfig(env = process.env) {
  const home = env.HOME || os.homedir();
  const root = env.BLOCKID_REPO_ROOT || "/home/dovanlong/blockid.au";
  const bucket = (env.OFFSITE_GCS_BUCKET || DEFAULT_BUCKET).replace(/\/+$/, "");
  if (!/^gs:\/\/[a-z0-9][a-z0-9._-]{1,220}$/.test(bucket)) throw new Error(`invalid OFFSITE_GCS_BUCKET ${bucket}`);
  let prefix = env.OFFSITE_GCS_PREFIX ?? "postgres/";
  if (prefix && !prefix.endsWith("/")) prefix += "/";
  return {
    root,
    bucket,
    prefix,
    account: env.OFFSITE_GCS_ACCOUNT ?? DEFAULT_ACCOUNT,
    keyFile: env.OFFSITE_KEY_FILE || path.join(home, ".config/blockid-backup/offsite.key"),
    stagingDir: env.OFFSITE_STAGING_DIR || path.join(home, ".cache/blockid-backup/offsite-staging"),
    gcloud: env.OFFSITE_GCLOUD_BIN || "gcloud",
    gpg: env.OFFSITE_GPG_BIN || "gpg",
    tocCmd: env.OFFSITE_TOC_CMD || "docker exec -i supabase-db pg_restore -l",
    healthLog: env.OFFSITE_HEALTH_LOG || path.join(root, "web/content/reports/backup-health.jsonl"),
    cronHealth: env.OFFSITE_CRON_HEALTH || path.join(root, "web/content/reports/cron-health.jsonl"),
    alertState: env.OFFSITE_ALERT_STATE_FILE || path.join(root, "web/content/reports/offsite-alert-state.json"),
    alertScript: env.OFFSITE_ALERT_SCRIPT || path.join(root, "scripts/lib/ops-alert.sh"),
  };
}

export const objectNameFor = (dumpName, prefix = "postgres/") => `${prefix}${dumpName}.gpg`;
export const objectUrl = (bucket, object) => `${bucket}/${object}`;

/** Coarse error class → debounce key + whether only the founder can fix it. */
export function classifyGcsError(message) {
  const m = String(message ?? "");
  if (/no db-.*\.dump\.gz|sha256 mismatch for db-|missing sidecar/i.test(m)) return "local_backup";
  if (/offsite key/i.test(m)) return "key";
  if (/AccessDenied|\b403\b|does not have storage\.|Permission .*denied|insufficient.*scope|not authorized|\b401\b|Reauthentication|credentials/i.test(m)) return "gcs_permission";
  if (/bucket .*not found|bucket does not exist|NoSuchBucket/i.test(m)) return "gcs_bucket_missing";
  if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|EAI_AGAIN|socket hang up|timed out|\b50[0-4]\b|ServiceUnavailable/i.test(m)) return "network";
  if (/^gpg|gpg (encrypt|decrypt)/i.test(m)) return "encrypt";
  if (/verify failed/i.test(m)) return "verify";
  return "other";
}

export function isFounderGcsClass(cls) {
  return cls === "gcs_permission" || cls === "gcs_bucket_missing";
}

export function founderCommandFor(cls, { bucket = DEFAULT_BUCKET, account = DEFAULT_ACCOUNT } = {}) {
  if (cls === "gcs_permission") {
    return `gcloud storage buckets add-iam-policy-binding ${bucket} --member=serviceAccount:${account} --role=roles/storage.objectAdmin  # run as a project Owner`;
  }
  if (cls === "gcs_bucket_missing") {
    return `gcloud storage buckets create ${bucket} --location=australia-southeast1 --uniform-bucket-level-access --public-access-prevention  # then set the 35-day lifecycle (docs/runbooks/db-restore.md § Off-site)`;
  }
  return null;
}

/** Fields merged into a {job:"offsite", status:"fail"} row. */
export function gcsFailureFields(cls, { alerted = false, suppressed = 0, bucket, account } = {}) {
  const founder = isFounderGcsClass(cls);
  const f = {
    target: "gcs",
    offsite_status: founder ? "founder_action_required" : "fail",
    error_class: cls,
    local_retention: "untouched",
    alerted: !!alerted,
    alerts_suppressed_since_last: suppressed,
  };
  if (founder) f.founder_command = founderCommandFor(cls, { bucket, account });
  return f;
}

/** Never let a token or key material reach a log line. */
export function redact(msg) {
  return String(msg ?? "")
    .replace(/Bearer [A-Za-z0-9._-]+/g, "Bearer [redacted]")
    .replace(/ya29\.[A-Za-z0-9._-]+/g, "[redacted-token]")
    .replace(/--passphrase[= ]\S+/g, "--passphrase [redacted]")
    .slice(0, 500);
}

/** Pick the newest object whose name looks like ours (lexicographic ts sort). */
export function pickNewestObject(objects, prefix = "postgres/") {
  const ours = (objects ?? []).filter((o) => typeof o?.name === "string" && o.name.startsWith(prefix) && DUMP_RE.test(o.name.slice(prefix.length).replace(/\.gpg$/, "")) && o.name.endsWith(".gpg"));
  ours.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return ours.length ? ours[ours.length - 1] : null;
}

/** Remote object vs local ciphertext. Returns a list of mismatch strings (empty = ok). */
export function compareRemote(remote, local) {
  const errs = [];
  if (!remote) return ["object not present"];
  if (Number(remote.size) !== local.size) errs.push(`size ${remote.size} != local ${local.size}`);
  if (remote.md5_hash && local.md5b64 && remote.md5_hash !== local.md5b64) errs.push(`md5 ${remote.md5_hash} != local ${local.md5b64}`);
  const meta = remote.custom_fields ?? {};
  if (meta.sha256 !== local.sha256) errs.push(`metadata sha256 ${String(meta.sha256).slice(0, 12)} != local ${local.sha256.slice(0, 12)}`);
  if (local.plainSha256 && meta["plain-sha256"] !== local.plainSha256) errs.push("metadata plain-sha256 mismatch");
  return errs;
}

/** Non-comment lines of `pg_restore -l` output = TOC entries. */
export function countTocEntries(text) {
  return String(text ?? "").split("\n").filter((l) => l.trim() && !l.startsWith(";")).length;
}

// ── side-effecting helpers ─────────────────────────────────────────────────

const log = (...m) => console.log("[db-offsite-gcs]", new Date().toISOString().slice(11, 19), ...m);

function run(cmd, args, { input, timeoutMs = 600_000, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "pipe", "pipe"], env: env ?? process.env });
    let out = "";
    let err = "";
    const t = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
    child.stdout.on("data", (c) => (out += c));
    child.stderr.on("data", (c) => (err += c));
    child.on("error", (e) => { clearTimeout(t); reject(e); });
    child.on("close", (code, sig) => {
      clearTimeout(t);
      resolve({ code: sig ? 128 : code, out, err });
    });
    if (input != null) child.stdin.end(input);
    else child.stdin.end();
  });
}

function hashFile(file) {
  return new Promise((resolve, reject) => {
    const s = createHash("sha256");
    const m = createHash("md5");
    let size = 0;
    createReadStream(file)
      .on("data", (c) => { s.update(c); m.update(c); size += c.length; })
      .on("end", () => resolve({ sha256: s.digest("hex"), md5b64: m.digest("base64"), size }))
      .on("error", reject);
  });
}

async function appendJsonl(file, row) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(row) + "\n");
}

async function newestBackup(dir) {
  const names = (await fs.readdir(dir)).filter((n) => DUMP_RE.test(n)).sort();
  if (names.length === 0) throw new Error(`no db-*.dump.gz in ${dir}`);
  const name = names[names.length - 1];
  const file = path.join(dir, name);
  let sidecarTxt;
  try { sidecarTxt = await fs.readFile(`${file}.sha256`, "utf8"); } catch { throw new Error(`missing sidecar ${name}.sha256`); }
  const expected = sidecarTxt.trim().split(/\s+/)[0];
  const h = await hashFile(file);
  if (expected !== h.sha256) throw new Error(`sha256 mismatch for ${name}: sidecar ${expected.slice(0, 12)} vs file ${h.sha256.slice(0, 12)}`);
  return { name, file, size: h.size, sha256: h.sha256 };
}

/** Returns { generated } — creates the key (0600, dir 0700) only when absent and not dry. */
export async function ensureKey(keyFile, { dry = false } = {}) {
  let st = null;
  try { st = await fs.stat(keyFile); } catch { /* absent */ }
  if (st) {
    if ((st.mode & 0o077) !== 0) throw new Error(`offsite key ${keyFile} is group/other-accessible (mode ${(st.mode & 0o777).toString(8)}) — chmod 600 it`);
    if (st.size < 32) throw new Error(`offsite key ${keyFile} is too short (${st.size} bytes)`);
    return { generated: false };
  }
  if (dry) return { generated: false, wouldGenerate: true };
  await fs.mkdir(path.dirname(keyFile), { recursive: true, mode: 0o700 });
  await fs.chmod(path.dirname(keyFile), 0o700);
  // 'wx' = never overwrite a key that appeared concurrently.
  await fs.writeFile(keyFile, randomBytes(32).toString("base64url"), { mode: 0o600, flag: "wx" });
  return { generated: true };
}

async function withGnupgHome(stagingDir, fn) {
  const home = await fs.mkdtemp(path.join(stagingDir, "gnupg-"));
  await fs.chmod(home, 0o700);
  try {
    return await fn(home);
  } finally {
    await run("gpgconf", ["--homedir", home, "--kill", "gpg-agent"], { timeoutMs: 10_000 }).catch(() => {});
    await fs.rm(home, { recursive: true, force: true }).catch(() => {});
  }
}

const gpgBase = (home, keyFile) => ["--homedir", home, "--batch", "--quiet", "--yes", "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-file", keyFile];

async function encrypt(cfg, src, dst) {
  return withGnupgHome(cfg.stagingDir, async (home) => {
    const r = await run(cfg.gpg, [...gpgBase(home, cfg.keyFile), "--symmetric", "--cipher-algo", "AES256", "--s2k-digest-algo", "SHA512", "--compress-algo", "none", "--output", dst, src]);
    if (r.code !== 0) throw new Error(`gpg encrypt exit ${r.code}: ${redact(r.err)}`);
  });
}

function gcloudArgs(cfg, args) {
  return [...(cfg.account ? [`--account=${cfg.account}`] : []), "--quiet", ...args];
}

const gcloudEnv = () => ({ ...process.env, CLOUDSDK_CORE_DISABLE_PROMPTS: "1", CLOUDSDK_STORAGE_PARALLEL_COMPOSITE_UPLOAD_ENABLED: "False" });

async function gcloud(cfg, args, opts = {}) {
  return run(cfg.gcloud, gcloudArgs(cfg, args), { env: gcloudEnv(), ...opts });
}

async function describe(cfg, object) {
  const r = await gcloud(cfg, ["storage", "objects", "describe", objectUrl(cfg.bucket, object), "--format=json"], { timeoutMs: 120_000 });
  if (r.code === 0) return JSON.parse(r.out);
  if (/not found: 404|No URLs matched/i.test(r.err) && !/bucket/i.test(r.err.replace(cfg.bucket, ""))) return null;
  throw new Error(`gcloud describe exit ${r.code}: ${redact(r.err)}`);
}

/**
 * Download → sha256 vs metadata → decrypt (stream) → plaintext sha256 vs
 * plain-sha256 → gunzip | TOC cmd. Nothing is restored.
 */
export async function verifyRemoteObject(cfg, object, { remote } = {}) {
  const meta = remote ?? (await describe(cfg, object));
  if (!meta) throw new Error(`verify failed: ${object} not present`);
  const fields = meta.custom_fields ?? {};
  const work = await fs.mkdtemp(path.join(cfg.stagingDir, "verify-"));
  try {
    const local = path.join(work, path.basename(object));
    const dl = await gcloud(cfg, ["storage", "cp", objectUrl(cfg.bucket, object), local]);
    if (dl.code !== 0) throw new Error(`gcloud download exit ${dl.code}: ${redact(dl.err)}`);
    const enc = await hashFile(local);
    if (enc.sha256 !== fields.sha256) throw new Error(`verify failed: downloaded sha256 ${enc.sha256.slice(0, 12)} != metadata ${String(fields.sha256).slice(0, 12)}`);

    const { plainSha256, toc, tocExit } = await withGnupgHome(cfg.stagingDir, async (home) => {
      const gpg = spawn(cfg.gpg, [...gpgBase(home, cfg.keyFile), "--decrypt", "--output", "-", local], { stdio: ["ignore", "pipe", "pipe"] });
      let gpgErr = "";
      gpg.stderr.on("data", (c) => (gpgErr += c));
      const gpgDone = new Promise((res) => gpg.on("close", (code) => res(code)));

      const tocChild = spawn("sh", ["-c", cfg.tocCmd], { stdio: ["pipe", "pipe", "pipe"] });
      let tocOut = "";
      let tocErr = "";
      tocChild.stdout.on("data", (c) => (tocOut += c));
      tocChild.stderr.on("data", (c) => (tocErr += c));
      const tocDone = new Promise((res) => tocChild.on("close", (code) => res(code)));

      const h = createHash("sha256");
      const hasher = new Transform({ transform(c, _e, cb) { h.update(c); cb(null, c); } });
      const gunzip = createGunzip();
      // pg_restore -l stops reading after the TOC: on EPIPE keep draining so
      // the plaintext hash still covers every byte.
      let tocClosed = false;
      const detach = () => { if (tocClosed) return; tocClosed = true; gunzip.unpipe(tocChild.stdin); gunzip.resume(); };
      tocChild.stdin.on("error", detach);
      tocChild.stdin.on("close", detach);
      gunzip.pipe(tocChild.stdin);
      let gunzipErr = null;
      let pendingCb = null;
      const release = () => { const cb = pendingCb; pendingCb = null; if (cb) cb(); };
      gunzip.on("error", (e) => { gunzipErr = e; detach(); tocChild.stdin.end(); release(); });
      gunzip.on("drain", release);
      const feed = new Writable({
        write(c, _e, cb) {
          if (gunzipErr) return cb();
          if (gunzip.write(c)) return cb();
          pendingCb = cb; // backpressure: wait for gunzip (→ pg_restore) to drain
        },
        final(cb) { if (!gunzipErr) gunzip.end(); cb(); },
      });
      const killer = setTimeout(() => { gpg.kill("SIGKILL"); tocChild.kill("SIGKILL"); }, 20 * 60_000);
      killer.unref();
      await pipeline(gpg.stdout, hasher, feed);
      const gpgCode = await gpgDone;
      clearTimeout(killer);
      if (gpgCode !== 0) tocChild.kill("SIGTERM"); // never wait on a TOC reader fed by a failed decrypt
      const tocCode = await tocDone;
      if (gpgCode !== 0) throw new Error(`gpg decrypt exit ${gpgCode}: ${redact(gpgErr)}`);
      if (gunzipErr && !tocClosed) throw new Error(`verify failed: gunzip ${gunzipErr.message}`);
      return { plainSha256: h.digest("hex"), toc: tocOut, tocExit: tocCode, tocErr };
    });
    if (fields["plain-sha256"] && plainSha256 !== fields["plain-sha256"]) throw new Error(`verify failed: decrypted sha256 ${plainSha256.slice(0, 12)} != plain-sha256 ${String(fields["plain-sha256"]).slice(0, 12)}`);
    const entries = countTocEntries(toc);
    if (tocExit !== 0 || entries === 0) throw new Error(`verify failed: pg_restore -l exit ${tocExit}, ${entries} TOC entries`);
    return { object, encSize: enc.size, encSha256: enc.sha256, plainSha256, tocEntries: entries };
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}

async function readState(file) {
  try { return JSON.parse(await fs.readFile(file, "utf8")); } catch { return null; }
}

function opsAlert(cfg, title, detail) {
  // Same path as the shell jobs: Telegram, e-mail fallback; token never logged.
  return run("bash", ["-c", '. "$1"; ops_alert "$2" "$3"', "ops-alert", cfg.alertScript, title, detail], {
    timeoutMs: 60_000,
    env: { ...process.env, OPS_REPO_ROOT: cfg.root },
  }).catch(() => {});
}

// ── modes ──────────────────────────────────────────────────────────────────

async function uploadMode(cfg, args) {
  const started = Date.now();
  let backup = { name: "", file: "", size: 0, sha256: "" };
  const object = () => objectNameFor(backup.name, cfg.prefix);
  let staged = null;
  try {
    backup = await newestBackup(args.dir);
    log(`newest backup ${backup.name} (${backup.size} bytes, sha256 ${backup.sha256.slice(0, 12)}…)`);
    const key = await ensureKey(cfg.keyFile, { dry: args.dry });
    if (key.generated) log(`generated NEW offsite key at ${cfg.keyFile} (0600) — founder must copy it to a password manager`);
    if (key.wouldGenerate) log(`dry: would generate offsite key at ${cfg.keyFile}`);
    log(`target ${objectUrl(cfg.bucket, object())} (account ${cfg.account || "gcloud active"})`);

    let remote = await describe(cfg, object());
    let uploaded = false;
    let local = null;
    if (remote && remote.custom_fields?.["plain-sha256"] === backup.sha256) {
      log(`already present with matching plain-sha256 — not re-uploading`);
    } else if (remote) {
      throw new Error(`verify failed: ${object()} exists with a different plain-sha256 — refusing to overwrite`);
    } else if (args.dry) {
      log(`dry: would encrypt + upload ${backup.name} → ${object()}`);
    } else {
      await fs.mkdir(cfg.stagingDir, { recursive: true, mode: 0o700 });
      staged = path.join(cfg.stagingDir, `${backup.name}.gpg.partial`);
      await fs.rm(staged, { force: true });
      await encrypt(cfg, backup.file, staged);
      local = { ...(await hashFile(staged)), plainSha256: backup.sha256 };
      log(`encrypted ${local.size} bytes, sha256 ${local.sha256.slice(0, 12)}…`);
      const meta = `sha256=${local.sha256},plain-sha256=${backup.sha256},source=${backup.name},enc=gpg-aes256`;
      const r = await gcloud(cfg, ["storage", "cp", "--no-clobber", "--content-type=application/pgp-encrypted", `--custom-metadata=${meta}`, staged, objectUrl(cfg.bucket, object())]);
      if (r.code !== 0) throw new Error(`gcloud upload exit ${r.code}: ${redact(r.err)}`);
      uploaded = true;
      remote = await describe(cfg, object());
      const errs = compareRemote(remote, local);
      if (errs.length) throw new Error(`verify failed: ${errs.join("; ")}`);
      log(`uploaded + verified (size, md5, sha256 metadata)`);
    }

    let restoreCheck = null;
    if (args.verifyRemote && !args.dry) {
      restoreCheck = await verifyRemoteObject(cfg, object());
      log(`remote restore check ok — decrypted sha256 matches, ${restoreCheck.tocEntries} TOC entries`);
    }

    const duration_ms = Date.now() - started;
    const row = {
      ts: new Date().toISOString(),
      job: "offsite",
      status: "ok",
      target: "gcs",
      file: backup.file,
      sizeBytes: backup.size,
      sha256: backup.sha256,
      gcs_bucket: cfg.bucket,
      gcs_object: object(),
      enc: "gpg-aes256",
      enc_size: Number(remote?.size ?? 0),
      enc_sha256: remote?.custom_fields?.sha256 ?? "",
      uploaded,
      remote_verified: !args.dry,
      restore_verified: !!restoreCheck,
      ...(restoreCheck ? { toc_entries: restoreCheck.tocEntries } : {}),
      key_generated: !!key.generated,
      retention_days: REMOTE_RETENTION_DAYS,
      duration_ms,
      dry: args.dry,
      offsite_status: "ok",
    };
    if (!args.dry) {
      await appendJsonl(cfg.healthLog, row);
      await fs.rm(cfg.alertState, { force: true }).catch(() => {});
      await appendJsonl(cfg.cronHealth, { ts: row.ts, endpoint: "db-backup-offsite", status: "ok", duration_ms, detail: `gcs ${row.gcs_object} uploaded=${uploaded}${restoreCheck ? ` toc=${restoreCheck.tocEntries}` : ""}` });
      if (key.generated) {
        await opsAlert(cfg, "🔑 *Off-site backup key generated*", `A new encryption key was created at ${cfg.keyFile} on the VM.\nCopy it into the password manager NOW — without it the GCS backups cannot be decrypted if the VM is lost.`);
      }
    }
    log(`ok in ${duration_ms}ms`);
    return 0;
  } catch (err) {
    const duration_ms = Date.now() - started;
    const msg = redact(err?.message ?? err);
    log(`FAILED: ${msg}`);
    const cls = classifyGcsError(msg);
    const decision = args.dry ? { alert: false, reason: "dry", next: null } : decideOffsiteAlert(await readState(cfg.alertState), `gcs:${cls}`);
    const fields = gcsFailureFields(cls, { alerted: decision.alert, suppressed: decision.next?.suppressed ?? 0, bucket: cfg.bucket, account: cfg.account || DEFAULT_ACCOUNT });
    if (!args.dry) {
      const ts = new Date().toISOString();
      await appendJsonl(cfg.healthLog, { ts, job: "offsite", status: "fail", file: backup.file, sizeBytes: backup.size, gcs_bucket: cfg.bucket, gcs_object: backup.name ? object() : "", duration_ms, error: msg, dry: false, ...fields }).catch(() => {});
      await appendJsonl(cfg.cronHealth, { ts, endpoint: "db-backup-offsite", status: "fail", duration_ms, detail: `[${fields.offsite_status}] ${msg}`.slice(0, 300) }).catch(() => {});
      if (decision.next) {
        await fs.mkdir(path.dirname(cfg.alertState), { recursive: true }).catch(() => {});
        await fs.writeFile(cfg.alertState, JSON.stringify(decision.next) + "\n").catch(() => {});
      }
      if (decision.alert) {
        const founder = fields.founder_command ? `\nFounder: ${fields.founder_command}` : "";
        await opsAlert(cfg, "🛑 *DB off-site copy (GCS) FAILED*", `${backup.name || "(no backup)"}\n${msg}${founder}\nNext alert for this class in ~20 h.\nRunbook: docs/runbooks/db-restore.md § Off-site`);
      } else {
        log(`alert suppressed (${decision.reason}, class ${cls})`);
      }
    }
    return 1;
  } finally {
    if (staged) await fs.rm(staged, { force: true }).catch(() => {});
  }
}

async function verifyOnlyMode(cfg, args) {
  const started = Date.now();
  let object = "";
  try {
    await ensureKey(cfg.keyFile, { dry: true }).then((k) => { if (k.wouldGenerate) throw new Error(`offsite key ${cfg.keyFile} missing — cannot decrypt`); });
    const r = await gcloud(cfg, ["storage", "objects", "list", `${cfg.bucket}/${cfg.prefix}**`, "--format=json(name,size,custom_fields)"], { timeoutMs: 120_000 });
    if (r.code !== 0) throw new Error(`gcloud list exit ${r.code}: ${redact(r.err)}`);
    const newest = pickNewestObject(JSON.parse(r.out || "[]"), cfg.prefix);
    if (!newest) throw new Error(`verify failed: no objects under ${cfg.bucket}/${cfg.prefix}`);
    object = newest.name;
    if (args.dry) { log(`dry: would download + decrypt + pg_restore -l ${object}`); return 0; }
    await fs.mkdir(cfg.stagingDir, { recursive: true, mode: 0o700 });
    const v = await verifyRemoteObject(cfg, object);
    const duration_ms = Date.now() - started;
    const ts = new Date().toISOString();
    await appendJsonl(cfg.healthLog, { ts, job: "offsite-verify", status: "ok", target: "gcs", gcs_bucket: cfg.bucket, gcs_object: object, enc_size: v.encSize, plain_sha256: v.plainSha256, toc_entries: v.tocEntries, duration_ms });
    await appendJsonl(cfg.cronHealth, { ts, endpoint: "db-offsite-verify", status: "ok", duration_ms, detail: `${object} toc=${v.tocEntries}` });
    log(`ok — ${object} downloaded, decrypted (sha256 matches), ${v.tocEntries} TOC entries, ${duration_ms}ms`);
    return 0;
  } catch (err) {
    const duration_ms = Date.now() - started;
    const msg = redact(err?.message ?? err);
    log(`FAILED: ${msg}`);
    if (!args.dry) {
      const ts = new Date().toISOString();
      const cls = classifyGcsError(msg);
      await appendJsonl(cfg.healthLog, { ts, job: "offsite-verify", status: "fail", target: "gcs", gcs_bucket: cfg.bucket, gcs_object: object, error_class: cls, duration_ms, error: msg }).catch(() => {});
      await appendJsonl(cfg.cronHealth, { ts, endpoint: "db-offsite-verify", status: "fail", duration_ms, detail: msg.slice(0, 300) }).catch(() => {});
      // Weekly job → alerting every failure is already ≤ 1/day.
      await opsAlert(cfg, "🛑 *Off-site backup restore check FAILED*", `${object || "(no object)"}\n${msg}\nRunbook: docs/runbooks/db-restore.md § Off-site`);
    }
    return 1;
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  let args;
  let cfg;
  try {
    args = parseArgs(argv);
    cfg = loadConfig(env);
  } catch (e) {
    console.error(`[db-offsite-gcs] ${e.message}`);
    return 2;
  }
  return args.verifyOnly ? verifyOnlyMode(cfg, args) : uploadMode(cfg, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.exitCode = await main();
}
