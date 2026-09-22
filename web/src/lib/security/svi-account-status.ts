import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

export const ACCOUNT_STATUS_PATH = "/api/internal/svi/account-status";
export const REQUEST_DOMAIN = "blockid-svi-account-status-v1\0https://blockid.au\0POST\0/api/internal/svi/account-status\0";
export const RESPONSE_DOMAIN = "blockid-svi-account-status-response-v1\0https://startupvalueindex.com\0";
export interface StatusRequest { v: 1; uid: string; iat: number; nonce: string }
export function accountStatusMac(key: string, domain: string, body: string): string {
  return createHmac("sha256", key).update(domain).update(body).digest("hex");
}
export function verifyAccountStatusRequest(raw: string, signature: string | null, key: string, now: number): StatusRequest | null {
  if (key.length < 32 || !signature || !/^[a-f0-9]{64}$/.test(signature) || Buffer.byteLength(raw) > 512) return null;
  if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(accountStatusMac(key, REQUEST_DOMAIN, raw), "hex"))) return null;
  try {
    const value = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).sort().join(",") !== "iat,nonce,uid,v") return null;
    if (value.v !== 1 || typeof value.uid !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value.uid) || !Number.isSafeInteger(value.iat) || Math.abs(now - value.iat) > 30 || typeof value.nonce !== "string" || !/^[a-f0-9]{32}$/.test(value.nonce)) return null;
    return value;
  } catch { return null; }
}
/** Account closure differs from pending deletion and PII-only anonymization. */
export function accountRowActive(row: { id?: unknown; deleted_at?: unknown; erased_at?: unknown } | null, uid: string): boolean {
  return !!row && row.id === uid && row.deleted_at === null && row.erased_at === null;
}
/** Bound both bytes and elapsed read time, including requests without Content-Length. */
export async function readAccountStatusBody(req: Request): Promise<string> {
  const length = req.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > 512)) throw new Error("invalid_body");
  const reader = req.body?.getReader();
  if (!reader) throw new Error("invalid_body");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("body_timeout")), 2000); });
  try {
    const parts: Uint8Array[] = []; let size = 0;
    while (true) {
      const part = await Promise.race([reader.read(), timeout]);
      if (part.done) break;
      size += part.value.byteLength;
      if (size > 512) throw new Error("invalid_body");
      parts.push(part.value);
    }
    return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(parts));
  } finally {
    clearTimeout(timer);
    void reader.cancel().catch(() => {});
  }
}
