// s708(8) Corporations Act 2001 — sophisticated / wholesale investor
// certificate intake.
//
// A qualified accountant may certify that an investor meets ONE of:
//   - Net assets ≥ A$2.5 million; OR
//   - Gross income ≥ A$250,000 per year for the preceding two years.
// (see Corporations Regulations 6D.2.03)
//
// Certificates are valid for two years from the certificate date. Founders
// must have a current cert on file BEFORE receiving investment under a
// wholesale-only round; if it lapses, the round loses its s708 disclosure
// exemption and the offer becomes a retail offer requiring a full PDS.
//
// ASIC ref (retrieved 2026):
//   https://asic.gov.au/regulatory-resources/financial-services/giving-financial-product-advice/wholesale-and-retail-clients-adviser-obligations/
//
// This module intentionally does NOT verify the accountant's registration
// or authenticate the PDF — that is out of scope for the founder tool. It
// captures metadata + optional evidence URL for the data room.

export const S708_DISCLAIMER =
  "Not legal advice — verify the certifying accountant is a member of a Professional Accounting Body (CA/CPA/IPA) and the certificate meets Corporations Regulations 6D.2.03 before relying on the s708(8) exemption.";

export type S708CertType = "net_assets" | "gross_income";

export interface S708CertInput {
  investor_email: string;
  certifying_accountant_name: string;
  certifying_accountant_firm: string;
  cert_type: S708CertType;
  /** ISO date (YYYY-MM-DD) the accountant signed the certificate. */
  cert_date: string;
  /** Optional — if omitted we compute cert_date + 2 years. */
  expiry_date?: string;
  /** URL to the stored PDF / image evidence (data room). */
  evidence_url?: string;
}

export type S708CertStatus = "valid" | "expiring_soon" | "expired";

export interface S708CertRecord {
  id?: string;
  investor_email: string;
  certifying_accountant_name: string;
  certifying_accountant_firm: string;
  cert_type: S708CertType;
  cert_date: string;
  expiry_date: string;
  evidence_url: string | null;
  status: S708CertStatus;
  days_to_expiry: number;
}

/** Add whole years to an ISO date, keeping day-of-month where possible. */
export function addYearsIso(iso: string, years: number): string {
  const d = new Date(iso + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) {
    throw new Error(`Invalid ISO date: ${iso}`);
  }
  const year = d.getUTCFullYear() + years;
  const month = d.getUTCMonth();
  const day = d.getUTCDate();
  const shifted = new Date(Date.UTC(year, month, day));
  return shifted.toISOString().slice(0, 10);
}

const EXPIRING_SOON_DAYS = 60;

export function classifyCert(
  cert_date: string,
  expiry_date: string,
  now: Date = new Date(),
): { status: S708CertStatus; days_to_expiry: number } {
  const expiry = new Date(expiry_date + "T00:00:00Z");
  const nowUtc = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const days = Math.round(
    (expiry.getTime() - nowUtc.getTime()) / (24 * 60 * 60 * 1000),
  );
  let status: S708CertStatus;
  if (days < 0) status = "expired";
  else if (days <= EXPIRING_SOON_DAYS) status = "expiring_soon";
  else status = "valid";
  return { status, days_to_expiry: days };
}

/**
 * Validate the input, compute the expected expiry (with 1-day tolerance
 * against a caller-provided expiry_date), and return the normalised
 * record. Throws on structural errors.
 */
export function normaliseCert(
  input: S708CertInput,
  now: Date = new Date(),
): S708CertRecord {
  if (!input.investor_email?.includes("@")) {
    throw new Error("investor_email must be a valid email");
  }
  if (!input.certifying_accountant_name?.trim()) {
    throw new Error("certifying_accountant_name required");
  }
  if (!input.certifying_accountant_firm?.trim()) {
    throw new Error("certifying_accountant_firm required");
  }
  if (input.cert_type !== "net_assets" && input.cert_type !== "gross_income") {
    throw new Error("cert_type must be 'net_assets' or 'gross_income'");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.cert_date)) {
    throw new Error("cert_date must be ISO YYYY-MM-DD");
  }

  const expectedExpiry = addYearsIso(input.cert_date, 2);
  let expiryDate = input.expiry_date ?? expectedExpiry;
  if (input.expiry_date) {
    const provided = new Date(input.expiry_date + "T00:00:00Z").getTime();
    const expected = new Date(expectedExpiry + "T00:00:00Z").getTime();
    if (Math.abs(provided - expected) > 24 * 60 * 60 * 1000) {
      throw new Error(
        `expiry_date ${input.expiry_date} is not within 1 day of the s708 2-year cap (${expectedExpiry})`,
      );
    }
    expiryDate = input.expiry_date;
  }

  const { status, days_to_expiry } = classifyCert(
    input.cert_date,
    expiryDate,
    now,
  );

  return {
    investor_email: input.investor_email,
    certifying_accountant_name: input.certifying_accountant_name.trim(),
    certifying_accountant_firm: input.certifying_accountant_firm.trim(),
    cert_type: input.cert_type,
    cert_date: input.cert_date,
    expiry_date: expiryDate,
    evidence_url: input.evidence_url ?? null,
    status,
    days_to_expiry,
  };
}

/**
 * Roll up a set of certs — used by the panel and the nudge engine.
 * Returns whether the founder has at least one valid or expiring cert
 * (both count as "on file"; only fully-expired means the raise is blocked).
 */
export function summariseCerts(records: S708CertRecord[]): {
  total: number;
  valid: number;
  expiring_soon: number;
  expired: number;
  has_valid_or_expiring: boolean;
} {
  const summary = {
    total: records.length,
    valid: 0,
    expiring_soon: 0,
    expired: 0,
    has_valid_or_expiring: false,
  };
  for (const r of records) {
    summary[r.status] += 1;
  }
  summary.has_valid_or_expiring =
    summary.valid > 0 || summary.expiring_soon > 0;
  return summary;
}
