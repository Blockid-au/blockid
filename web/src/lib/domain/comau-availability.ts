// .com.au domain availability probe — Phase 1 P0 gap.
//
// Reference: docs/plans/atlassian-standard-mapping-goal.md §1 phase 1
// ("Missing: .com.au availability check"). Spun off as P1a-comau-availability.
//
// Two independent capabilities:
//   1. `validateComAuLabel(label)` — pure, offline. Enforces the syntactic
//      subset of auDA's `.com.au` naming policy (2005-01 policy, most-recent
//      2022 auDA Licensing Rules) that we can check without a registrar
//      contract: length 2-63, [a-z0-9-]+, no leading/trailing hyphen, no
//      double-hyphen at positions 3-4 unless the label is an IDN (xn--...).
//      NOT enforced here: entity-eligibility rules ("close and substantial
//      connection to the licence holder"), trademark checks, reserved-word
//      lists — those still need auDA / an accredited registrar.
//   2. `checkComAuRegistration(fqdn)` — Node DNS probe. If any SOA/NS
//      record resolves, the label is *registered* (may not resolve to a
//      website yet, but the delegation exists). If DNS returns
//      NXDOMAIN / ENODATA / ENOTFOUND, the label is *likely available*
//      but the founder still needs a registrar to confirm because auDA
//      can hold a reserved / suspended registration without DNS.
//
// Boundary: this is factual information (validity + delegation status),
// not personal advice. No AFSL disclaimer needed. Callers surfacing the
// probe into an onboarding flow should still make it clear that only an
// accredited registrar can guarantee availability.

import { promises as dns } from "node:dns";

export const COMAU_MAX_LABEL_LENGTH = 63;
export const COMAU_MIN_LABEL_LENGTH = 2;

export type ComAuLabelInvalidReason =
  | "empty"
  | "too_short"
  | "too_long"
  | "illegal_chars"
  | "leading_hyphen"
  | "trailing_hyphen"
  | "consecutive_hyphens_non_idn";

export interface ComAuLabelValidation {
  label: string;
  valid: boolean;
  reasons: ComAuLabelInvalidReason[];
}

/**
 * Strip a `.com.au` / `.au` suffix, lowercase, and remove surrounding whitespace.
 * Returns an empty string when the input is nullish so downstream validators
 * can flag it as `empty` rather than throwing.
 */
export function normalizeComAuLabel(input: string | null | undefined): string {
  if (!input) return "";
  let label = String(input).trim().toLowerCase();
  if (label.endsWith(".com.au")) {
    label = label.slice(0, -".com.au".length);
  } else if (label.endsWith(".au")) {
    label = label.slice(0, -".au".length);
  }
  return label;
}

/**
 * Validate a `.com.au` second-level label against the syntactic subset of
 * auDA's naming policy that can be enforced without a registrar contract.
 */
export function validateComAuLabel(input: string | null | undefined): ComAuLabelValidation {
  const label = normalizeComAuLabel(input);
  const reasons: ComAuLabelInvalidReason[] = [];

  if (!label) {
    return { label, valid: false, reasons: ["empty"] };
  }
  if (label.length < COMAU_MIN_LABEL_LENGTH) reasons.push("too_short");
  if (label.length > COMAU_MAX_LABEL_LENGTH) reasons.push("too_long");
  if (!/^[a-z0-9-]+$/.test(label)) reasons.push("illegal_chars");
  if (label.startsWith("-")) reasons.push("leading_hyphen");
  if (label.endsWith("-")) reasons.push("trailing_hyphen");
  // auDA reserves `xx--...` in positions 3-4 for Internationalised Domain
  // Names (RFC 5891 ACE prefix `xn--`). Any other double-hyphen at that
  // position is disallowed.
  if (label.length >= 4 && label[2] === "-" && label[3] === "-" && !label.startsWith("xn--")) {
    reasons.push("consecutive_hyphens_non_idn");
  }

  return { label, valid: reasons.length === 0, reasons };
}

/** Return `<label>.com.au` for a validated label, or null if the label is invalid. */
export function formatComAuFqdn(input: string | null | undefined): string | null {
  const { label, valid } = validateComAuLabel(input);
  return valid ? `${label}.com.au` : null;
}

export type ComAuRegistrationStatus =
  | "likely-available"
  | "likely-registered"
  | "invalid"
  | "probe_error";

export interface ComAuRegistrationResult {
  fqdn: string | null;
  status: ComAuRegistrationStatus;
  evidence: {
    soa_records: number;
    ns_records: number;
  };
  probe_error: string | null;
  disclaimer: string;
}

const REGISTRAR_DISCLAIMER =
  "DNS probe only — only an auDA-accredited registrar can guarantee availability. `likely-registered` includes reserved / suspended registrations that still delegate DNS.";

/**
 * DNS-based registration probe. Uses SOA + NS resolution so parked
 * domains (no A/AAAA record) are still detected as registered.
 *
 * Callers can inject `resolver` for unit tests.
 */
export async function checkComAuRegistration(
  input: string | null | undefined,
  resolver: {
    resolveSoa: (fqdn: string) => Promise<unknown>;
    resolveNs: (fqdn: string) => Promise<string[]>;
  } = dns,
): Promise<ComAuRegistrationResult> {
  const fqdn = formatComAuFqdn(input);
  if (!fqdn) {
    return {
      fqdn: null,
      status: "invalid",
      evidence: { soa_records: 0, ns_records: 0 },
      probe_error: null,
      disclaimer: REGISTRAR_DISCLAIMER,
    };
  }

  let soaCount = 0;
  let nsCount = 0;
  let probeError: string | null = null;

  try {
    await resolver.resolveSoa(fqdn);
    soaCount = 1;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (!isNotFoundCode(code)) probeError = code || String(err);
  }

  try {
    const ns = await resolver.resolveNs(fqdn);
    nsCount = Array.isArray(ns) ? ns.length : 0;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? "";
    if (!isNotFoundCode(code) && !probeError) probeError = code || String(err);
  }

  if (soaCount > 0 || nsCount > 0) {
    return {
      fqdn,
      status: "likely-registered",
      evidence: { soa_records: soaCount, ns_records: nsCount },
      probe_error: null,
      disclaimer: REGISTRAR_DISCLAIMER,
    };
  }
  if (probeError) {
    return {
      fqdn,
      status: "probe_error",
      evidence: { soa_records: 0, ns_records: 0 },
      probe_error: probeError,
      disclaimer: REGISTRAR_DISCLAIMER,
    };
  }
  return {
    fqdn,
    status: "likely-available",
    evidence: { soa_records: 0, ns_records: 0 },
    probe_error: null,
    disclaimer: REGISTRAR_DISCLAIMER,
  };
}

function isNotFoundCode(code: string): boolean {
  return code === "ENOTFOUND" || code === "ENODATA" || code === "NXDOMAIN";
}
