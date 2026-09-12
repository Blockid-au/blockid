// Valuation certificate (S22-A) — the public verification answer.
//
// What an investor (or anyone with the number) may learn from
// /verify/valuation/[no] and GET /api/verify/valuation/[no]: whether the
// number exists, the startup name, the issue date, whether the stored
// payload still hashes to the stored content hash (and, when the caller
// supplies the hash printed on their PDF, whether THAT matches), and
// whether the certificate has been revoked. Never the valuation figures —
// those stay with whoever the founder gave the PDF to.
//
// Pure apart from the one register read; the colocated suite drives it
// with `fakeSupabase`.

import { certificateHashMatches, isCertificateNo } from "./hash";
import { findCertificateByNo, type CertificateDb, type ValuationCertificateRow } from "./server";

export type VerifyStatus = "valid" | "revoked" | "hash_mismatch";

export type VerifyAnswer =
  | { found: false; certificateNo: string }
  | {
      found: true;
      status: VerifyStatus;
      certificateNo: string;
      startupName: string;
      issuedAt: string;
      contentHash: string;
      /** Stored payload re-hashes to the stored content hash. */
      storedHashMatch: boolean;
      /** When the caller passed `?hash=`: does it equal the stored hash? Null when not supplied. */
      suppliedHashMatch: boolean | null;
      revoked: boolean;
      revokedAt: string | null;
      revokedReason: string | null;
      /** Certificate format version (payload.version). */
      version: string | null;
    };

export function answerFor(row: ValuationCertificateRow | null, certificateNo: string, suppliedHash?: string | null): VerifyAnswer {
  if (!row) return { found: false, certificateNo };
  const storedHashMatch = row.payload ? certificateHashMatches(row.payload, row.content_hash) : false;
  const supplied = (suppliedHash ?? "").trim().toLowerCase();
  const suppliedHashMatch = supplied ? supplied === row.content_hash.toLowerCase() : null;
  const revoked = Boolean(row.revoked_at);
  const status: VerifyStatus = !storedHashMatch ? "hash_mismatch" : revoked ? "revoked" : "valid";
  return {
    found: true,
    status,
    certificateNo: row.certificate_no,
    startupName: row.startup_name,
    issuedAt: row.issued_at,
    contentHash: row.content_hash,
    storedHashMatch,
    suppliedHashMatch,
    revoked,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
    version: row.payload?.version ?? null,
  };
}

/** Normalise user input: trim, upper-case, tolerate a missing "VC-" prefix or lower case. */
export function normaliseCertificateNo(raw: string): string | null {
  let v = decodeURIComponent(raw ?? "").trim().toUpperCase();
  if (/^[0-9A-Z]{5}-[0-9A-Z]{5}$/.test(v)) v = `VC-${v}`;
  return isCertificateNo(v) ? v : null;
}

export async function verifyCertificate(db: CertificateDb | null, rawNo: string, suppliedHash?: string | null): Promise<VerifyAnswer> {
  const no = normaliseCertificateNo(rawNo);
  if (!no) return { found: false, certificateNo: (rawNo ?? "").slice(0, 40) };
  if (!db) return { found: false, certificateNo: no };
  const row = await findCertificateByNo(db, no);
  return answerFor(row, no, suppliedHash);
}
