// LinkedIn-import attestation — G14-review (S37 P1).
//
// POST /api/founder-profile/import-linkedin parses the founder's "Save to
// PDF" export and returns a prefill; nothing is stored (data principle).
// The founder then saves through POST /api/founder-profile with
// `execution_source[field] = "linkedin_parser"` — and that stamp is what
// lifts the self-reported cap (lib/founder/execution.ts, cap 70). A stamp
// the CLIENT chooses is not evidence: any founder could POST
// `execution_source: { years_in_domain: "linkedin_parser" }` and lift their
// own cap without ever uploading a PDF.
//
// So the import route mints an HMAC attestation over what the parser
// actually read (years in domain + prior employers) for THIS user, with a
// short TTL, and the save route stamps `linkedin_parser` only on a field
// whose saved value matches the attested one (lib/founder/execution-
// provenance.ts). Pure `node:crypto`; no `server-only` so the route tests
// mint + verify without a Next runtime. Secret = the same stable server
// secret the report download links use (first-analysis/download-token.ts).

import { createHmac, timingSafeEqual } from "node:crypto";

export const LINKEDIN_ATTESTATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 h — the form is saved in the same sitting

export interface LinkedInAttestationClaims {
  years_in_domain: number | null;
  prev_employers: string[];
}

export function attestationSecret(env: NodeJS.ProcessEnv = process.env): string | null {
  const v = env.REPORT_LINK_SECRET || env.OAUTH_TOKEN_ENCRYPTION_KEY || env.CRON_SECRET;
  return typeof v === "string" && v.trim().length >= 16 ? v.trim() : null;
}

/** Lower-cased, trimmed, de-duplicated, sorted — order and case never matter. */
export function canonicalEmployers(list: readonly string[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const e of list ?? []) {
    const n = String(e ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    if (n) set.add(n);
  }
  return [...set].sort();
}

function encodeEmployers(list: string[]): string {
  return Buffer.from(list.join("\n"), "utf8").toString("base64url");
}

function decodeEmployers(s: string): string[] | null {
  if (s === "") return [];
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const raw = Buffer.from(s, "base64url").toString("utf8");
  return raw ? raw.split("\n") : [];
}

function sign(secret: string, userId: string, exp: number, years: string, employers: string): string {
  return createHmac("sha256", secret).update(`${userId}|${exp}|${years}|${employers}`, "utf8").digest("base64url");
}

/**
 * `exp.years.employersB64.sig` — self-describing so verify() can hand the
 * claims back. Null when no secret is configured (the cap then simply stays
 * on until an evaluator checks references — never a forged lift).
 */
export function mintLinkedInAttestation(
  userId: string,
  claims: LinkedInAttestationClaims,
  opts: { now?: number; ttlMs?: number; secret?: string | null } = {},
): string | null {
  const secret = opts.secret === undefined ? attestationSecret() : opts.secret;
  if (!secret || !userId) return null;
  const years = claims.years_in_domain == null ? "" : String(Math.max(0, Math.min(99, Math.round(claims.years_in_domain))));
  const employers = encodeEmployers(canonicalEmployers(claims.prev_employers));
  const exp = (opts.now ?? Date.now()) + (opts.ttlMs ?? LINKEDIN_ATTESTATION_TTL_MS);
  return `${exp}.${years}.${employers}.${sign(secret, userId, exp, years, employers)}`;
}

export type AttestationVerdict = { ok: true; claims: LinkedInAttestationClaims } | { ok: false; reason: "no_secret" | "malformed" | "mismatch" | "expired" };

export function verifyLinkedInAttestation(
  userId: string,
  token: unknown,
  opts: { now?: number; secret?: string | null } = {},
): AttestationVerdict {
  const secret = opts.secret === undefined ? attestationSecret() : opts.secret;
  if (!secret) return { ok: false, reason: "no_secret" };
  if (typeof token !== "string" || token.length > 4096 || !userId) return { ok: false, reason: "malformed" };
  const parts = token.split(".");
  if (parts.length !== 4) return { ok: false, reason: "malformed" };
  const [expRaw, years, employers, sig] = parts as [string, string, string, string];
  const exp = Number.parseInt(expRaw, 10);
  if (!Number.isFinite(exp) || !sig || (years !== "" && !/^\d{1,2}$/.test(years))) return { ok: false, reason: "malformed" };
  const decoded = decodeEmployers(employers);
  if (decoded === null) return { ok: false, reason: "malformed" };
  const expected = sign(secret, userId, exp, years, employers);
  const a = Buffer.from(sig, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "mismatch" };
  if ((opts.now ?? Date.now()) > exp) return { ok: false, reason: "expired" };
  return { ok: true, claims: { years_in_domain: years === "" ? null : Number(years), prev_employers: decoded } };
}
