// G15-R2 — shared helpers for the plain-node ops crons (error-digest,
// latency-sample). No dependencies. Mirrors cron-runner.sh: an exported env
// var wins, otherwise the single key is pulled out of web/.env /
// web/.env.runtime without sourcing the (not-shell-safe) file. The bot token
// is never logged and never written to a report file.

import { appendFileSync, closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const WEB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Read one key from the gitignored env files (exported env wins). */
export function envVal(key, env = process.env, webDir = WEB_DIR) {
  if (env[key]) return String(env[key]);
  for (const f of [".env", ".env.runtime"]) {
    try {
      const raw = readFileSync(path.join(webDir, f), "utf8");
      const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${key}=`));
      if (line) return line.slice(key.length + 1).replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    } catch {
      // file absent — keep looking
    }
  }
  return "";
}

/**
 * Send a Telegram message through the same bot/chat the cron fleet uses
 * (TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID). Returns {sent, reason?}. Never
 * throws, never logs the token. `dryRun` short-circuits before any network.
 */
export async function sendTelegram(text, { dryRun = false, env = process.env, fetchImpl = globalThis.fetch, timeoutMs = 8000 } = {}) {
  if (dryRun) return { sent: false, reason: "dry_run" };
  const token = envVal("TELEGRAM_BOT_TOKEN", env);
  const chat = envVal("TELEGRAM_CHAT_ID", env);
  if (!token || !chat) return { sent: false, reason: "not_configured" };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { sent: false, reason: `http_${res.status}` };
    return { sent: true };
  } catch (err) {
    return { sent: false, reason: err instanceof Error ? err.name : "error" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Advisory lock via an O_EXCL lock file holding the owner pid — the
 * plain-node equivalent of `flock -n`. Returns a release() function, or null
 * when another live process holds it. A lock left by a dead pid is reclaimed.
 */
export function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(lockPath, "wx");
      closeSync(fd);
      writeFileSync(lockPath, String(process.pid));
      return () => {
        try {
          unlinkSync(lockPath);
        } catch {
          // already gone
        }
      };
    } catch (err) {
      if (!(err && err.code === "EEXIST")) throw err;
      let pid = NaN;
      try {
        pid = Number(readFileSync(lockPath, "utf8").trim());
      } catch {
        // unreadable → treated as stale below
      }
      if (Number.isFinite(pid) && pid > 0 && pid !== process.pid && isAlive(pid)) return null;
      try {
        unlinkSync(lockPath);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return Boolean(err && err.code === "EPERM");
  }
}

/** Append one JSON line (creates the parent dir + file). */
export function appendJsonl(file, row) {
  mkdirSync(path.dirname(file), { recursive: true });
  appendFileSync(file, JSON.stringify(row) + "\n");
}

/** Read a JSON file; `fallback` when missing or malformed. */
export function readJson(file, fallback) {
  try {
    return JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

/** Atomic JSON write (tmp + rename) so a reader never sees a half file. */
export function writeJsonAtomic(file, value) {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + "\n");
  renameSync(tmp, file);
}
