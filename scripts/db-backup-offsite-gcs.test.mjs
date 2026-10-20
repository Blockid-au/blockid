// Tests for the D30 GCS off-site backup (scripts/db-backup-offsite-gcs.mjs):
// pure helpers + an end-to-end run against a fake `gcloud` (OFFSITE_GCLOUD_BIN)
// backed by a temp directory, with real gpg encryption and a fake TOC command.

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyGcsError,
  compareRemote,
  countTocEntries,
  founderCommandFor,
  gcsFailureFields,
  isFounderGcsClass,
  loadConfig,
  objectNameFor,
  parseArgs,
  pickNewestObject,
  redact,
} from "./db-backup-offsite-gcs.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, "db-backup-offsite-gcs.mjs");
const DISPATCH = path.join(HERE, "db-backup-offsite.mjs");

describe("pure helpers", () => {
  it("parseArgs", () => {
    expect(parseArgs([])).toEqual({ dry: false, dir: "/data/backups", verifyRemote: false, verifyOnly: false });
    expect(parseArgs(["--dry", "--dir", "/x", "--verify-remote"])).toMatchObject({ dry: true, dir: "/x", verifyRemote: true });
    expect(parseArgs(["--verify-only"]).verifyOnly).toBe(true);
    expect(() => parseArgs(["--nope"])).toThrow(/unknown arg/);
  });

  it("loadConfig defaults + validation", () => {
    const c = loadConfig({ HOME: "/home/u" });
    expect(c.bucket).toBe("gs://blockid-au-backups-990415480608");
    expect(c.prefix).toBe("postgres/");
    expect(c.keyFile).toBe("/home/u/.config/blockid-backup/offsite.key");
    expect(c.account).toBe("990415480608-compute@developer.gserviceaccount.com");
    expect(loadConfig({ HOME: "/h", OFFSITE_GCS_ACCOUNT: "" }).account).toBe("");
    expect(loadConfig({ HOME: "/h", OFFSITE_GCS_PREFIX: "x" }).prefix).toBe("x/");
    expect(() => loadConfig({ HOME: "/h", OFFSITE_GCS_BUCKET: "s3://nope" })).toThrow(/invalid/);
  });

  it("objectNameFor", () => {
    expect(objectNameFor("db-20261020T022001Z.dump.gz")).toBe("postgres/db-20261020T022001Z.dump.gz.gpg");
  });

  it("classifyGcsError + founder classes", () => {
    expect(classifyGcsError("AccessDeniedException: 403 x does not have storage.objects.create access")).toBe("gcs_permission");
    expect(classifyGcsError("Request had insufficient authentication scopes")).toBe("gcs_permission");
    expect(classifyGcsError("NoSuchBucket")).toBe("gcs_bucket_missing");
    expect(classifyGcsError("no db-*.dump.gz in /data/backups")).toBe("local_backup");
    expect(classifyGcsError("sha256 mismatch for db-x.dump.gz: sidecar a vs file b")).toBe("local_backup");
    expect(classifyGcsError("offsite key /k is group/other-accessible")).toBe("key");
    expect(classifyGcsError("gpg encrypt exit 2: boom")).toBe("encrypt");
    expect(classifyGcsError("verify failed: size 1 != local 2")).toBe("verify");
    expect(classifyGcsError("getaddrinfo EAI_AGAIN storage.googleapis.com")).toBe("network");
    expect(classifyGcsError("weird")).toBe("other");
    expect(isFounderGcsClass("gcs_permission")).toBe(true);
    expect(isFounderGcsClass("network")).toBe(false);
    expect(founderCommandFor("gcs_permission")).toMatch(/add-iam-policy-binding gs:\/\/blockid-au-backups-990415480608 .*roles\/storage\.objectAdmin/);
    expect(founderCommandFor("network")).toBeNull();
  });

  it("gcsFailureFields", () => {
    const f = gcsFailureFields("gcs_permission", { alerted: true });
    expect(f).toMatchObject({ target: "gcs", offsite_status: "founder_action_required", error_class: "gcs_permission", local_retention: "untouched", alerted: true });
    expect(f.founder_command).toMatch(/gcloud storage buckets/);
    const g = gcsFailureFields("network", { suppressed: 3 });
    expect(g).toMatchObject({ offsite_status: "fail", alerted: false, alerts_suppressed_since_last: 3 });
    expect(g.founder_command).toBeUndefined();
  });

  it("redact strips tokens", () => {
    expect(redact("Authorization: Bearer abc.def-ghi")).toBe("Authorization: Bearer [redacted]");
    expect(redact("token ya29.A0ARrdaM-xyz end")).toBe("token [redacted-token] end");
    expect(redact("x".repeat(900)).length).toBe(500);
  });

  it("pickNewestObject ignores foreign names", () => {
    const objs = [
      { name: "postgres/db-20261019T022001Z.dump.gz.gpg" },
      { name: "postgres/db-20261020T022001Z.dump.gz.gpg" },
      { name: "postgres/zzz.txt" },
      { name: "other/db-20261021T022001Z.dump.gz.gpg" },
    ];
    expect(pickNewestObject(objs).name).toBe("postgres/db-20261020T022001Z.dump.gz.gpg");
    expect(pickNewestObject([])).toBeNull();
  });

  it("compareRemote", () => {
    const local = { size: 10, md5b64: "m", sha256: "a".repeat(64), plainSha256: "p" };
    const ok = { size: "10", md5_hash: "m", custom_fields: { sha256: "a".repeat(64), "plain-sha256": "p" } };
    expect(compareRemote(ok, local)).toEqual([]);
    expect(compareRemote(null, local)).toEqual(["object not present"]);
    expect(compareRemote({ ...ok, size: 9 }, local)[0]).toMatch(/size 9 != local 10/);
    expect(compareRemote({ ...ok, md5_hash: "x" }, local)[0]).toMatch(/md5/);
    expect(compareRemote({ ...ok, custom_fields: { sha256: "b" } }, local).length).toBe(2);
  });

  it("countTocEntries skips pg_restore comment lines", () => {
    expect(countTocEntries(";\n; Archive created\n;\n3; 2615 16 SCHEMA - x\n4; 0 0 TABLE y\n")).toBe(2);
    expect(countTocEntries("")).toBe(0);
  });
});

// ── end-to-end with a fake gcloud ───────────────────────────────────────────

const FAKE_GCLOUD = `#!/usr/bin/env node
const fs = require("fs"), path = require("path");
const root = process.env.FAKE_GCS;
const a = process.argv.slice(2).filter((x) => !x.startsWith("--account=") && x !== "--quiet");
const local = (u) => path.join(root, u.replace(/^gs:\\/\\/[^/]+\\//, ""));
const metaOf = (f) => { try { return JSON.parse(fs.readFileSync(f + ".__meta.json", "utf8")); } catch { return {}; } };
const crypto = require("crypto");
const desc = (u) => { const f = local(u); const b = fs.readFileSync(f); return { name: u.replace(/^gs:\\/\\/[^/]+\\//, ""), size: b.length, md5_hash: crypto.createHash("md5").update(b).digest("base64"), custom_fields: metaOf(f) }; };
if (a[0] === "storage" && a[1] === "objects" && a[2] === "describe") {
  if (!fs.existsSync(local(a[3]))) { console.error("ERROR: (gcloud.storage.objects.describe) " + a[3] + " not found: 404."); process.exit(1); }
  console.log(JSON.stringify(desc(a[3]))); process.exit(0);
}
if (a[0] === "storage" && a[1] === "objects" && a[2] === "list") {
  const out = [];
  const walk = (d) => { for (const n of fs.existsSync(d) ? fs.readdirSync(d) : []) { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (!n.endsWith(".__meta.json")) out.push(desc("gs://b/" + path.relative(root, p))); } };
  walk(root); console.log(JSON.stringify(out)); process.exit(0);
}
if (a[0] === "storage" && a[1] === "cp") {
  const pos = a.slice(2).filter((x) => !x.startsWith("--"));
  const meta = a.find((x) => x.startsWith("--custom-metadata="));
  const [src, dst] = pos;
  if (dst.startsWith("gs://")) {
    if (process.env.FAKE_GCS_FAIL === "upload") { console.error("AccessDeniedException: 403 sa does not have storage.objects.create access"); process.exit(1); }
    const f = local(dst);
    if (a.includes("--no-clobber") && fs.existsSync(f)) process.exit(0);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.copyFileSync(src, f);
    const m = {}; if (meta) for (const kv of meta.slice(18).split(",")) { const i = kv.indexOf("="); m[kv.slice(0, i)] = kv.slice(i + 1); }
    fs.writeFileSync(f + ".__meta.json", JSON.stringify(m));
  } else {
    fs.copyFileSync(local(src), dst);
  }
  process.exit(0);
}
console.error("fake gcloud: unsupported " + a.join(" ")); process.exit(2);
`;

const FAKE_ALERT = `ops_alert() { printf '%s|%s\\n' "$1" "$2" | head -c 300 >> "$ALERT_LOG"; echo >> "$ALERT_LOG"; }\n`;

const hasGpg = spawnSync("gpg", ["--version"]).status === 0;

describe.skipIf(!hasGpg)("end-to-end (fake gcloud, real gpg)", () => {
  let tmp;
  let env;
  const DUMP = "db-20261020T022001Z.dump.gz";
  const TOC = ";\n; Archive created at x\n;\n3; 2615 16 SCHEMA - public\n4; 1259 1 TABLE public app_users\n5; 1259 2 TABLE public projects\n";

  const runScript = (args, extra = {}, script = SCRIPT) =>
    spawnSync(process.execPath, [script, ...args], { env: { ...env, ...extra }, encoding: "utf8", timeout: 60_000 });
  const rows = () => (fs.existsSync(env.OFFSITE_HEALTH_LOG) ? fs.readFileSync(env.OFFSITE_HEALTH_LOG, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);
  const alerts = () => (fs.existsSync(env.ALERT_LOG) ? fs.readFileSync(env.ALERT_LOG, "utf8").split("\n").filter((l) => l.includes("|")) : []);

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "offsite-gcs-test-"));
    const backups = path.join(tmp, "backups");
    fs.mkdirSync(backups);
    const dump = gzipSync(Buffer.from(TOC + ";" + "x".repeat(5000) + "\n"));
    fs.writeFileSync(path.join(backups, DUMP), dump);
    fs.writeFileSync(path.join(backups, `${DUMP}.sha256`), `${createHash("sha256").update(dump).digest("hex")}  ${DUMP}\n`);
    fs.writeFileSync(path.join(backups, "db-20261019T022001Z.dump.gz"), "older"); // older, no sidecar: must be ignored
    const gcloud = path.join(tmp, "gcloud");
    fs.writeFileSync(gcloud, FAKE_GCLOUD, { mode: 0o755 });
    fs.writeFileSync(path.join(tmp, "ops-alert.sh"), FAKE_ALERT);
    fs.mkdirSync(path.join(tmp, "gcs"));
    env = {
      PATH: process.env.PATH,
      HOME: tmp,
      FAKE_GCS: path.join(tmp, "gcs"),
      ALERT_LOG: path.join(tmp, "alerts.log"),
      BLOCKID_REPO_ROOT: tmp,
      OFFSITE_GCLOUD_BIN: gcloud,
      OFFSITE_GCS_BUCKET: "gs://test-bucket",
      OFFSITE_KEY_FILE: path.join(tmp, "cfg", "offsite.key"),
      OFFSITE_STAGING_DIR: path.join(tmp, "staging"),
      OFFSITE_TOC_CMD: "cat",
      OFFSITE_HEALTH_LOG: path.join(tmp, "backup-health.jsonl"),
      OFFSITE_CRON_HEALTH: path.join(tmp, "cron-health.jsonl"),
      OFFSITE_ALERT_STATE_FILE: path.join(tmp, "alert-state.json"),
      OFFSITE_ALERT_SCRIPT: path.join(tmp, "ops-alert.sh"),
    };
    env.DIR_ARGS = backups;
  });
  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("uploads encrypted, verifies, is idempotent, and the weekly check decrypts + lists the TOC", () => {
    const r1 = runScript(["--dir", env.DIR_ARGS, "--verify-remote"]);
    expect(r1.status, r1.stdout + r1.stderr).toBe(0);
    const key = fs.statSync(env.OFFSITE_KEY_FILE);
    expect(key.mode & 0o777).toBe(0o600);
    expect(r1.stdout).not.toContain(fs.readFileSync(env.OFFSITE_KEY_FILE, "utf8")); // key never printed
    const obj = path.join(env.FAKE_GCS, "postgres", `${DUMP}.gpg`);
    expect(fs.existsSync(obj)).toBe(true);
    // ciphertext ≠ plaintext and carries no gzip magic
    expect(fs.readFileSync(obj).subarray(0, 2).toString("hex")).not.toBe("1f8b");
    const [row] = rows();
    expect(row).toMatchObject({ job: "offsite", status: "ok", target: "gcs", offsite_status: "ok", uploaded: true, remote_verified: true, restore_verified: true, toc_entries: 3, key_generated: true, gcs_object: `postgres/${DUMP}.gpg`, retention_days: 35 });
    expect(alerts().filter((l) => l.includes("key generated"))).toHaveLength(1);
    expect(fs.readdirSync(env.OFFSITE_STAGING_DIR)).toEqual([]); // staging cleaned

    const r2 = runScript(["--dir", env.DIR_ARGS]);
    expect(r2.status, r2.stdout + r2.stderr).toBe(0);
    expect(rows()[1]).toMatchObject({ status: "ok", uploaded: false, key_generated: false });
    expect(alerts().filter((l) => l.includes("key generated"))).toHaveLength(1);

    const v = runScript(["--verify-only"]);
    expect(v.status, v.stdout + v.stderr).toBe(0);
    expect(rows()[2]).toMatchObject({ job: "offsite-verify", status: "ok", toc_entries: 3 });
  });

  it("the existing entry point dispatches to GCS by default", () => {
    const r = runScript(["--dir", env.DIR_ARGS], {}, DISPATCH);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(rows()[0]).toMatchObject({ job: "offsite", status: "ok", target: "gcs" });
  });

  it("--dry writes nothing and creates no key", () => {
    const r = runScript(["--dir", env.DIR_ARGS, "--dry"]);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(fs.existsSync(env.OFFSITE_KEY_FILE)).toBe(false);
    expect(rows()).toEqual([]);
    expect(fs.readdirSync(env.FAKE_GCS)).toEqual([]);
  });

  it("permission failure → founder_action_required row, alert once, then debounced", () => {
    const r1 = runScript(["--dir", env.DIR_ARGS], { FAKE_GCS_FAIL: "upload" });
    expect(r1.status).toBe(1);
    const r2 = runScript(["--dir", env.DIR_ARGS], { FAKE_GCS_FAIL: "upload" });
    expect(r2.status).toBe(1);
    const [a, b] = rows();
    expect(a).toMatchObject({ job: "offsite", status: "fail", target: "gcs", offsite_status: "founder_action_required", error_class: "gcs_permission", alerted: true, local_retention: "untouched" });
    expect(a.founder_command).toMatch(/add-iam-policy-binding gs:\/\/test-bucket/);
    expect(b).toMatchObject({ alerted: false, alerts_suppressed_since_last: 1 });
    expect(alerts().filter((l) => l.includes("FAILED"))).toHaveLength(1);
    expect(fs.readdirSync(env.OFFSITE_STAGING_DIR).filter((n) => n.endsWith(".partial"))).toEqual([]);
  });

  it("weekly check catches a tampered object and a wrong key", () => {
    expect(runScript(["--dir", env.DIR_ARGS]).status).toBe(0);
    const obj = path.join(env.FAKE_GCS, "postgres", `${DUMP}.gpg`);
    const good = fs.readFileSync(obj);

    const bad = Buffer.from(good);
    bad[bad.length - 5] ^= 0xff;
    fs.writeFileSync(obj, bad);
    const t = runScript(["--verify-only"]);
    expect(t.status).toBe(1);
    expect(rows().at(-1)).toMatchObject({ job: "offsite-verify", status: "fail" });
    expect(rows().at(-1).error).toMatch(/downloaded sha256/);

    fs.writeFileSync(obj, good);
    fs.writeFileSync(env.OFFSITE_KEY_FILE, "W".repeat(43), { mode: 0o600 });
    const k = runScript(["--verify-only"]);
    expect(k.status).toBe(1);
    expect(rows().at(-1).error).toMatch(/gpg decrypt/);
  });

  it("refuses a group-readable key", () => {
    fs.mkdirSync(path.dirname(env.OFFSITE_KEY_FILE), { recursive: true });
    fs.writeFileSync(env.OFFSITE_KEY_FILE, "K".repeat(43), { mode: 0o644 });
    fs.chmodSync(env.OFFSITE_KEY_FILE, 0o644);
    const r = runScript(["--dir", env.DIR_ARGS]);
    expect(r.status).toBe(1);
    expect(rows()[0]).toMatchObject({ status: "fail", error_class: "key", offsite_status: "fail" });
  });
});
